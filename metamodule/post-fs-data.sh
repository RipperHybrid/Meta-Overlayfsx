#!/system/bin/sh

LOG_FILE="/data/adb/metamodule/overlayfs.log"

# Clean up old log
rm -rf "$LOG_FILE" 2>/dev/null
