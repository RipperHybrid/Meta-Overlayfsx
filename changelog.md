## v1.3.5 - Stability & Security Hardening

### 🔒 Security
- **WebUI:** all module-provided text (names, ids, file paths, partition names) is now HTML-escaped; inline `onclick` handlers built from file names were replaced by a delegated handler. Module ids are validated (`[A-Za-z0-9._-]`) before they are used in shell commands.

### 🛡️ Data safety
- **Boot cleanup:** orphan/`skip_mount` cleanup never runs when `/data/adb/modules` looks empty or unreadable, and refuses to wipe every module of the image in one pass.
- **Update swap:** staged updates are swapped with a rollback copy (`<id>.old`); an interrupted swap is recovered on the next boot. Empty/partial staging directories are discarded.
- **Staging:** module payloads are built in `<id>_update.tmp` and only published after all partitions were copied. A failed copy keeps the previous version active; free space is checked first.
- **Image updates:** the existing image is copied only after a free-space check, the copy is size-checked and verified/repaired with `e2fsck`; the update aborts (leaving the current install untouched) if the copy cannot be verified.
- **Boot:** `e2fsck -p` runs before mounting the image, with a full repair + one retry if mounting fails.

### ⚡ Features
- **Resizable image:** new *Image Size* control in Settings (grow or shrink, applied safely on the next boot). New images can use a custom size via `/data/adb/overlayfsx.d/img_size_mb`.
- **Optimize Storage:** uses `fstrim` first; the fallback compaction copy is verified and never replaces the image if any step fails.
- **`xcp`:** 1 MiB buffered I/O with retrying reads, refuses identical src/dst, removes the destination on failure, `fsync`s the result.

## v1.3.4 - Kernel Inspector & Next-Gen WebUI

### ✨ New Features

- **Kernel Mount Inspector (`inspect`):** New subcommand that reads `/proc/mounts` directly from the kernel to report active overlays and file conflicts. Supports JSON output (`-r`) for WebUI integration.
- **Staged Module Updates:** Module payloads are now staged to `_update` folders and atomically swapped at boot to prevent VFS cache corruption.
- **First-Time Module Sync:** Interactive option during initial install to auto-sync existing modules into the ext4 image using volume key selection.
- **Unified Logging:** Shell scripts now use leveled `INFO`/`WARN`/`ERROR` logging with consistent prefixes in `overlayfsx.log`.

### 🎨 WebUI Redesign

- Complete glass-morphism visual overhaul with Google Fonts (Outfit + DM Mono)
- SVG donut chart showing per-partition storage with glow filters
- Module info modal with conflict visualization and clickable path details
- Log viewer with color-coded levels

### 🛠️ Improvements

- `utils.sh`: Added `modify_prop()`, `chooseport()`, tree-style conflict output
- `metamount.sh`: Staged update swaps, binary output redirected to log file
- `customize.sh`: First-time sync with self-exclusion logic
- `uninstall.sh`: Now disables modules instead of removing them