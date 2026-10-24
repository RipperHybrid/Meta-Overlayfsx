#!/system/bin/sh

# The image is mounted at "<module dir>/mnt" (also reachable as /data/adb/metamodule/mnt).
# Resolve it from this script's own location instead of hardcoding a module id.
MODDIR="${0%/*}"
MNT_DIR="$MODDIR/mnt"

if mountpoint -q "$MNT_DIR" 2>/dev/null && command -v ksud >/dev/null 2>&1; then
    ksud kernel nuke-ext4-sysfs "$MNT_DIR"
fi
