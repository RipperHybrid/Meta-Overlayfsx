#!/bin/bash
# Build the overlayfsx metamodule into target/module/ (and optionally a flashable zip).
#
#   ./build.sh            build only
#   ./build.sh --zip      build and create target/overlayfsx_v<version>_<code>.zip
#
# Optional environment variables:
#   BUILD_TOOL=cross|cargo-ndk   force the compiler front-end (default: auto-detect)
set -eo pipefail

# Always run from the repository root, no matter where the script is started from.
cd "$(dirname "${BASH_SOURCE[0]}")"

MAKE_ZIP=0
for arg in "$@"; do
    case "$arg" in
        --zip) MAKE_ZIP=1 ;;
        -h|--help)
            sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
            exit 0
            ;;
        *) echo "Unknown option: $arg (try --help)"; exit 1 ;;
    esac
done

MIN_RUST_MAJOR=1
MIN_RUST_MINOR=85
MIN_NODE_MAJOR=18

VERSION=$(grep '^version' Cargo.toml | head -1 | sed 's/.*"\(.*\)".*/\1/')
OUTPUT_DIR="target"
METAMODULE_DIR="metamodule"
MODULE_PROP_FILE="$METAMODULE_DIR/module.prop"
MODULE_OUTPUT_DIR="$OUTPUT_DIR/module"
WEBROOT_DIR="$METAMODULE_DIR/webroot"

die() { echo "Error: $*" >&2; exit 1; }

############################################
# 1. Environment: make rustup/cargo findable
############################################
# A fresh SSH session, a non-login shell or "sudo" often does not have ~/.cargo/bin in PATH
# even though Rust is installed. Try the usual places before giving up.
if ! command -v cargo >/dev/null 2>&1; then
    for env_file in "$HOME/.cargo/env" "/home/${SUDO_USER:-nobody}/.cargo/env" "/root/.cargo/env"; do
        if [ -f "$env_file" ]; then
            # shellcheck disable=SC1090
            . "$env_file"
            echo "Loaded Rust environment from $env_file"
            break
        fi
    done
fi

MISSING=0
need() {
    # need <command> <how to fix>
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Error: '$1' was not found in PATH." >&2
        echo "       $2" >&2
        MISSING=1
    fi
}

need cargo  "Install Rust:  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh   then:  . \"\$HOME/.cargo/env\""
need rustup "Install Rust with rustup (not with apt) - see above."
need node   "Install Node.js >= ${MIN_NODE_MAJOR} (e.g. NodeSource setup_20.x on Ubuntu)."
need npm    "npm ships with Node.js."
need git    "sudo apt install git   (needed to fetch git dependencies)"
if [ "$MAKE_ZIP" -eq 1 ]; then
    need zip "sudo apt install zip"
fi
[ "$MISSING" -eq 0 ] || exit 1

############################################
# 2. Tool versions
############################################
RUSTC_VER=$(rustc --version | awk '{print $2}')
RUST_MAJOR=${RUSTC_VER%%.*}
RUST_REST=${RUSTC_VER#*.}
RUST_MINOR=${RUST_REST%%.*}
if [ "$RUST_MAJOR" -lt "$MIN_RUST_MAJOR" ] || { [ "$RUST_MAJOR" -eq "$MIN_RUST_MAJOR" ] && [ "$RUST_MINOR" -lt "$MIN_RUST_MINOR" ]; }; then
    die "rustc $RUSTC_VER is too old (need >= ${MIN_RUST_MAJOR}.${MIN_RUST_MINOR}, edition 2024). Run: rustup update stable"
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt "$MIN_NODE_MAJOR" ]; then
    die "Node.js $(node -v) is too old (need >= ${MIN_NODE_MAJOR})."
fi

############################################
# 3. Versions must agree
############################################
MODULE_VERSION=$(grep -m1 '^version=' "$MODULE_PROP_FILE" | cut -d'=' -f2- | tr -d '\r')
MODULE_VERSION_CODE=$(grep -m1 '^versionCode=' "$MODULE_PROP_FILE" | cut -d'=' -f2- | tr -d '\r')

if [ -z "$MODULE_VERSION" ] || [ -z "$MODULE_VERSION_CODE" ]; then
    die "Failed to read module version information from $MODULE_PROP_FILE"
fi

# Cargo.toml and module.prop must describe the same release.
if [ "$VERSION" != "$MODULE_VERSION" ]; then
    die "version mismatch: Cargo.toml=$VERSION, module.prop=$MODULE_VERSION"
fi

# Windows (CRLF) line endings break shell scripts on Android.
if grep -l $'\r' "$METAMODULE_DIR"/*.sh >/dev/null 2>&1; then
    echo "Files with CRLF line endings:" >&2
    grep -l $'\r' "$METAMODULE_DIR"/*.sh >&2
    die "convert them to LF (e.g. 'sed -i \"s/\\r\$//\" metamodule/*.sh' or 'dos2unix')"
fi

# Reproducible builds: honour Cargo.lock when it is committed.
LOCKED=""
if [ -f Cargo.lock ]; then
    LOCKED="--locked"
else
    echo "Warning: Cargo.lock not found - dependency versions are not pinned. Run 'cargo generate-lockfile' and commit it."
fi

############################################
# 4. Pick the compiler front-end
############################################
container_engine() {
    # Prints the working container engine (docker/podman), or nothing.
    if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
        echo docker
    elif command -v podman >/dev/null 2>&1 && podman info >/dev/null 2>&1; then
        echo podman
    fi
}

ndk_found() {
    [ -n "${ANDROID_NDK_HOME:-}" ] && [ -d "$ANDROID_NDK_HOME" ] && return 0
    [ -n "${ANDROID_NDK_ROOT:-}" ] && [ -d "$ANDROID_NDK_ROOT" ] && return 0
    [ -n "${ANDROID_HOME:-}" ] && ls -d "$ANDROID_HOME"/ndk/* >/dev/null 2>&1 && return 0
    return 1
}

BUILD_TOOL="${BUILD_TOOL:-}"
if [ -z "$BUILD_TOOL" ]; then
    if command -v cross >/dev/null 2>&1 && [ -n "$(container_engine)" ]; then
        BUILD_TOOL="cross"
    elif command -v cargo-ndk >/dev/null 2>&1 && ndk_found; then
        BUILD_TOOL="cargo-ndk"
    fi
fi

case "$BUILD_TOOL" in
    cross)
        command -v cross >/dev/null 2>&1 || die "BUILD_TOOL=cross but 'cross' is not installed (cargo install cross --git https://github.com/cross-rs/cross --locked)"
        ENGINE=$(container_engine)
        [ -n "$ENGINE" ] || die "'cross' needs a running Docker or Podman. Check 'docker ps' (daemon running? user in the 'docker' group? re-login after usermod)."
        export CROSS_CONTAINER_ENGINE="$ENGINE"
        echo "Using cross ($ENGINE) for compilation"
        ;;
    cargo-ndk)
        command -v cargo-ndk >/dev/null 2>&1 || die "BUILD_TOOL=cargo-ndk but 'cargo-ndk' is not installed (cargo install cargo-ndk)"
        ndk_found || die "Android NDK not found. Set ANDROID_NDK_HOME to the NDK folder (e.g. export ANDROID_NDK_HOME=\$HOME/android-ndk-r27)."
        echo "Using cargo-ndk for compilation"
        ;;
    "")
        {
            echo "Error: no usable way to cross-compile was found. Pick one:"
            echo "  A) cross + Docker:  sudo apt install docker.io && sudo usermod -aG docker \$USER   (re-login)"
            echo "                      cargo install cross --git https://github.com/cross-rs/cross --locked"
            echo "  B) cargo-ndk + NDK: cargo install cargo-ndk, install the Android NDK and"
            echo "                      export ANDROID_NDK_HOME=/path/to/ndk"
            if command -v cross >/dev/null 2>&1; then
                echo "Note: 'cross' is installed but no running Docker/Podman was detected."
            fi
        } >&2
        exit 1
        ;;
    *) die "unknown BUILD_TOOL '$BUILD_TOOL' (use cross or cargo-ndk)" ;;
esac

TARGETS="aarch64-linux-android x86_64-linux-android"
for t in $TARGETS; do
    if ! rustup target list --installed | grep -qx "$t"; then
        echo "Installing Rust target $t..."
        rustup target add "$t"
    fi
done

############################################
# 5. Build
############################################
echo "=========================================="
echo "Building overlayfsx v${VERSION}"
echo "=========================================="

echo "Cleaning module output directory..."
# Only the packaged module is wiped; cargo's build cache in target/ is kept.
rm -rf "$MODULE_OUTPUT_DIR"
mkdir -p "$MODULE_OUTPUT_DIR"

echo ""
echo "Building Web UI..."
[ -d "$WEBROOT_DIR" ] || die "Webroot directory not found at $WEBROOT_DIR"
[ -f "$WEBROOT_DIR/package.json" ] || die "package.json not found in $WEBROOT_DIR"

pushd "$WEBROOT_DIR" > /dev/null
echo "Installing web dependencies..."
if [ -f package-lock.json ]; then
    npm ci
else
    echo "Warning: package-lock.json not found - using 'npm install'. Commit the generated lockfile."
    npm install
fi
echo "Bundling web assets..."
npm run build
popd > /dev/null

build_target() {
    # build_target <rust target> <cargo-ndk abi>
    echo ""
    echo "Building for $1..."
    if [ "$BUILD_TOOL" = "cross" ]; then
        cross build --release --target "$1" $LOCKED
    else
        cargo ndk -t "$2" build --release $LOCKED
    fi
    [ -f "target/$1/release/overlayfsx" ] || die "build finished but target/$1/release/overlayfsx is missing"
}

build_target aarch64-linux-android arm64-v8a
build_target x86_64-linux-android  x86_64

echo ""
echo "Copying binaries..."
cp target/aarch64-linux-android/release/overlayfsx "$MODULE_OUTPUT_DIR/overlayfsx-aarch64"
cp target/x86_64-linux-android/release/overlayfsx  "$MODULE_OUTPUT_DIR/overlayfsx-x86_64"

echo "Copying metamodule files..."
cp "$METAMODULE_DIR"/module.prop "$MODULE_OUTPUT_DIR/"
cp "$METAMODULE_DIR"/banner* "$MODULE_OUTPUT_DIR/" 2>/dev/null || true
cp "$METAMODULE_DIR"/*.sh "$MODULE_OUTPUT_DIR/"

echo "Copying bundled webroot..."
[ -d "$WEBROOT_DIR/dist" ] || die "WebUI build produced no dist/ folder"
mkdir -p "$MODULE_OUTPUT_DIR/webroot"
cp -r "$WEBROOT_DIR/dist/"* "$MODULE_OUTPUT_DIR/webroot/"

echo "Setting permissions..."
chmod 755 "$MODULE_OUTPUT_DIR"/*.sh
chmod 755 "$MODULE_OUTPUT_DIR"/overlayfsx-*

echo ""
echo "Binary sizes:"
echo "  aarch64: $(du -h "$MODULE_OUTPUT_DIR"/overlayfsx-aarch64 | awk '{print $1}')"
echo "  x86_64:  $(du -h "$MODULE_OUTPUT_DIR"/overlayfsx-x86_64 | awk '{print $1}')"

############################################
# 6. Optional zip (module.prop must sit at the zip root)
############################################
if [ "$MAKE_ZIP" -eq 1 ]; then
    ZIP_NAME="overlayfsx_v${MODULE_VERSION}_${MODULE_VERSION_CODE}.zip"
    rm -f "$OUTPUT_DIR/$ZIP_NAME"
    (cd "$MODULE_OUTPUT_DIR" && zip -r9 -q "../$ZIP_NAME" .)
    echo ""
    echo "Zip created: $OUTPUT_DIR/$ZIP_NAME ($(du -h "$OUTPUT_DIR/$ZIP_NAME" | awk '{print $1}'))"
fi

echo ""
echo "=========================================="
echo "Build completed successfully!"
echo "Files located in: $MODULE_OUTPUT_DIR"
echo "=========================================="
