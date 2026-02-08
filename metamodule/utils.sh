#!/system/bin/sh
############################################
# overlayfsx utils.sh
# Shared utility functions for module management
############################################

LOG_FILE="/data/adb/metamodule/overlayfs.log"

# Log messages to console and file
log() {
    [ ! -f "$LOG_FILE" ] && touch "$LOG_FILE"
    echo "$1"
    echo "$(date '+%d.%m.%y %T'): [overlayfsx] $1" >> "$LOG_FILE"
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

# Mount ext4 image if not already mounted
ensure_image_mounted() {
    if ! mountpoint -q "$MNT_DIR" 2>/dev/null; then
        log "- Mounting modules image"
        mkdir -p "$MNT_DIR"
        chcon u:object_r:ksu_file:s0 "$IMG_FILE" 2>/dev/null
        mount -t ext4 -o loop,rw,noatime "$IMG_FILE" "$MNT_DIR" || {
            log "- Failed to mount modules image" && exit 1
        }
        log "- Image mounted successfully"
    else
        log "- Image already mounted"
    fi
}

# Determine whether this module should be moved into the ext4 image
module_requires_overlay_move() {
    if [ -f "$MODPATH/skip_mount" ]; then
        log "- skip_mount flag detected; keeping files under /data/adb/modules"
        return 1
    fi

    if [ ! -d "$MODPATH/system" ]; then
        log "- No system/ directory detected; keeping files under /data/adb/modules"
        return 1
    fi

    return 0
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

# Post-installation: move partition directories to ext4 image
post_install_to_image() {
    log "- Moving module content to image"

    # Set permissions on mount directory
    if [ -d "$MNT_DIR" ]; then
        chmod 755 "$MNT_DIR" 2>/dev/null || true
    fi

    MOD_IMG_DIR="$MNT_DIR/$MODID"

    # Remove existing module directory if it exists
    if [ -d "$MOD_IMG_DIR" ]; then
        log "- Removing old module from image"
        rm -rf "$MOD_IMG_DIR"
    fi

    mkdir -p "$MOD_IMG_DIR"
    if [ -d "$MOD_IMG_DIR" ]; then
        chmod 755 "$MOD_IMG_DIR" 2>/dev/null || true
    fi

    # Copy all partition directories
    for partition in system vendor product system_ext odm oem; do
        if [ -d "$MODPATH/$partition" ]; then
            log "- Copying $partition/ to image"

            DEST_DIR="$MOD_IMG_DIR/$partition"

            # Remove existing partition directory if it exists
            if [ -d "$DEST_DIR" ]; then
                rm -rf "$DEST_DIR"
            fi

            # Copy to preserve all attributes including SELinux
            cp -af "$MODPATH/$partition" "$MOD_IMG_DIR/" || {
                log "- Warning!: Failed to copy $partition"
                continue
            }

            # Copy SELinux contexts from original source to destination
            copy_selinux_contexts "$MODPATH/$partition" "$DEST_DIR"
        fi
    done

    log "- Module content copied to image successfully"
}

# Mark directory for REPLACE mode
mark_replace() {
    replace_target="$1"
    mkdir -p "$replace_target"
    setfattr -n trusted.overlay.opaque -v y "$replace_target" 2>/dev/null || true
}