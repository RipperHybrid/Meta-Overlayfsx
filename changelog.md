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