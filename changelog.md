## v1.3.2 - Major Overhaul & WebUI Integration

### 🚨 Core Rebranding
- **Project Renamed:** transitioned from `meta-overlayfs` to **`overlayfsx`**.

### ✨ New Features
- **WebUI Dashboard:**
  - Added a comprehensive **KernelSU Manager WebUI** built with Vite & Vanilla JS.
  - **Dashboard:** View real-time storage usage (ext4 image), mount status, and device info.
  - **Module Manager:** Search, filter, enable/disable modules, and uninstall modules directly from the UI.
  - **Log Viewer:** View and clear system logs (`overlayfs.log`) directly within the app.

### 🛠️ Technical Improvements
- **Shell Script Refactoring:**
  - **`utils.sh`:** Introduced a shared utility library to centralize logging, prop extraction, and mounting logic, reducing code duplication across scripts.
  - **`metamount.sh`:**
    - Added **Orphaned Module Cleanup**: Automatically detects and removes modules from the mounted image if they were deleted from `/data/adb/modules`.
    - Improved **SELinux Context** handling for `.rw` partition structures.
  - **`metainstall.sh`:** Updated to utilize `utils.sh` for cleaner installation logic.