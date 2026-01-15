#!/system/bin/sh
############################################
# meta-overlayfsx metainstall.sh
# Module installation hook with live patching support
############################################

# Constants
IMG_FILE="/data/adb/metamodule/modules.img"
META="/data/adb/metamodule"
MNT_DIR="$META/mnt"
LIVE_MODULES_FILE="$META/live_modules.txt"
BINARY="$META/meta-overlayfsx"

. "$META"/utils.sh || exit 1
unzip -o "$ZIPFILE" module.prop -d "$TMPDIR" >&2
MODNAME=$(get_prop name "$TMPDIR/module.prop")
MODID=$(get_prop id "$TMPDIR/module.prop")

log "- Using meta-overlayfsx metainstall"
log "- Installing module: $MODNAME (ID: $MODID)"

# Install module using KernelSU's install_module function
install_module

if module_requires_overlay_move; then
    ensure_image_mounted
    
    # STEP 1: Record OLD files
    record_module_files "$MODID"
    
    # STEP 2: Delete old + Copy new + SELinux
    post_install_to_image
    
    # STEP 3: Check if this module is enabled for live patching
    if is_module_live "$MODID"; then
        log "- Module is enabled for live patching"
        
        # STEP 4: Compare OLD vs NEW
        if module_has_new_files "$MODID"; then
            log "- Reboot required for changes to take effect"
        else
            # Run binary with -u flag for live patching.
            "$BINARY" -u "$MODID" >/dev/null 2>&1
            if [ $? -eq 0 ]; then
                log "- Live patch successful!"
                log "- Module changes applied without reboot"
            else
                log "- Live patch failed, reboot required"
            fi
        fi
    else
        # Cleanup temp files
        rm -f "/data/local/tmp/${MODID}_old" "/data/local/tmp/${MODID}_new" 2>/dev/null
        log "- Module not enabled for live patching"
        log "- Reboot required for changes to take effect"
    fi
else
    log "- Skipping move to modules image"
fi

log "- $MODNAME installation complete"
