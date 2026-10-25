#!/system/bin/sh
############################################
# overlayfsx utils.sh
# Shared utility functions for module management
############################################

LOG_FILE="/data/adb/metamodule/overlayfsx.log"

# Unified smart logger (Handles level switching dynamically)
log() {
    if [ "$#" -eq 2 ]; then
        local level="$1"
        local msg="$2"
        echo "- $msg"
        case "$level" in
            INFO|WARN|ERROR)
                [ ! -f "$LOG_FILE" ] && touch "$LOG_FILE"
                echo "[$level overlayfsx::script] $msg" >> "$LOG_FILE"
                ;;
        esac
    else
        echo "- $1"
    fi
}

############################################
# Image safety helpers
############################################

# Persistent settings/requests live OUTSIDE the module directory, because KernelSU
# replaces the whole module directory on every update.
CONF_DIR="/data/adb/overlayfsx.d"
DEFAULT_IMG_SIZE_MB=2048
MIN_IMG_SIZE_MB=256
MAX_IMG_SIZE_MB=65536

# True if $1 is a non-empty string of digits.
is_uint() {
    case "$1" in
        ''|*[!0-9]*) return 1 ;;
    esac
    return 0
}

# Available space (KiB) on the filesystem that contains $1.
avail_kb() {
    df -Pk "$1" 2>/dev/null | awk 'NR==2 {print $4}'
}

# Size of a file in MiB (rounded down). Prints 0 if the file is missing.
file_size_mb() {
    [ -f "$1" ] || { echo 0; return; }
    echo $(( $(stat -c%s "$1" 2>/dev/null || echo 0) / 1048576 ))
}

# Run e2fsck on an UNMOUNTED image.
#   preen : fast; only does real work if the filesystem was not cleanly unmounted
#   force : full check, repairs automatically (falls back to -fy)
#   check : read-only full check, never modifies the image
# Returns 0 when the image is clean/repaired, non-zero when it is still broken.
# When e2fsck is not available the check is skipped (returns 0 with a warning).
fsck_image() {
    local img="$1" mode="${2:-preen}" rc=0
    if ! command -v e2fsck >/dev/null 2>&1; then
        log WARN "e2fsck not available, skipping filesystem check"
        return 0
    fi
    case "$mode" in
        preen) e2fsck -p "$img" >/dev/null 2>&1; rc=$? ;;
        check) e2fsck -fn "$img" >/dev/null 2>&1; rc=$? ;;
        force)
            e2fsck -fp "$img" >/dev/null 2>&1; rc=$?
            if [ "$rc" -ge 4 ]; then
                log WARN "e2fsck preen failed (rc=$rc), retrying with -fy"
                e2fsck -fy "$img" >/dev/null 2>&1; rc=$?
            fi
            ;;
    esac
    # 0 = clean, 1 = errors corrected, 2 = corrected (reboot advised; irrelevant for an image file)
    [ "$rc" -le 2 ] && return 0
    log ERROR "e2fsck ($mode) reported rc=$rc for $img"
    return 1
}

# Apply a resize request written by the WebUI ($CONF_DIR/resize_mb).
# MUST only be called while the image is NOT mounted. The request is consumed
# first, so a failing resize can never retry on every boot.
apply_pending_resize() {
    local img="$1" req_file="$CONF_DIR/resize_mb" req cur
    [ -f "$req_file" ] || return 0

    req=$(tr -dc '0-9' < "$req_file" 2>/dev/null)
    rm -f "$req_file"

    if ! is_uint "$req" || [ "$req" -lt "$MIN_IMG_SIZE_MB" ] || [ "$req" -gt "$MAX_IMG_SIZE_MB" ]; then
        log WARN "Ignoring invalid resize request (allowed: ${MIN_IMG_SIZE_MB}-${MAX_IMG_SIZE_MB} MB)"
        return 1
    fi
    if ! command -v resize2fs >/dev/null 2>&1; then
        log WARN "resize2fs not available, resize request ignored"
        return 1
    fi
    [ -f "$img" ] || return 1

    cur=$(file_size_mb "$img")
    [ "$req" -eq "$cur" ] && return 0
    log INFO "Resizing image: ${cur} MB -> ${req} MB"

    # resize2fs refuses to work on an image that was not freshly checked.
    fsck_image "$img" force || { log ERROR "Resize aborted: image check failed"; return 1; }

    if [ "$req" -gt "$cur" ]; then
        truncate -s "${req}M" "$img" || { log ERROR "Resize failed: cannot grow image file"; return 1; }
        if ! resize2fs "$img" >/dev/null 2>&1; then
            log ERROR "resize2fs failed, restoring previous file size"
            truncate -s "${cur}M" "$img"
            return 1
        fi
    else
        # Shrink: filesystem first (fails safely when data does not fit), file second.
        if ! resize2fs "$img" "${req}M" >/dev/null 2>&1; then
            log ERROR "Not enough room to shrink to ${req} MB, image left unchanged"
            return 1
        fi
        truncate -s "${req}M" "$img" || { log ERROR "Failed to truncate image after shrink"; return 1; }
    fi

    fsck_image "$img" check || { log ERROR "Image check failed after resize"; return 1; }
    log INFO "Image resized to ${req} MB"
    return 0
}

# --- Image backup / restore ---------------------------------------------------
# One backup generation is kept OUTSIDE the module directory (which KernelSU replaces on
# every update). Requests from the WebUI are plain flag files processed at boot while the
# image is not mounted, so the copy is always consistent:
#   $CONF_DIR/backup_now       -> create/refresh the backup
#   $CONF_DIR/restore_backup   -> replace the image with the backup
BACKUP_FILE="$CONF_DIR/modules.img.bak"
REPLACED_FILE="$CONF_DIR/modules.img.replaced"

# Used KiB of a (sparse) file.
used_kb() {
    du -k "$1" 2>/dev/null | awk '{print $1}'
}

# backup_image <image>   ($XCP_BIN must point to the overlayfsx binary)
# The image MUST be unmounted. The old backup is only replaced by a verified new one.
backup_image() {
    local img="$1" tmp="$BACKUP_FILE.tmp" need free
    [ -f "$img" ] || { log WARN "No image to back up"; return 1; }
    [ -x "$XCP_BIN" ] || { log WARN "xcp binary not available, backup skipped"; return 1; }
    mkdir -p "$CONF_DIR" || return 1

    need=$(used_kb "$img"); free=$(avail_kb "$CONF_DIR")
    if is_uint "$need" && is_uint "$free" && [ "$free" -lt $((need + 65536)) ]; then
        log WARN "Not enough free storage for a backup (need ~$((need / 1024)) MB, free $((free / 1024)) MB)"
        return 1
    fi

    rm -f "$tmp"
    if ! "$XCP_BIN" xcp "$img" "$tmp" --punch-hole >/dev/null 2>&1; then
        log WARN "Backup copy failed"; rm -f "$tmp"; return 1
    fi
    if ! fsck_image "$tmp" check; then
        log WARN "Backup did not pass verification and was discarded"; rm -f "$tmp"; return 1
    fi
    chmod 600 "$tmp" 2>/dev/null
    mv "$tmp" "$BACKUP_FILE" || { rm -f "$tmp"; return 1; }
    log INFO "Image backup created ($(used_kb "$BACKUP_FILE") KB used)"
    return 0
}

# restore_image_backup <image>   (image MUST be unmounted)
# The backup is verified twice (itself and the staged copy). The replaced image is kept as
# $REPLACED_FILE (one generation) so the operation can be undone by hand.
restore_image_backup() {
    local img="$1" new="$1.restore" need free
    [ -f "$BACKUP_FILE" ] || { log WARN "Restore requested but no backup exists"; return 1; }
    [ -x "$XCP_BIN" ] || { log ERROR "xcp binary not available, restore skipped"; return 1; }

    fsck_image "$BACKUP_FILE" check || { log ERROR "Backup is damaged, restore aborted (image unchanged)"; return 1; }

    need=$(used_kb "$BACKUP_FILE"); free=$(avail_kb "$(dirname "$img")")
    if is_uint "$need" && is_uint "$free" && [ "$free" -lt $((need + 65536)) ]; then
        log ERROR "Not enough free storage to restore (need ~$((need / 1024)) MB)"
        return 1
    fi

    rm -f "$new"
    if ! "$XCP_BIN" xcp "$BACKUP_FILE" "$new" >/dev/null 2>&1; then
        log ERROR "Restore copy failed (image unchanged)"; rm -f "$new"; return 1
    fi
    if ! fsck_image "$new" check; then
        log ERROR "Restored copy failed verification (image unchanged)"; rm -f "$new"; return 1
    fi

    rm -f "$REPLACED_FILE"
    if [ -f "$img" ] && ! mv "$img" "$REPLACED_FILE"; then
        log ERROR "Could not set the current image aside (image unchanged)"; rm -f "$new"; return 1
    fi
    if ! mv "$new" "$img"; then
        log ERROR "Could not activate the restored image, rolling back"
        [ -f "$REPLACED_FILE" ] && mv "$REPLACED_FILE" "$img"
        rm -f "$new"
        return 1
    fi
    chcon u:object_r:ksu_file:s0 "$img" 2>/dev/null
    log INFO "Image restored from backup (previous image kept as modules.img.replaced)"
    return 0
}

# Extract property value from file (everything after the first "=", so values may contain "=")
get_prop() {
    prop="$1"
    target_file="$2"

    if [ ! -f "$target_file" ]; then
        echo "Name not found"
        return
    fi

    value=$(grep -m1 "^$prop=" "$target_file" | cut -d'=' -f2- | tr -d '\r')
    if [ -n "$value" ]; then
        echo "$value"
    else
        echo "unknown"
    fi
}

# Safely modify module properties without breaking line structures
modify_prop() {
    local prop_key="$1"
    local prop_value="$2"
    local target_file="${3:-$MODDIR/module.prop}"

    if [ ! -f "$target_file" ]; then
        log ERROR "File $target_file not found."
        return 1
    fi

    if grep -q "^$prop_key=" "$target_file"; then
        local safe_value=$(printf '%s\n' "$prop_value" | sed 's/[~&]/\\&/g')
        sed -i "s~^$prop_key=.*~$prop_key=$safe_value~" "$target_file" || {
            log ERROR "Failed to modify $prop_key in $(basename "$target_file")"
            return 1
        }

        log INFO "Set $prop_key to $prop_value in $(basename "$target_file")"
    else
        log WARN "Property $prop_key not found in $(basename "$target_file"), skipping set"
    fi
}

# Mount ext4 image if not already mounted
ensure_image_mounted() {
    if ! mountpoint -q "$MNT_DIR" 2>/dev/null; then
        log "Mounting modules image"
        mkdir -p "$MNT_DIR"
        chcon u:object_r:ksu_file:s0 "$IMG_FILE" 2>/dev/null
        mount -t ext4 -o loop,rw,noatime "$IMG_FILE" "$MNT_DIR" || {
            log "Failed to mount modules image" && exit 1
        }
        log "Image mounted successfully"
    else
        log "Image already mounted"
    fi
}

# Determine whether this module should be moved into the ext4 image
module_requires_overlay_move() {
    if [ -f "$MODPATH/skip_mount" ]; then
        log "skip_mount flag detected; keeping files under /data/adb/modules"
        return 1
    fi

    for part in system vendor product system_ext odm oem; do
        if [ -d "$MODPATH/$part" ]; then
            return 0
        fi
    done

    log "No overlay dirs found; keeping module in /data/adb/modules"
    return 1
}

# Copy SELinux contexts from src tree to destination by mirroring each entry
copy_selinux_contexts() {
    command -v chcon >/dev/null 2>&1 || return 0

    SRC="$1"
    DST="$2"

    if [ -z "$SRC" ] || [ -z "$DST" ] || [ ! -e "$SRC" ] || [ ! -e "$DST" ]; then
        return 0
    fi

    # Copy context for the root directory
    CHCON_FLAG=""
    if [ -L "$SRC" ]; then
        CHCON_FLAG="-h"
    fi
    chcon $CHCON_FLAG --reference="$SRC" "$DST" 2>/dev/null || true

    # Copy contexts for all subdirectories and files
    find "$SRC" -print 2>/dev/null | while IFS= read -r PATH_SRC; do
        if [ "$PATH_SRC" = "$SRC" ]; then
            continue
        fi
        REL_PATH="${PATH_SRC#"${SRC}/"}"
        PATH_DST="$DST/$REL_PATH"
        if [ -e "$PATH_DST" ] || [ -L "$PATH_DST" ]; then
            CHCON_FLAG=""
            if [ -L "$PATH_SRC" ]; then
                CHCON_FLAG="-h"
            fi
            chcon $CHCON_FLAG --reference="$PATH_SRC" "$PATH_DST" 2>/dev/null || true
        fi
    done
}

# List all regular files of a module tree as paths relative to its root, sorted.
list_overlay_files() {
    ( cd "$1" 2>/dev/null && find system vendor product system_ext odm oem -type f 2>/dev/null | sort )
}

# Check for file conflicts with other installed modules.
# Uses one sorted file list per module and `comm`, instead of spawning processes per file.
check_conflicts() {
    log "Scanning for potential file conflicts..."
    local work_dir="/data/local/tmp/overlayfsx_conflicts_$$"
    local own_list="$work_dir/own.lst" other_list="$work_dir/other.lst"
    local temp_conflicts="$work_dir/conflicts.tmp"
    local OTHER_MOD_DIR OTHER_MOD REL_PATH

    rm -rf "$work_dir"
    mkdir -p "$work_dir" || { log WARN "Cannot create temp dir, conflict scan skipped"; return 0; }

    list_overlay_files "$MODPATH" > "$own_list"

    if [ -s "$own_list" ]; then
        for OTHER_MOD_DIR in "$MNT_DIR"/*/; do
            [ -d "$OTHER_MOD_DIR" ] || continue
            OTHER_MOD="${OTHER_MOD_DIR%/}"
            OTHER_MOD="${OTHER_MOD##*/}"

            case "$OTHER_MOD" in
                "$MODID"|lost+found|*_update|*_update.tmp|*.old) continue ;;
            esac

            list_overlay_files "$OTHER_MOD_DIR" > "$other_list"
            [ -s "$other_list" ] || continue

            comm -12 "$own_list" "$other_list" | while IFS= read -r REL_PATH; do
                echo "$OTHER_MOD|${REL_PATH##*/}"
            done >> "$temp_conflicts"
        done
    fi

    if [ -s "$temp_conflicts" ]; then
        log "File conflicts detected at the exact same mount path!"

        awk -F'|' '{
            mod=$1
            file=$2
            if (!seen[mod, file]) {
                seen[mod, file] = 1
                count[mod]++
                if (count[mod] <= 3) {
                    files_arr[mod, count[mod]] = file
                }
            }
        } END {
            for (mod in count) {
                print "  [ " mod " ] - " count[mod] " file(s)"

                for (i = 1; i <= count[mod] && i <= 3; i++) {
                    if (i == count[mod] || (i == 3 && count[mod] == 3)) {
                        print "   └── " files_arr[mod, i]
                    } else if (i == 3 && count[mod] > 3) {
                        print "   ├── " files_arr[mod, i]
                        print "   └── ...and " (count[mod] - 3) " more"
                    } else {
                        print "   ├── " files_arr[mod, i]
                    }
                }
            }
        }' "$temp_conflicts" | while IFS= read -r log_line; do
            log "$log_line"
        done

        log "Note: Both exist in their module folders, but the last one mounted will shadow (overwrite) the other."
    else
        log "No file conflicts found."
    fi

    rm -rf "$work_dir"
}

# Post-installation: stage module payload securely
# The payload is built in "<id>_update.tmp" and only renamed to "<id>_update" once EVERY
# partition was copied. A failed or interrupted copy therefore can never replace a
# working module at the next boot.
post_install_to_image() {
    log "Moving module content to image"

    if [ -d "$MNT_DIR" ]; then
        chmod 755 "$MNT_DIR" 2>/dev/null || true
    fi

    local STAGE_DIR="$MNT_DIR/${MODID}_update"
    local TMP_DIR="$STAGE_DIR.tmp"

    # Need room for the payload (+ margin) inside the image.
    local need_kb=0 free_kb part kb
    for part in system vendor product system_ext odm oem; do
        [ -d "$MODPATH/$part" ] || continue
        kb=$(du -sk "$MODPATH/$part" 2>/dev/null | awk '{print $1}')
        is_uint "$kb" && need_kb=$((need_kb + kb))
    done
    free_kb=$(avail_kb "$MNT_DIR")
    if is_uint "$free_kb" && [ "$free_kb" -lt $((need_kb + 4096)) ]; then
        log ERROR "Not enough free space in modules image (need ~$((need_kb / 1024)) MB, free $((free_kb / 1024)) MB). Use the WebUI to enlarge the image."
        return 1
    fi

    log "Staging payload to ${MODID}_update."

    # Nuke leftovers of failed previous staging attempts to ensure a clean slate
    rm -rf "$TMP_DIR"
    mkdir -p "$TMP_DIR" || { log ERROR "Cannot create staging directory"; return 1; }
    chmod 755 "$TMP_DIR" 2>/dev/null || true

    local SRC_DIR DEST_DIR
    for part in system vendor product system_ext odm oem; do
        SRC_DIR="$MODPATH/$part"
        [ -d "$SRC_DIR" ] || continue
        log "Copying $part/ to staging area"

        if ! cp -af "$SRC_DIR" "$TMP_DIR/"; then
            log ERROR "Failed to copy $part, staging aborted (previous version stays active)"
            rm -rf "$TMP_DIR"
            return 1
        fi

        DEST_DIR="$TMP_DIR/$part"
        copy_selinux_contexts "$SRC_DIR" "$DEST_DIR"
    done

    # Publish the finished payload (rename is atomic inside one filesystem).
    rm -rf "$STAGE_DIR"
    if ! mv "$TMP_DIR" "$STAGE_DIR"; then
        log ERROR "Failed to publish staged payload"
        rm -rf "$TMP_DIR"
        return 1
    fi
    sync

    log "Module content staged to image successfully"
    return 0
}

# Mark directory for REPLACE mode
mark_replace() {
    replace_target="$1"
    mkdir -p "$replace_target"
    setfattr -n trusted.overlay.opaque -v y "$replace_target" 2>/dev/null || true
}

# Ask a Vol+/Vol- question. Returns 0 for Volume UP, 1 for Volume DOWN.
# If no key is pressed it returns 1 (No): risky options must never be enabled by a timeout.
# Original idea by chainfire and ianmacd @xda-developers
chooseport() {
    local delay="${1:-10}" attempt=0 max_retries=2 ev pid
    [ -z "$TMPDIR" ] && TMPDIR="/data/local/tmp"
    mkdir -p "$TMPDIR"
    ev="$TMPDIR/overlayfsx_events.$$"

    while [ "$attempt" -le "$max_retries" ]; do
        rm -f "$ev"
        # One reader per attempt; it is always stopped below, so no stray getevent processes remain.
        timeout "$delay" /system/bin/getevent -lq > "$ev" 2>/dev/null &
        pid=$!

        while kill -0 "$pid" 2>/dev/null; do
            if grep -q 'KEY_VOLUMEUP *DOWN' "$ev" 2>/dev/null; then
                kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null; rm -f "$ev"
                return 0
            elif grep -q 'KEY_VOLUMEDOWN *DOWN' "$ev" 2>/dev/null; then
                kill "$pid" 2>/dev/null; wait "$pid" 2>/dev/null; rm -f "$ev"
                return 1
            fi
            sleep 0.3
        done
        wait "$pid" 2>/dev/null

        # Last look at what arrived right before the reader timed out.
        if grep -q 'KEY_VOLUMEUP *DOWN' "$ev" 2>/dev/null; then rm -f "$ev"; return 0; fi
        if grep -q 'KEY_VOLUMEDOWN *DOWN' "$ev" 2>/dev/null; then rm -f "$ev"; return 1; fi

        attempt=$((attempt + 1))
        if [ "$attempt" -le "$max_retries" ]; then
            echo "  > Volume key not detected. Attempt $attempt of $max_retries. Try again"
        fi
    done

    rm -f "$ev"
    echo "  > Volume key not detected. Auto-selecting: No"
    return 1
}
