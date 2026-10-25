#!/system/bin/sh

# 1. Architecture Detection & Binary Extraction
ui_print "- Detecting device architecture..."
ABI=$(grep_get_prop ro.product.cpu.abi)
ui_print "- Detected ABI: $ABI"

# Select proper binary to avoid executing incompatible formats
case "$ABI" in
    arm64-v8a)
        ARCH_BINARY="overlayfsx-aarch64"
        REMOVE_BINARY="overlayfsx-x86_64"
        ui_print "- Selected architecture: ARM64"
        ;;
    x86_64)
        ARCH_BINARY="overlayfsx-x86_64"
        REMOVE_BINARY="overlayfsx-aarch64"
        ui_print "- Selected architecture: x86_64"
        ;;
    *)
        abort "- Unsupported architecture: $ABI"
        ;;
esac

[ ! -f "$MODPATH/$ARCH_BINARY" ] && abort "- Binary not found: $ARCH_BINARY"

ui_print "- Installing $ARCH_BINARY as overlayfsx"

# Clean up and assign execution permissions
mv "$MODPATH/$ARCH_BINARY" "$MODPATH/overlayfsx" || abort "- Failed to rename binary"
rm -f "$MODPATH/$REMOVE_BINARY"
chmod 755 "$MODPATH/overlayfsx" || abort "- Failed to set permissions"

ui_print "- Architecture-specific binary installed successfully"

# 2. Ext4 Image Setup (Creation or Reuse)
. "$MODPATH/utils.sh"

# During installation every log line goes to the installer output.
log() {
    if [ "$#" -eq 2 ]; then
        case "$1" in
            ERROR) ui_print "! $2" ;;
            WARN)  ui_print "- WARNING: $2" ;;
            *)     ui_print "- $2" ;;
        esac
    else
        ui_print "- $1"
    fi
}

IMG_FILE="$MODPATH/modules.img"
EXISTING_IMG="/data/adb/modules/$MODID/modules.img"
IS_FIRST_INSTALL=false

# Image size for NEW images can be chosen with: echo 4096 > /data/adb/overlayfsx.d/img_size_mb
IMG_SIZE_MB=$DEFAULT_IMG_SIZE_MB
if [ -f "$CONF_DIR/img_size_mb" ]; then
    REQ_SIZE=$(tr -dc '0-9' < "$CONF_DIR/img_size_mb" 2>/dev/null)
    if is_uint "$REQ_SIZE" && [ "$REQ_SIZE" -ge "$MIN_IMG_SIZE_MB" ] && [ "$REQ_SIZE" -le "$MAX_IMG_SIZE_MB" ]; then
        IMG_SIZE_MB=$REQ_SIZE
    else
        ui_print "- Ignoring invalid $CONF_DIR/img_size_mb, using ${IMG_SIZE_MB} MB"
    fi
fi

DATA_FREE_KB=$(avail_kb /data)
is_uint "$DATA_FREE_KB" || DATA_FREE_KB=0

if [ -f "$EXISTING_IMG" ]; then
    ui_print "- Reusing modules image from previous install"

    # The old module directory is deleted by KernelSU after this update, so the copy made
    # here becomes the ONLY copy. It is therefore verified before the install may continue.
    EXISTING_USED_KB=$(du -k "$EXISTING_IMG" 2>/dev/null | awk '{print $1}')
    is_uint "$EXISTING_USED_KB" || EXISTING_USED_KB=0
    NEED_KB=$((EXISTING_USED_KB + 65536))
    if [ "$DATA_FREE_KB" -lt "$NEED_KB" ]; then
        abort "! Not enough free storage in /data: need $((NEED_KB / 1024)) MB, have $((DATA_FREE_KB / 1024)) MB. Nothing was changed."
    fi

    # Make sure the old image is not being written to while it is copied.
    sync

    if ! "$MODPATH/overlayfsx" xcp "$EXISTING_IMG" "$IMG_FILE"; then
        rm -f "$IMG_FILE"
        abort "! Failed to copy existing modules image. Nothing was changed."
    fi

    OLD_BYTES=$(stat -c%s "$EXISTING_IMG" 2>/dev/null)
    NEW_BYTES=$(stat -c%s "$IMG_FILE" 2>/dev/null)
    if [ -z "$OLD_BYTES" ] || [ "$OLD_BYTES" != "$NEW_BYTES" ]; then
        rm -f "$IMG_FILE"
        abort "! Copied image has a different size ($NEW_BYTES vs $OLD_BYTES bytes). Nothing was changed."
    fi

    ui_print "- Verifying copied image"
    if ! fsck_image "$IMG_FILE" force; then
        rm -f "$IMG_FILE"
        abort "! Existing modules image is damaged and could not be repaired. Update cancelled, your current install is untouched."
    fi
    ui_print "- Image verified"

    # Keep one verified backup outside the module folder (KernelSU deletes that folder).
    # Failure is not fatal: the update itself is already safe.
    XCP_BIN="$MODPATH/overlayfsx"
    if backup_image "$IMG_FILE"; then
        ui_print "- Backup of the modules image saved"
    else
        ui_print "- Warning: could not create a backup of the modules image"
    fi
else
    ui_print "- Creating ${IMG_SIZE_MB} MB ext4 image for module storage"
    IS_FIRST_INSTALL=true

    if [ "$DATA_FREE_KB" -lt 131072 ]; then
        abort "! Not enough free storage in /data (need at least 128 MB, have $((DATA_FREE_KB / 1024)) MB)."
    fi

    # Create sparse file (logical size only, takes ~0 bytes on disk initially)
    truncate -s ${IMG_SIZE_MB}M "$IMG_FILE" || abort "- Failed to create image file"
    /system/bin/mke2fs -t ext4 -O ^has_journal -F "$IMG_FILE" >/dev/null 2>&1 || {
        rm -f "$IMG_FILE"
        abort "- Failed to format ext4 image"
    }

    ui_print "- Image created successfully (sparse file)"
fi

# 3. First-Time Module Sync (Existing/Pending Modules)
if [ "$IS_FIRST_INSTALL" = true ]; then
    MNT_DIR="$MODPATH/mnt_temp"
    ui_print " "
    ui_print "- WARNING: Module sync is an experimental feature."
    ui_print "- It works, but behavior varies across environments."
    ui_print "- Proceeding may cause unexpected boot issues."
    ui_print " "
    ui_print "- Sync existing and pending modules now?"
    ui_print "- [ Vol UP = Yes  |  Vol DOWN = No ]"

    if chooseport 10; then
        ui_print " "
        ui_print "- Initializing first-time module sync..."

        mkdir -p /data/adb/metamodule
        export MNT_DIR="$MODPATH/mnt_temp"
        export IMG_FILE="$MODPATH/modules.img"
        SYNC_FAILED=0

        # Silent check prevents spamming the terminal with "skipped" logs
        silent_check_requires_move() {
            [ -f "$MODPATH/skip_mount" ] && return 1
            for part in system vendor product system_ext odm oem; do
                [ -d "$MODPATH/$part" ] && return 0
            done
            return 1
        }

        # Force write and fix SELinux context before loop mount
        sync
        chcon u:object_r:ksu_file:s0 "$IMG_FILE" 2>/dev/null
        mkdir -p "$MNT_DIR"

        if mount -t ext4 -o loop,rw,noatime "$IMG_FILE" "$MNT_DIR"; then
            ORIG_MODPATH="$MODPATH"
            ORIG_MODID="$MODID"
            SYNC_COUNT=0

            # Scan active modules first, then pending un-rebooted updates
            for base_dir in /data/adb/modules /data/adb/modules_update; do
                [ ! -d "$base_dir" ] && continue

                for target_mod in "$base_dir"/*/; do
                    [ ! -d "$target_mod" ] && continue

                    target_id=$(basename "$target_mod")

                    # Prevent overlayfsx from trying to sync itself
                    [ "$target_id" = "$ORIG_MODID" ] && continue
                    [ "$target_id" = "overlayfsx" ] && continue
                    [ "$target_id" = "meta-overlayfsx" ] && continue

                    # Hijack global variables so utils.sh affects the target
                    export MODPATH="$target_mod"
                    export MODID="$target_id"

                    if silent_check_requires_move; then
                        dir_label="active"
                        [ "$base_dir" = "/data/adb/modules_update" ] && dir_label="pending"

                        ui_print "- Syncing [$dir_label] module: $MODID"
                        check_conflicts
                        if post_install_to_image; then
                            SYNC_COUNT=$((SYNC_COUNT + 1))
                        else
                            SYNC_FAILED=$((SYNC_FAILED + 1))
                            ui_print "! Failed to sync $MODID (it keeps working from its own folder)"
                        fi
                    fi
                done
            done

            export MODPATH="$ORIG_MODPATH"
            export MODID="$ORIG_MODID"

            sync
            umount "$MNT_DIR" || umount -l "$MNT_DIR"
            rmdir "$MNT_DIR" 2>/dev/null

            [ "$SYNC_FAILED" -gt 0 ] && ui_print "- $SYNC_FAILED module(s) could not be synced"
            if [ "$SYNC_COUNT" -gt 0 ]; then
                ui_print "- Successfully synced $SYNC_COUNT module(s)!"
            else
                ui_print "- No existing/pending modules required syncing."
            fi
        else
            ui_print "- Warning: Could not mount image for initial sync."
        fi
    else
        ui_print " "
        ui_print "- Skipping module sync."
    fi
fi

ui_print " "
ui_print "- Installation complete, Please reboot to apply changes."
