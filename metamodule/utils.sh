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

# Extract property value from file
get_prop() {
    prop="$1"
    target_file="$2"

    if [ ! -f "$target_file" ]; then
        echo "Name not found"
        return
    fi

    grep "^$prop=" "$target_file" | cut -d'=' -f2 || echo "unknown"
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

# Check for file conflicts with other installed modules
check_conflicts() {
    log "Scanning for potential file conflicts..."
    local temp_conflicts="/data/local/tmp/overlayfsx_conflicts_$$.tmp"
    rm -f "$temp_conflicts"

    find "$MODPATH" -type f 2>/dev/null | while IFS= read -r FILE; do
        REL_PATH="${FILE#"$MODPATH/"}"

        case "$REL_PATH" in
            system/*|vendor/*|product/*|system_ext/*|odm/*|oem/*)
                for OTHER_MOD_DIR in "$MNT_DIR"/*/; do
                    [ ! -d "$OTHER_MOD_DIR" ] && continue

                    OTHER_MOD="$(basename "$OTHER_MOD_DIR")"

                    [ "$OTHER_MOD" = "$MODID" ] && continue
                    [ "$OTHER_MOD" = "lost+found" ] && continue
                    [ "$OTHER_MOD" = "${MODID}_update" ] && continue

                    if [ -f "$OTHER_MOD_DIR/$REL_PATH" ]; then
                        FILENAME="$(basename "$REL_PATH")"
                        echo "$OTHER_MOD|$FILENAME" >> "$temp_conflicts"
                    fi
                done
                ;;
        esac
    done

    if [ -f "$temp_conflicts" ]; then
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
        rm -f "$temp_conflicts"
    else
        log "No file conflicts found."
    fi
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

chooseport() {
  # Original idea by chainfire and ianmacd @xda-developers
  [ "$1" ] && local delay=$1 || local delay=10
  local retry_count=0
  local max_retries=2
  if [ -z "$TMPDIR" ]; then TMPDIR="/data/local/tmp"; fi
  mkdir -p "$TMPDIR"
  while true; do
    local count=0
    while true; do
      timeout $delay /system/bin/getevent -lqc 1 2>&1 > $TMPDIR/events &
      sleep 0.5; count=$((count + 1))
      if (`grep -q 'KEY_VOLUMEUP *DOWN' $TMPDIR/events`); then
        return 0
      elif (`grep -q 'KEY_VOLUMEDOWN *DOWN' $TMPDIR/events`); then
        return 1
      fi
      [ $count -gt 12 ] && break
    done
    retry_count=$((retry_count + 1))
    if [ $retry_count -gt $max_retries ]; then
      echo "  > Volume key not detected after $max_retries attempts. Auto-selecting Current Option."
      return 0
    else
      echo "  > Volume key not detected. Attempt $retry_count of $max_retries. Try again"
    fi
  done
}