#!/system/bin/sh
############################################
# overlayfsx restore.sh
# Copy a module's overlay files from the modules image back into /data/adb/modules/<id>.
# Existing files are NEVER overwritten; only missing ones are restored.
#
#   sh restore.sh <module-id>
#
# Prints "restored:<count>" as its last line on success.
############################################

META_DIR="/data/adb/metamodule"
MNT_DIR="$META_DIR/mnt"
MODULES_DIR="/data/adb/modules"
PARTITIONS="system vendor product system_ext odm oem"

ID="$1"

# Strict id check (the id ends up in file paths).
case "$ID" in
    ''|.*|*[!A-Za-z0-9._-]*|*..*)
        echo "invalid module id" >&2
        exit 2
        ;;
esac

if ! mountpoint -q "$MNT_DIR" 2>/dev/null; then
    echo "modules image is not mounted" >&2
    exit 3
fi
if [ ! -d "$MNT_DIR/$ID" ]; then
    echo "module '$ID' has no content in the image" >&2
    exit 4
fi
if [ ! -d "$MODULES_DIR/$ID" ]; then
    echo "module folder $MODULES_DIR/$ID does not exist" >&2
    exit 5
fi

COUNT=0
FAILED=0
for part in $PARTITIONS; do
    SRC="$MNT_DIR/$ID/$part"
    DST="$MODULES_DIR/$ID/$part"
    [ -d "$SRC" ] || continue

    # Walk the image copy; copy every file/symlink that is missing in the module folder.
    ( cd "$SRC" && find . -mindepth 1 \( -type f -o -type l \) 2>/dev/null ) > "${TMPDIR:-/data/local/tmp}/overlayfsx_restore.$$"
    while IFS= read -r REL; do
        REL="${REL#./}"
        [ -n "$REL" ] || continue
        if [ -e "$DST/$REL" ] || [ -L "$DST/$REL" ]; then
            continue
        fi
        mkdir -p "$(dirname "$DST/$REL")" || { FAILED=$((FAILED + 1)); continue; }
        if cp -a "$SRC/$REL" "$DST/$REL" 2>/dev/null; then
            chcon --reference="$SRC/$REL" "$DST/$REL" 2>/dev/null
            COUNT=$((COUNT + 1))
        else
            FAILED=$((FAILED + 1))
        fi
    done < "${TMPDIR:-/data/local/tmp}/overlayfsx_restore.$$"
    rm -f "${TMPDIR:-/data/local/tmp}/overlayfsx_restore.$$"
done

if [ "$FAILED" -gt 0 ]; then
    echo "$FAILED file(s) could not be restored" >&2
fi
echo "restored:$COUNT"
[ "$FAILED" -eq 0 ]
