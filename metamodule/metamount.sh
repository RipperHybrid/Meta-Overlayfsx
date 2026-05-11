#!/system/bin/sh
############################################
# overlayfsx metamount.sh
# Module mount handler for dual-directory mounting
############################################

# Force canonical symlink path to prevent VFS double-mount collisions
META_DIR="/data/adb/metamodule"

. "$META_DIR"/utils.sh || exit 1
IMG_FILE="$META_DIR/modules.img"
MNT_DIR="$META_DIR/mnt"
RW_ROOT="/data/adb/modules/.rw"
PARTITIONS="system vendor product system_ext odm oem"
MODULE_METADATA_DIR="/data/adb/modules"
LOG_FILE="$META_DIR/overlayfsx.log"

log INFO "Starting module mount process"

# Ensure ext4 image is mounted
if ! mountpoint -q "$MNT_DIR" 2>/dev/null; then
    log INFO "Image not mounted, mounting now..."

    if [ ! -f "$IMG_FILE" ]; then
        log ERROR "Image file not found at $IMG_FILE"
        exit 1
    fi

    mkdir -p "$MNT_DIR"
    chcon u:object_r:ksu_file:s0 "$IMG_FILE" 2>/dev/null
    mount -t ext4 -o loop,rw,noatime "$IMG_FILE" "$MNT_DIR" || {
        log ERROR "Failed to mount image"
        exit 1
    }
    log INFO "Image mounted successfully at $MNT_DIR"
else
    log INFO "Image already mounted at $MNT_DIR"
fi

# Binary path
BINARY="$META_DIR/overlayfsx"

if [ ! -f "$BINARY" ]; then
    log ERROR "Binary not found: $BINARY"
    exit 1
fi

# Apply staged updates from the ext4 image before generating the mount tree
log INFO "Applying pending module updates in image..."
for update_dir in "$MNT_DIR"/*_update; do
    if [ -d "$update_dir" ]; then
        original_dir="${update_dir%_update}"
        MODULE_NAME=$(basename "$original_dir")
        log INFO "Swapping staged update for: $MODULE_NAME"

        # Atomic swap: Delete old live module and rename the update
        rm -rf "$original_dir"
        mv "$update_dir" "$original_dir"
    fi
done

# Cleanup orphaned/skip_mount modules from image
log INFO "Checking for orphaned modules and skip_mount flags..."
REMOVED_COUNT=0

for module_dir in "$MNT_DIR"/*; do
    if [ ! -d "$module_dir" ] || [ "$(basename "$module_dir")" = "lost+found" ] || echo "$module_dir" | grep -q "_update$"; then
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
        log INFO "Removing $REMOVE_REASON module from image: $MODULE_NAME"
        rm -rf "$module_dir"
        REMOVED_COUNT=$((REMOVED_COUNT + 1))
    fi
done

if [ $REMOVED_COUNT -gt 0 ]; then
    log INFO "Removed $REMOVED_COUNT module(s) from image"
else
    log INFO "No modules to remove from image"
fi

# Apply SELinux contexts for .rw partition structures
if [ -d "$RW_ROOT" ]; then
    log INFO "Applying SELinux contexts for RW partition structures"

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

# Execute the mount binary and inject its output directly into the unified log file
"$BINARY" >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    log ERROR "Mount failed with exit code $EXIT_CODE"
    exit $EXIT_CODE
fi

# Retrieve live mount JSON data to update the module.prop description dynamically
log INFO "Analyzing mount state to update UI description..."
INSPECT_JSON=$("$BINARY" inspect -r 2>/dev/null)

if echo "$INSPECT_JSON" | grep -q '"status": "success"'; then
    # Parse JSON raw via grep to avoid requiring jq dependency
    MODULE_COUNT=$(echo "$INSPECT_JSON" | grep -o '"id":' | wc -l)
    CONFLICT_COUNT=$(echo "$INSPECT_JSON" | grep -o '"total_conflicted": [0-9]*' | grep -o '[0-9]*')

    HAS_CONFLICT="🟢 False"
    if [ -n "$CONFLICT_COUNT" ] && [ "$CONFLICT_COUNT" -gt 0 ]; then
        HAS_CONFLICT="☢️ True"
    fi

    NEW_DESC="📦 Modules Mounted: $MODULE_COUNT | File Conflicts: $HAS_CONFLICT | Next-Gen OverlayFS engine with real-time kernel inspection & native WebUI."

    modify_prop "description" "$NEW_DESC" "$META_DIR/module.prop"
fi

exit 0