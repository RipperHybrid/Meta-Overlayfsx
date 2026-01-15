#!/system/bin/sh
############################################
# meta-overlayfsx metamount.sh
# Module mount handler for dual-directory mounting
############################################

MODDIR="${0%/*}"
. "$MODDIR"/utils.sh || exit 1
IMG_FILE="$MODDIR/modules.img"
MNT_DIR="$MODDIR/mnt"
RW_ROOT="/data/adb/modules/.rw"
PARTITIONS="system vendor product system_ext odm oem"
MODULE_METADATA_DIR="/data/adb/modules"
LIVE_MODULES_FILE="/data/adb/metamodule/live_modules.txt"

log "- Starting module mount process"

# Ensure ext4 image is mounted
if ! mountpoint -q "$MNT_DIR" 2>/dev/null; then
    log "- Image not mounted, mounting now..."

    # Check if image file exists
    if [ ! -f "$IMG_FILE" ]; then
        log "- ERROR: Image file not found at $IMG_FILE"
        exit 1
    fi

    # Create mount point
    mkdir -p "$MNT_DIR"

    # Mount the ext4 image
    chcon u:object_r:ksu_file:s0 "$IMG_FILE" 2>/dev/null
    mount -t ext4 -o loop,rw,noatime "$IMG_FILE" "$MNT_DIR" || {
        log "- ERROR: Failed to mount image"
        exit 1
    }
    log "- Image mounted successfully at $MNT_DIR"
else
    log "- Image already mounted at $MNT_DIR"
fi

# Binary path (architecture-specific binary selected during installation)
BINARY="$MODDIR/meta-overlayfsx"

if [ ! -f "$BINARY" ]; then
    log "- ERROR: Binary not found: $BINARY"
    exit 1
fi

# Cleanup removed modules and modules with skip_mount from image
log "- Checking for orphaned modules and skip_mount modules..."
REMOVED_COUNT=0

for module_dir in "$MNT_DIR"/*; do
    if [ ! -d "$module_dir" ] || [ "$(basename "$module_dir")" = "lost+found" ]; then
        continue
    fi
    
    MODULE_NAME=$(basename "$module_dir")
    METADATA_PATH="$MODULE_METADATA_DIR/$MODULE_NAME"
    SHOULD_REMOVE=false
    REMOVE_REASON=""

    # Check if module still exists in metadata directory
    if [ ! -d "$METADATA_PATH" ]; then
        SHOULD_REMOVE=true
        REMOVE_REASON="orphaned"
    # Check if module has skip_mount flag
    elif [ -f "$METADATA_PATH/skip_mount" ]; then
        SHOULD_REMOVE=true
        REMOVE_REASON="skip_mount"
    fi

    if [ "$SHOULD_REMOVE" = true ]; then
        log "- Removing $REMOVE_REASON module from image: $MODULE_NAME"
        rm -rf "$module_dir"
        
        # Check and remove from live_modules.txt if present
        if [ -f "$LIVE_MODULES_FILE" ]; then
            if grep -q "^${MODULE_NAME}$" "$LIVE_MODULES_FILE"; then
                log "- Removing $MODULE_NAME from live patch config"
                sed -i "/^${MODULE_NAME}$/d" "$LIVE_MODULES_FILE"
            fi
        fi

        REMOVED_COUNT=$((REMOVED_COUNT + 1))
    fi
done

if [ $REMOVED_COUNT -gt 0 ]; then
    log "- Removed $REMOVED_COUNT module(s) from image"
else
    log "- No modules to remove from image"
fi

# Apply SELinux contexts for .rw partition structures
if [ -d "$RW_ROOT" ]; then
    log "- Applying SELinux contexts for RW partition structures"

    for part in $PARTITIONS; do
        PART_DIR="$RW_ROOT/$part"
        REFERENCE_PATH="/$part"
        if [ -d "$PART_DIR" ] && [ -e "$REFERENCE_PATH" ]; then
            chcon --reference="$REFERENCE_PATH" "$PART_DIR" 2>/dev/null
            UPPER_DIR="$PART_DIR/upperdir"
            if [ -d "$UPPER_DIR" ]; then
                chcon --reference="$PART_DIR" "$UPPER_DIR" 2>/dev/null
            fi
            WORK_DIR="$PART_DIR/workdir"
            if [ -d "$WORK_DIR" ]; then
                chcon --reference="$PART_DIR" "$WORK_DIR" 2>/dev/null
            fi
        fi
    done
fi

# Set dual-directory environment variables
export MODULE_METADATA_DIR="/data/adb/modules"
export MODULE_CONTENT_DIR="$MNT_DIR"

log "- Metadata directory: $MODULE_METADATA_DIR"
log "- Content directory: $MODULE_CONTENT_DIR"

# Log module scan before execution
log "- Scanning modules in content directory..."

if [ -d "$MODULE_CONTENT_DIR" ]; then
    for module in "$MODULE_CONTENT_DIR"/*/; do
        if [ -d "$module" ]; then
            module_name=$(basename "$module")
            metadata_path="$MODULE_METADATA_DIR/$module_name"
            
            # Check if metadata exists
            if [ ! -d "$metadata_path" ]; then
                log "- Module '$module_name': Orphaned (no metadata directory)"
                continue
            fi
            
            # Check for disable flag
            if [ -f "$metadata_path/disable" ]; then
                log "- Module '$module_name': Skipped (disabled)"
                continue
            fi
            
            # Check for skip_mount flag
            if [ -f "$metadata_path/skip_mount" ]; then
                log "- Module '$module_name': Skipped (skip_mount)"
                continue
            fi
            
            # Check if module has partition directories
            has_partition=false
            for part in $PARTITIONS; do
                if [ -d "$module/$part" ]; then
                    has_partition=true
                    break
                fi
            done
            
            if [ "$has_partition" = false ]; then
                log "- Module '$module_name': Skipped (no partition directories)"
                continue
            fi
            
            log "- Module '$module_name': Ready for mounting"
        fi
    done
else
    log "- ERROR: Content directory not found: $MODULE_CONTENT_DIR"
fi

log "- Executing $BINARY"

# Execute the mount binary
"$BINARY"
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    log "- Mount failed with exit code $EXIT_CODE"
    exit $EXIT_CODE
fi

log "- Mount completed successfully"
exit 0