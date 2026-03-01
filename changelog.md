## v1.3.3 - Conflict Detection & Mount Priority

### ✨ New Features

* **Smart File Conflict Detection:**
* Added a pre-mount scanner during module installation that detects if multiple modules are attempting to modify the exact same system files.

* **Deterministic Mount Ordering (Rust):**
* Updated the core mounting binary (`src/mount.rs`) to explicitly sort enabled modules alphabetically before building the OverlayFS layers.
* This guarantees a **predictable mount priority** hierarchy (e.g., `Module_A` will always reliably overwrite `Module_B`) rather than relying on the random read order of the filesystem.

* **Shell Script Refactoring:**
* **`metainstall.sh` & `utils.sh`:** Integrated the new conflict checking logic seamlessly into the install hook before files are pushed to the ext4 image.