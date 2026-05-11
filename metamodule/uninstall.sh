#!/system/bin/sh
############################################
# overlayfsx uninstall.sh
# Cleanup script for metamodule removal
############################################

MODDIR="${0%/*}"
MNT_DIR="$MODDIR/mnt"

if [ -f "$MODDIR/modules.img" ]; then
    # Create mount directory
    mkdir -p "$MNT_DIR"

    chcon u:object_r:ksu_file:s0 "$MODDIR/modules.img" 2>/dev/null
    if mount -t ext4 -o loop,rw,noatime "$MODDIR/modules.img" "$MNT_DIR" 2>/dev/null; then
        # Find all modules in the meta image
        for module_dir in "$MNT_DIR"/*; do
            if [ -d "$module_dir" ] && [ "$(basename "$module_dir")" != "lost+found" ]; then
                MODULE_NAME=$(basename "$module_dir")
                MODULE_DISABLE_FLAG="/data/adb/modules/$MODULE_NAME/disable"
                MODULE_REAL_DIR="/data/adb/modules/$MODULE_NAME"

                # Only disable if the module actually exists in /data/adb/modules/
                if [ -d "$MODULE_REAL_DIR" ]; then
                    touch "$MODULE_DISABLE_FLAG" 2>/dev/null
                fi
            fi
        done

        # Unmount after cleanup
        umount "$MNT_DIR" 2>/dev/null || umount -l "$MNT_DIR" 2>/dev/null
    fi
fi

# Also unmount the main mount if it exists (from metamount.sh)
if mountpoint -q "$MNT_DIR" 2>/dev/null; then
    umount "$MNT_DIR" 2>/dev/null || umount -l "$MNT_DIR" 2>/dev/null
fi

# Clean up mount directory
rmdir "$MNT_DIR" 2>/dev/null

exit 0