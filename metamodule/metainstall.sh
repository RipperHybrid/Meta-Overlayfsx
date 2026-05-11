#!/system/bin/sh
############################################
# overlayfsx metainstall.sh
# Module installation hook
############################################

# Constants
IMG_FILE="/data/adb/metamodule/modules.img"
META="/data/adb/metamodule"
MNT_DIR="$META/mnt"

. "$META"/utils.sh || exit 1
unzip -o "$ZIPFILE" module.prop -d "$TMPDIR" >&2
MODNAME=$(get_prop name "$TMPDIR/module.prop")
MODID=$(get_prop id "$TMPDIR/module.prop")

log "Using overlayfsx metainstall"
log "Installing module: $MODNAME (ID: $MODID)"

# Install module using KernelSU's install_module function
install_module

if module_requires_overlay_move; then
    ensure_image_mounted

    # Run the conflict scan before moving files
    check_conflicts

    # Move files to image
    post_install_to_image
    log "Reboot required for changes to take effect"
else
    log "Skipping move to modules image"
fi

log "$MODNAME installation complete"