#!/bin/bash
set -e

# Configuration
VERSION=$(grep '^version' Cargo.toml | head -1 | sed 's/.*"\(.*\)".*/\1/')
OUTPUT_DIR="target"
METAMODULE_DIR="metamodule"
MODULE_PROP_FILE="$METAMODULE_DIR/module.prop"
MODULE_OUTPUT_DIR="$OUTPUT_DIR/module"

MODULE_VERSION=$(grep -m1 '^version=' "$MODULE_PROP_FILE" | cut -d'=' -f2- | tr -d '\r')
MODULE_VERSION_CODE=$(grep -m1 '^versionCode=' "$MODULE_PROP_FILE" | cut -d'=' -f2- | tr -d '\r')

if [ -z "$MODULE_VERSION" ] || [ -z "$MODULE_VERSION_CODE" ]; then
    echo "Error: Failed to read module version information from $MODULE_PROP_FILE"
    exit 1
fi

echo "=========================================="
echo "Building meta-overlayfsx v${VERSION}"
echo "=========================================="

# Detect build tool
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

# Clean output directory
echo "Cleaning output directory..."
rm -rf "$OUTPUT_DIR"
mkdir -p "$MODULE_OUTPUT_DIR"

# Build for multiple architectures
echo ""
echo "Building for aarch64-linux-android..."
if [ "$BUILD_TOOL" = "cross" ]; then
    cross build --release --target aarch64-linux-android
else
    cargo ndk build -t arm64-v8a --release
fi

echo ""
echo "Building for x86_64-linux-android..."
if [ "$BUILD_TOOL" = "cross" ]; then
    cross build --release --target x86_64-linux-android
else
    cargo ndk build -t x86_64 --release
fi

# Copy binaries
echo ""
echo "Copying binaries..."
cp target/aarch64-linux-android/release/meta-overlayfsx \
   "$MODULE_OUTPUT_DIR/meta-overlayfsx-aarch64"
cp target/x86_64-linux-android/release/meta-overlayfsx \
   "$MODULE_OUTPUT_DIR/meta-overlayfsx-x86_64"

# Copy metamodule files
echo "Copying metamodule files..."
cp "$METAMODULE_DIR"/module.prop "$MODULE_OUTPUT_DIR/"
cp "$METAMODULE_DIR"/*.sh "$MODULE_OUTPUT_DIR/"
cp -r "$METAMODULE_DIR"/webroot "$MODULE_OUTPUT_DIR/"


# Set permissions
echo "Setting permissions..."
chmod 755 "$MODULE_OUTPUT_DIR"/*.sh
chmod 755 "$MODULE_OUTPUT_DIR"/meta-overlayfsx-*

# Display binary sizes
echo ""
echo "Binary sizes:"
echo "  aarch64: $(du -h "$MODULE_OUTPUT_DIR"/meta-overlayfsx-aarch64 | awk '{print $1}')"
echo "  x86_64:  $(du -h "$MODULE_OUTPUT_DIR"/meta-overlayfsx-x86_64 | awk '{print $1}')"

echo ""
echo "=========================================="
echo "Build completed successfully!"
echo "Files located in: $MODULE_OUTPUT_DIR"
echo "=========================================="