#!/system/bin/sh
############################################
# meta-overlayfsx metauninstall.sh
# Module uninstallation hook for ext4 image cleanup
############################################

MODDIR="${0%/*}"
. "$MODDIR"/utils.sh || exit 1

# Constants
MNT_DIR="/data/adb/metamodule/mnt"

if [ -z "$MODULE_ID" ]; then
    log "- Error!: MODULE_ID not provided"
    exit 1
fi

log "- Cleaning up module content from image: $MODULE_ID"

# Check if image is mounted
if ! mountpoint -q "$MNT_DIR" 2>/dev/null; then
    log "- Warning!: Image not mounted, skipping cleanup"
    exit 0
fi

# Remove module content from image
MOD_IMG_DIR="$MNT_DIR/$MODULE_ID"
if [ -d "$MOD_IMG_DIR" ]; then
    log "- Removing $MOD_IMG_DIR"
    rm -rf "$MOD_IMG_DIR" || {
        log "- Warning!: Failed to remove module content from image"
    }
    log "- Module content removed from image"
else
    log "- No module content found in image, skipping"
fi

exit 0