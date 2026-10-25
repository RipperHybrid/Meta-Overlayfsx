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

                # Only act if the module actually exists in /data/adb/modules/
                if [ -d "$MODULE_REAL_DIR" ]; then
                    # Give the module back any overlay content that exists only in the image,
                    # so it still works if the user re-enables it without this metamodule.
                    # Existing files are never overwritten.
                    for part in system vendor product system_ext odm oem; do
                        if [ -d "$module_dir/$part" ] && [ ! -e "$MODULE_REAL_DIR/$part" ]; then
                            cp -a "$module_dir/$part" "$MODULE_REAL_DIR/$part" 2>/dev/null \
                                || rm -rf "$MODULE_REAL_DIR/$part"
                        fi
                    done

                    # Modules are disabled (not removed) to avoid surprises after the switch.
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
