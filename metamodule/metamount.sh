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
BINARY="$META_DIR/overlayfsx"

log INFO "Starting module mount process"

# Mount the ext4 image (with automatic repair + one retry)
mount_image() {
    mkdir -p "$MNT_DIR"
    chcon u:object_r:ksu_file:s0 "$IMG_FILE" 2>/dev/null
    mount -t ext4 -o loop,rw,noatime "$IMG_FILE" "$MNT_DIR"
}

# Ensure ext4 image is mounted
if ! mountpoint -q "$MNT_DIR" 2>/dev/null; then
    log INFO "Image not mounted, mounting now..."

    if [ ! -f "$IMG_FILE" ]; then
        log ERROR "Image file not found at $IMG_FILE"
        exit 1
    fi

    # Requests from the WebUI (all need the image unmounted): restore, backup, resize.
    # Each flag is consumed first, so a failing request can never repeat on every boot.
    XCP_BIN="$BINARY"
    if [ -f "$CONF_DIR/restore_backup" ]; then
        rm -f "$CONF_DIR/restore_backup"
        log INFO "Restoring modules image from backup..."
        restore_image_backup "$IMG_FILE" || log ERROR "Restore from backup failed"
    fi
    if [ -f "$CONF_DIR/backup_now" ]; then
        rm -f "$CONF_DIR/backup_now"
        log INFO "Creating modules image backup..."
        backup_image "$IMG_FILE" || log WARN "Backup was not created"
    fi
    apply_pending_resize "$IMG_FILE"

    # Cheap when the image was cleanly unmounted; repairs it after a crash/power loss.
    fsck_image "$IMG_FILE" preen || log WARN "Image check reported problems, attempting mount anyway"

    if ! mount_image; then
        log WARN "Mount failed, running full repair and retrying once"
        fsck_image "$IMG_FILE" force
        mount_image || {
            log ERROR "Failed to mount image"
            exit 1
        }
    fi
    log INFO "Image mounted successfully at $MNT_DIR"
else
    log INFO "Image already mounted at $MNT_DIR"
fi

# The mount binary must exist (checked after the image is ready)
if [ ! -f "$BINARY" ]; then
    log ERROR "Binary not found: $BINARY"
    exit 1
fi

# --- Recover from an interrupted update swap ---------------------------------
# "<id>.old" is the previous version kept while the swap is in progress.
for old_dir in "$MNT_DIR"/*.old; do
    [ -d "$old_dir" ] || continue
    live_dir="${old_dir%.old}"
    if [ -d "$live_dir" ]; then
        log INFO "Discarding leftover backup: $(basename "$old_dir")"
        rm -rf "$old_dir"
    else
        log WARN "Interrupted swap detected, restoring: $(basename "$live_dir")"
        mv "$old_dir" "$live_dir"
    fi
done

# Apply staged updates from the ext4 image before generating the mount tree.
# The old version is renamed (not deleted) first, so a failure at any point can be rolled back.
log INFO "Applying pending module updates in image..."
for update_dir in "$MNT_DIR"/*_update; do
    [ -d "$update_dir" ] || continue
    original_dir="${update_dir%_update}"
    MODULE_NAME=$(basename "$original_dir")
    [ -n "$MODULE_NAME" ] || continue

    if [ -z "$(ls -A "$update_dir" 2>/dev/null)" ]; then
        log WARN "Staged update for $MODULE_NAME is empty, discarding it"
        rm -rf "$update_dir"
        continue
    fi

    log INFO "Swapping staged update for: $MODULE_NAME"
    if [ -d "$original_dir" ]; then
        rm -rf "$original_dir.old"
        if ! mv "$original_dir" "$original_dir.old"; then
            log ERROR "Cannot move old version of $MODULE_NAME aside, keeping it unchanged"
            continue
        fi
        if mv "$update_dir" "$original_dir"; then
            rm -rf "$original_dir.old"
        else
            log ERROR "Swap failed for $MODULE_NAME, rolling back"
            mv "$original_dir.old" "$original_dir"
        fi
    else
        mv "$update_dir" "$original_dir" || log ERROR "Failed to activate staged module $MODULE_NAME"
    fi
done
# Staging leftovers of interrupted installs are never complete: remove them.
rm -rf "$MNT_DIR"/*_update.tmp 2>/dev/null

# Cleanup orphaned/skip_mount modules from image
log INFO "Checking for orphaned modules and skip_mount flags..."

# Safety net: only trust the metadata directory when it demonstrably lists modules.
# If it is missing/empty (storage hiccup, wrong mount state) NOTHING may be deleted.
metadata_is_sane() {
    [ -d "$MODULE_METADATA_DIR" ] || return 1
    for prop_file in "$MODULE_METADATA_DIR"/*/module.prop; do
        [ -f "$prop_file" ] && return 0
    done
    return 1
}

REMOVED_COUNT=0
if metadata_is_sane; then
    CANDIDATES=""
    TOTAL_COUNT=0
    for module_dir in "$MNT_DIR"/*; do
        [ -d "$module_dir" ] || continue
        MODULE_NAME=$(basename "$module_dir")
        case "$MODULE_NAME" in
            lost+found|*_update|*_update.tmp|*.old) continue ;;
        esac
        TOTAL_COUNT=$((TOTAL_COUNT + 1))

        METADATA_PATH="$MODULE_METADATA_DIR/$MODULE_NAME"
        if [ ! -d "$METADATA_PATH" ] && [ ! -d "/data/adb/modules_update/$MODULE_NAME" ]; then
            CANDIDATES="$CANDIDATES$MODULE_NAME:orphaned
"
        elif [ -f "$METADATA_PATH/skip_mount" ]; then
            CANDIDATES="$CANDIDATES$MODULE_NAME:skip_mount
"
        fi
    done

    CANDIDATE_COUNT=$(printf '%s' "$CANDIDATES" | grep -c ':')
    if [ "$TOTAL_COUNT" -ge 2 ] && [ "$CANDIDATE_COUNT" -eq "$TOTAL_COUNT" ]; then
        # Removing every module in one go is almost certainly a bad read, not a user action.
        log WARN "All $TOTAL_COUNT modules in the image look removable - refusing to delete anything"
    else
        printf '%s' "$CANDIDATES" | while IFS=: read -r MODULE_NAME REMOVE_REASON; do
            [ -n "$MODULE_NAME" ] || continue
            log INFO "Removing $REMOVE_REASON module from image: $MODULE_NAME"
            rm -rf "$MNT_DIR/$MODULE_NAME"
        done
        REMOVED_COUNT=$CANDIDATE_COUNT
    fi
else
    log WARN "Module metadata directory looks empty/unreadable - skipping image cleanup"
fi

if [ "$REMOVED_COUNT" -gt 0 ]; then
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
