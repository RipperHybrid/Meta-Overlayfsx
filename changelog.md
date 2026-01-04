Major Overhaul v1.3.2:

1. Core Rebranding & Logic:
   - Renamed project to `meta-overlayfsx`.
   - Updated Rust binary to support `-u <modid>` flag for selective live patching.
   - Implemented `bind_mount_recursive` (Sticker Mode) to apply updates without rebooting active mounts.

2. New WebUI Dashboard:
   - Added full `webroot` support.
   - Dashboard: Real-time storage usage, mount status, and device info.
   - Modules Manager: Enable/Disable modules, toggle "Live Patching" per module, and search/filter.
   - Settings: Log viewer, storage optimizer (sparse file hole punching).
   - Tech: Vanilla JS (ES6+), CSS3 Variables, Dark Mode.

3. Shell Script Enhancements:
   - `metainstall.sh`: Added logic to detect live-enabled modules and attempt immediate patching.
   - `utils.sh`: Added file comparison logic to determine if a reboot is strictly necessary or if live patching is safe.
   - `metamount.sh`: Improved orphaned module cleanup and SELinux context handling.