#!/system/bin/sh
############################################
# meta-overlayfsx uninstall.sh
# Cleanup script for metamodule removal
############################################

MODDIR="${0%/*}"
. "$MODDIR"/utils.sh || exit 1
MNT_DIR="$MODDIR/mnt"

log "- Uninstalling metamodule..."

# Try to mount the image to access modules
if [ -f "$MODDIR/modules.img" ]; then
    log "- Attempting to mount image for module cleanup..."
    
    # Create mount directory
    mkdir -p "$MNT_DIR"
    
    # Try to mount
    chcon u:object_r:ksu_file:s0 "$MODDIR/modules.img" 2>/dev/null
    if mount -t ext4 -o loop,rw,noatime "$MODDIR/modules.img" "$MNT_DIR" 2>/dev/null; then
        log "- Image mounted successfully for cleanup"
        
        # Find all modules in the meta image
        MODULE_COUNT=0
        REMOVED_COUNT=0
        
        for module_dir in "$MNT_DIR"/*; do
            if [ -d "$module_dir" ] && [ "$(basename "$module_dir")" != "lost+found" ]; then
                MODULE_NAME=$(basename "$module_dir")
                MODULE_REMOVE_FLAG="/data/adb/modules/$MODULE_NAME/remove"
                MODULE_REAL_DIR="/data/adb/modules/$MODULE_NAME"
                
                MODULE_COUNT=$((MODULE_COUNT + 1))
                
                # Only remove if the module actually exists in /data/adb/modules/
                if [ -d "$MODULE_REAL_DIR" ]; then
                    log "- Disabling: $MODULE_NAME"
                    if touch "$MODULE_REMOVE_FLAG" 2>/dev/null; then
                        REMOVED_COUNT=$((REMOVED_COUNT + 1))
                    else
                        log "- Warning: Could not remove $MODULE_NAME"
                    fi
                else
                    log "- Skipping: $MODULE_NAME (not in /data/adb/modules/)"
                fi
            fi
        done
        
        log "- Found $MODULE_COUNT module(s) in image, removed $REMOVED_COUNT"
        
        # Unmount after cleanup
        umount "$MNT_DIR" 2>/dev/null || {
            log "- Warning: Failed to unmount cleanly, forcing..."
            umount -l "$MNT_DIR" 2>/dev/null
        }
        log "- Cleanup unmount complete"
    else
        log "- Warning: Could not mount image for cleanup"
        log "- Skipping module remove (image inaccessible)"
    fi
else
    log "- No modules image found, skipping module remove"
fi

# Also unmount the main mount if it exists (from metamount.sh)
if mountpoint -q "$MNT_DIR" 2>/dev/null; then
    log "- Unmounting main image mount..."
    umount "$MNT_DIR" 2>/dev/null || {
        log "- Warning: Failed to unmount main mount cleanly"
        umount -l "$MNT_DIR" 2>/dev/null
    }
fi

# Clean up mount directory
rmdir "$MNT_DIR" 2>/dev/null

if [ $REMOVED_COUNT -gt 0 ]; then
    log "- Uninstall complete"
    log "- Note: $REMOVED_COUNT dependent module(s) have been removed."
    log "- Re-enable them in KernelSU Manager after reinstalling meta-overlayfsx"
else
    log "- Uninstall complete"
    log "- No dependent modules were found/removed."
fi

exit 0