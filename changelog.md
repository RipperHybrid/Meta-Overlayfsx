## v1.3.5 - Stability & Security Hardening

### 🔒 Security
- **WebUI:** all module-provided text (names, ids, file paths, partition names) is now HTML-escaped; inline `onclick` handlers built from file names were replaced by a delegated handler. Module ids are validated (`[A-Za-z0-9._-]`) before they are used in shell commands.

### 🛡️ Data safety
- **Boot cleanup:** orphan/`skip_mount` cleanup never runs when `/data/adb/modules` looks empty or unreadable, and refuses to wipe every module of the image in one pass.
- **Update swap:** staged updates are swapped with a rollback copy (`<id>.old`); an interrupted swap is recovered on the next boot. Empty/partial staging directories are discarded.
- **Staging:** module payloads are built in `<id>_update.tmp` and only published after all partitions were copied. A failed copy keeps the previous version active; free space is checked first.
- **Image updates:** the existing image is copied only after a free-space check, the copy is size-checked and verified/repaired with `e2fsck`; the update aborts (leaving the current install untouched) if the copy cannot be verified.
- **Boot:** `e2fsck -p` runs before mounting the image, with a full repair + one retry if mounting fails.

### 🐞 Fixes
- `post-mount.sh`: nuke the sysfs entry of the real image mount (path was wrong).
- `uninstall.sh`: gives modules back overlay content that only existed in the image (existing files are kept) before disabling them.
- Boot: the hidden `.rw` directory was counted as an enabled module; a failed child overlay is now reverted with a lazy unmount; partial mount failures are reported accurately.
- `utils.sh`: `get_prop` keeps values containing `=`; `check_conflicts` is much faster (sorted lists + `comm`) and ignores `_update`/`.old`/`.tmp` folders; `chooseport` no longer leaves stray `getevent` readers and defaults to **No** when no key is pressed.
- WebUI falls back to the real module id `meta-overlayfsx`.

### 🏭 Build & CI
- Releases are created only for `v*` tags (and the tag must match `module.prop`); pushes/PRs just build.
- `hole-punch` and `cross` are pinned to fixed revisions; `rust-version` set to 1.85; `softprops/action-gh-release` v2.
- `build.sh` checks Cargo.toml/module.prop versions, uses `--locked` and `npm ci` when lockfiles exist, and fixes the `cargo-ndk` argument order.
- `build.sh` loads `~/.cargo/env` when `cargo` is not in `PATH`, reports every missing tool with a fix, checks rustc/Node versions, picks `cross` only when Docker/Podman really runs (else `cargo-ndk` with NDK check), installs missing Rust targets, no longer wipes cargo's cache, and can create the flashable zip with `--zip`.
- `.gitattributes` forces LF for shell scripts (CRLF breaks them on Android).
- Telegram upload no longer runs `curl -v` (it printed the bot token in the URL).
- `.gitignore` no longer hides `Cargo.lock`; ignores `node_modules` and the WebUI `dist`.

### 🔤 WebUI
- Fonts are now bundled locally (Outfit variable + DM Mono 400/500, Latin subset, ~80 KB, SIL OFL), so the WebUI renders identically offline. The Google Fonts request was removed.

### 🧪 Inspector
- `inspect`: O(1) de-duplication (`HashSet`) instead of quadratic `Vec::contains`; symlinked directories are no longer followed (no endless loops, depth-limited walk); `/proc/mounts` octal escapes (`\040` …) are decoded so paths with spaces match; JSON output escapes every control character; a trailing `/` in `MODULE_CONTENT_DIR` no longer breaks matching.
- Parsing and analysis were split into pure functions with **17 unit tests** (`cargo test` now runs on a normal host: the Android-only `mount` module is gated by `cfg(target_os = "android")`). CI runs them in a `test` job.

### ⚡ Features
- **Restore module files:** *Restore files* button in a module's Info dialog (and `restore.sh <id>`) copies files that exist only in the image back into `/data/adb/modules/<id>`; existing files are never overwritten.
- **Image backup:** one verified backup of the modules image is kept outside the module folder (`/data/adb/overlayfsx.d/modules.img.bak`). It is refreshed automatically on every update, and *Backup* / *Restore* buttons in Settings schedule a manual backup or a restore for the next boot (while the image is unmounted). A restore keeps the replaced image as `modules.img.replaced`.
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