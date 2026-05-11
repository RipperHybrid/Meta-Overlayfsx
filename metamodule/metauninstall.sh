#!/system/bin/sh
############################################
# overlayfsx metauninstall.sh
# Module uninstallation hook for ext4 image cleanup
############################################

MODDIR="${0%/*}"

# Constants
MNT_DIR="/data/adb/metamodule/mnt"

if [ -z "$MODULE_ID" ]; then
    exit 1
fi

# Check if image is mounted
if ! mountpoint -q "$MNT_DIR" 2>/dev/null; then
    exit 0
fi

# Remove module content from image
MOD_IMG_DIR="$MNT_DIR/$MODULE_ID"
if [ -d "$MOD_IMG_DIR" ]; then
    rm -rf "$MOD_IMG_DIR"
fi

exit 0