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

log INFO "Using overlayfsx metainstall"
log INFO "Installing module: $MODNAME (ID: $MODID)"

# Install module using KernelSU's install_module function
install_module

if module_requires_overlay_move; then
    ensure_image_mounted

    # Run the conflict scan before moving files
    check_conflicts

    # Move files to image
    if post_install_to_image; then
        log INFO "Reboot required for changes to take effect"
    else
        log ERROR "Module could not be staged in the image; the previous version (if any) stays active"
    fi
else
    log INFO "Skipping move to modules image"
fi

log INFO "$MODNAME installation complete"
