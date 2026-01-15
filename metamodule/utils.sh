#!/system/bin/sh
############################################
# meta-overlayfsx utils.sh
# Shared utility functions for module management
############################################

LOG_FILE="/data/adb/metamodule/overlayfs.log"
LIVE_MODULES_FILE="/data/adb/metamodule/live_modules.txt"

# Log messages to console and file
log() {
    [ ! -f "$LOG_FILE" ] && touch "$LOG_FILE"
    echo "$1"
    echo "$(date '+%d.%m.%y %T'): [meta-overlayfsx] $1" >> "$LOG_FILE"
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

# Check if module is enabled for live patching
is_module_live() {
    modid="$1"
    
    if [ ! -f "$LIVE_MODULES_FILE" ]; then
        return 1
    fi
    
    grep -q "^${modid}$" "$LIVE_MODULES_FILE"
}

# Record module files BEFORE installation
record_module_files() {
    modid="$1"
    module_path="$MNT_DIR/$modid"
    temp_old="/data/local/tmp/${modid}_old"
    
    # Clean up any leftover file from previous runs
    rm -f "$temp_old" 2>/dev/null
    
    # Check if module already exists in the image
    if [ ! -d "$module_path" ]; then
        # Silent return for fresh install
        return 0
    fi
    
    # log "- Recording existing module state" <-- REMOVED per request
    
    # Record all files with relative paths from the IMAGE
    find "$module_path" -type f -print0 2>/dev/null | while IFS= read -r -d '' file; do
        rel_path="${file#"${module_path}/"}"
        printf '%s\n' "$rel_path"
    done | sort > "$temp_old"
}

# Check if module has changed files (additions or deletions) in the IMAGE
module_has_new_files() {
    modid="$1"
    module_path="$MNT_DIR/$modid"
    temp_old="/data/local/tmp/${modid}_old"
    temp_new="/data/local/tmp/${modid}_new"
    
    # Clean up any leftover new file
    rm -f "$temp_new" 2>/dev/null
    
    # If old_files_temp doesn't exist or is empty, it's a fresh install
    if [ ! -f "$temp_old" ] || [ ! -s "$temp_old" ]; then
        log "- Fresh install detected, can perform live patch"
        rm -f "$temp_old" "$temp_new" 2>/dev/null
        return 0
    fi
    
    # If module directory doesn't exist in image after installation, error
    if [ ! -d "$module_path" ]; then
        log "- ERROR: Module not in image after installation"
        rm -f "$temp_old" "$temp_new" 2>/dev/null
        return 0
    fi
    
    log "- Comparing image files: Old vs New"
    
    # Get NEW files list from IMAGE
    find "$module_path" -type f -print0 2>/dev/null | while IFS= read -r -d '' file; do
        rel_path="${file#"${module_path}/"}"
        printf '%s\n' "$rel_path"
    done | sort > "$temp_new"
    
    # Check for structural differences using diff
    if diff -q "$temp_old" "$temp_new" >/dev/null 2>&1; then
        # Files are identical (same structure)
        log "- No structural changes (same files in image, content may differ)"
        rm -f "$temp_old" "$temp_new" 2>/dev/null
        return 1
    else
        # Files have changed
        log "- Structural changes detected (files added/removed), reboot required"
        rm -f "$temp_old" "$temp_new" 2>/dev/null
        return 0
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
