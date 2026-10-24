#!/bin/bash
set -e

VERSION=$(grep '^version' Cargo.toml | head -1 | sed 's/.*"\(.*\)".*/\1/')
OUTPUT_DIR="target"
METAMODULE_DIR="metamodule"
MODULE_PROP_FILE="$METAMODULE_DIR/module.prop"
MODULE_OUTPUT_DIR="$OUTPUT_DIR/module"
WEBROOT_DIR="$METAMODULE_DIR/webroot"

MODULE_VERSION=$(grep -m1 '^version=' "$MODULE_PROP_FILE" | cut -d'=' -f2- | tr -d '\r')
MODULE_VERSION_CODE=$(grep -m1 '^versionCode=' "$MODULE_PROP_FILE" | cut -d'=' -f2- | tr -d '\r')

if [ -z "$MODULE_VERSION" ] || [ -z "$MODULE_VERSION_CODE" ]; then
    echo "Error: Failed to read module version information from $MODULE_PROP_FILE"
    exit 1
fi

# Cargo.toml and module.prop must describe the same release.
if [ "$VERSION" != "$MODULE_VERSION" ]; then
    echo "Error: version mismatch: Cargo.toml=$VERSION, module.prop=$MODULE_VERSION"
    exit 1
fi

# Reproducible builds: honour Cargo.lock when it is committed.
LOCKED=""
if [ -f Cargo.lock ]; then
    LOCKED="--locked"
else
    echo "Warning: Cargo.lock not found - dependency versions are not pinned. Run 'cargo generate-lockfile' and commit it."
fi

echo "=========================================="
echo "Building overlayfsx v${VERSION}"
echo "=========================================="

if command -v cross >/dev/null 2>&1; then
    BUILD_TOOL="cross"
    echo "Using cross for compilation"
else
    BUILD_TOOL="cargo-ndk"
    echo "Using cargo ndk for compilation"
    if ! command -v cargo-ndk >/dev/null 2>&1; then
        echo "Error: Neither cross nor cargo-ndk found!"
        echo "Please install one of them:"
        echo "  - cross: cargo install cross"
        echo "  - cargo-ndk: cargo install cargo-ndk"
        exit 1
    fi
fi

echo "Cleaning output directory..."
rm -rf "$OUTPUT_DIR"
mkdir -p "$MODULE_OUTPUT_DIR"

echo ""
echo "Building Web UI..."
if [ -d "$WEBROOT_DIR" ]; then
    pushd "$WEBROOT_DIR" > /dev/null

    if [ ! -f "package.json" ]; then
        echo "Error: package.json not found in $WEBROOT_DIR"
        exit 1
    fi

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
else
    echo "Error: Webroot directory not found at $WEBROOT_DIR"
    exit 1
fi

echo ""
echo "Building for aarch64-linux-android..."
if [ "$BUILD_TOOL" = "cross" ]; then
    cross build --release --target aarch64-linux-android $LOCKED
else
    cargo ndk -t arm64-v8a build --release $LOCKED
fi

echo ""
echo "Building for x86_64-linux-android..."
if [ "$BUILD_TOOL" = "cross" ]; then
    cross build --release --target x86_64-linux-android $LOCKED
else
    cargo ndk -t x86_64 build --release $LOCKED
fi

echo ""
echo "Copying binaries..."
cp target/aarch64-linux-android/release/overlayfsx \
   "$MODULE_OUTPUT_DIR/overlayfsx-aarch64"
cp target/x86_64-linux-android/release/overlayfsx \
   "$MODULE_OUTPUT_DIR/overlayfsx-x86_64"

echo "Copying metamodule files..."
cp "$METAMODULE_DIR"/module.prop "$MODULE_OUTPUT_DIR/"
cp "$METAMODULE_DIR"/banner* "$MODULE_OUTPUT_DIR/" 2>/dev/null || true
cp "$METAMODULE_DIR"/*.sh "$MODULE_OUTPUT_DIR/"

echo "Copying bundled webroot..."
mkdir -p "$MODULE_OUTPUT_DIR/webroot"
cp -r "$WEBROOT_DIR/dist/"* "$MODULE_OUTPUT_DIR/webroot/"

echo "Setting permissions..."
chmod 755 "$MODULE_OUTPUT_DIR"/*.sh
chmod 755 "$MODULE_OUTPUT_DIR"/overlayfsx-*

echo ""
echo "Binary sizes:"
echo "  aarch64: $(du -h "$MODULE_OUTPUT_DIR"/overlayfsx-aarch64 | awk '{print $1}')"
echo "  x86_64:  $(du -h "$MODULE_OUTPUT_DIR"/overlayfsx-x86_64 | awk '{print $1}')"

echo ""
echo "=========================================="
echo "Build completed successfully!"
echo "Files located in: $MODULE_OUTPUT_DIR"
echo "=========================================="