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
IMG_FILE="$MODPATH/modules.img"
IMG_SIZE_MB=2048
EXISTING_IMG="/data/adb/modules/$MODID/modules.img"
IS_FIRST_INSTALL=false

if [ -f "$EXISTING_IMG" ]; then
    ui_print "- Reusing modules image from previous install"
    # Preserve synced modules during updates
    "$MODPATH/overlayfsx" xcp "$EXISTING_IMG" "$IMG_FILE" || abort "- Failed to copy existing modules image"
else
    ui_print "- Creating 2GB ext4 image for module storage"
    IS_FIRST_INSTALL=true

    # Create sparse file (Logical 2GB, takes 0 bytes on disk initially)
    truncate -s ${IMG_SIZE_MB}M "$IMG_FILE" || abort "- Failed to create image file"
    /system/bin/mke2fs -t ext4 -O ^has_journal -F "$IMG_FILE" >/dev/null 2>&1 || abort "- Failed to format ext4 image"

    ui_print "- Image created successfully (sparse file)"
fi

# 3. First-Time Module Sync (Existing/Pending Modules)
if [ "$IS_FIRST_INSTALL" = true ]; then
    . "$MODPATH/utils.sh"

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
                        post_install_to_image
                        SYNC_COUNT=$((SYNC_COUNT + 1))
                    fi
                done
            done

            export MODPATH="$ORIG_MODPATH"
            export MODID="$ORIG_MODID"

            sync
            umount "$MNT_DIR" || umount -l "$MNT_DIR"
            rmdir "$MNT_DIR" 2>/dev/null

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