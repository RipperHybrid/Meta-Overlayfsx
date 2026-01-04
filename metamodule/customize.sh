#!/system/bin/sh

ui_print "- Detecting device architecture..."

# Detect architecture using ro.product.cpu.abi
ABI=$(grep_get_prop ro.product.cpu.abi)
ui_print "- Detected ABI: $ABI"

# Select the correct binary based on architecture
case "$ABI" in
    arm64-v8a)
        ARCH_BINARY="meta-overlayfsx-aarch64"
        REMOVE_BINARY="meta-overlayfsx-x86_64"
        ui_print "- Selected architecture: ARM64"
        ;;
    x86_64)
        ARCH_BINARY="meta-overlayfsx-x86_64"
        REMOVE_BINARY="meta-overlayfsx-aarch64"
        ui_print "- Selected architecture: x86_64"
        ;;
    *)
        abort "! Unsupported architecture: $ABI"
        ;;
esac

# Verify the selected binary exists
if [ ! -f "$MODPATH/$ARCH_BINARY" ]; then
    abort "! Binary not found: $ARCH_BINARY"
fi

ui_print "- Installing $ARCH_BINARY as meta-overlayfsx"

# Rename the selected binary to the generic name
mv "$MODPATH/$ARCH_BINARY" "$MODPATH/meta-overlayfsx" || abort "! Failed to rename binary"

# Remove the unused binary
rm -f "$MODPATH/$REMOVE_BINARY"

# Ensure the binary is executable
chmod 755 "$MODPATH/meta-overlayfsx" || abort "! Failed to set permissions"

ui_print "- Architecture-specific binary installed successfully"

# Create ext4 image for module content storage
IMG_FILE="$MODPATH/modules.img"
IMG_SIZE_MB=2048
EXISTING_IMG="/data/adb/modules/$MODID/modules.img"

if [ -f "$EXISTING_IMG" ]; then
    ui_print "- Reusing modules image from previous install"
    "$MODPATH/meta-overlayfsx" xcp "$EXISTING_IMG" "$IMG_FILE" || \
        abort "! Failed to copy existing modules image"

    # Preserving live_modules.txt if it exists
    EXISTING_LIVE_CONFIG="/data/adb/metamodule/live_modules.txt"
    if [ -f "$EXISTING_LIVE_CONFIG" ]; then
        ui_print "- Preserving live modules configuration"
        cp "$EXISTING_LIVE_CONFIG" "$MODPATH" || \
            ui_print "! Warning: Failed to copy live_modules.txt"
    fi
else
    ui_print "- Creating 2GB ext4 image for module storage"

    # Create sparse file (2GB logical size, 0 bytes actual)
    truncate -s ${IMG_SIZE_MB}M "$IMG_FILE" || \
        abort "! Failed to create image file"

    # Remove journal to prevent creating jbd2 sysfs node
    /system/bin/mke2fs -t ext4 -O ^has_journal -F "$IMG_FILE" >/dev/null 2>&1 || \
        abort "! Failed to format ext4 image"

    ui_print "- Image created successfully (sparse file)"
fi

ui_print "- Installation complete"