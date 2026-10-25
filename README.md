# Overlayfsx

<div align="center">

![Build Status](https://img.shields.io/github/actions/workflow/status/RipperHybrid/meta-overlayfsx/build.yml?branch=main&style=flat&color=purple&label=Build&logo=github)
![License](https://img.shields.io/github/license/RipperHybrid/meta-overlayfsx?style=flat&color=blue)

</div>

**Overlayfsx** is an advanced evolution of the original KernelSU overlayfs metamodule. It introduces a modern WebUI, robust image management, and a real-time kernel mount inspector to handle modules efficiently using an ext4 image overlay.

## ✨ Key Features

### 1. 🖥️ Modern WebUI
A comprehensive dashboard integrated directly into KernelSU Manager.
- **Dashboard:** Multi-segment donut chart visualizing per-partition storage usage, live mount status, and system stats with ambient themed backgrounds.
- **Module Manager:** Redesigned slab cards with real-time file counts and conflict detection sourced directly from the kernel. Search, filter, enable/disable, uninstall, and drill down into per-file conflict resolution.
- **Tools:** Syntax-highlighted log viewer with copy/refresh, one-tap storage optimization (hole punching), and self-uninstall/restore capability.
- **Design:** Dark glassmorphism theme with `Outfit` + `DM Mono` typefaces, per-page orb backgrounds, swipe navigation, and responsive layout.

### 2. 🛡️ Robust Architecture
- **Dual-Directory:** Keeps metadata (props, disable flags) in `/data/adb/modules` and content in a mounted ext4 image.
- **Auto-Repair:** Automatically cleans up orphaned modules and "skip_mount" artifacts on boot.
- **First-Time Sync:** Interactive volume-key prompt during initial install to migrate existing modules into the ext4 image.
- **Universal Binary:** Auto-selects `aarch64` or `x86_64` binary during installation.

### 3. ⚡ Real-Time Kernel Inspector
- **No Guessing:** Queries `/proc/mounts` directly from the Linux kernel to extract the exact `lowerdir` chains currently being enforced.
- **Conflict Resolution:** Identifies exactly which module "wins" and which are "shadowed" for every overlaid file, with drill-down into per-file path details.
- **Dual Output:** Human-readable tree format for CLI or structured JSON (`inspect -r`) for WebUI integration.
- **Deduplication:** Filters out visually identical conflicts caused by Android symlinks.

### 4. ⚡ Storage Optimization
- **Smart Management:** Uses sparse files for the module image.
- **Optimization Tool:** Built-in `xcp` command punches holes in the image file, reclaiming disk space from deleted modules without destroying the image.

## 📥 Installation

1. Download the latest `overlayfsx-v*.zip` from Releases.
2. Install via KernelSU Manager **OR** via ADB:

```bash
adb push overlayfsx-v1.3.5.zip /sdcard/
adb shell su -c 'ksud module install /sdcard/overlayfsx-v1.3.5.zip'
```

3. Reboot.

## 🚀 Usage

### Accessing the WebUI

1. Open **KernelSU Manager**.
2. Go to the **Modules** tab.
3. Find **OverlayFS Enhanced**.
4. Click the **WebUI** button.

### Real-Time Mount Inspection

View exactly what the kernel is enforcing right now:

```bash
# Human-readable tree output
/data/adb/modules/meta-overlayfsx/overlayfsx inspect

# Structured JSON for scripts or WebUI
/data/adb/modules/meta-overlayfsx/overlayfsx inspect -r
```

### Storage Optimization

Reclaim disk space from deleted or updated modules (requires reboot for size changes to appear in file managers):

```bash
/data/adb/modules/meta-overlayfsx/overlayfsx xcp <src> <dst> --punch-hole
```

Or use the one-tap **Optimize Storage** button in the WebUI Settings page.

## 🏗️ Building

**Requirements:** `cargo` (Rust ≥ 1.85), `cargo-ndk` **or** `cross`, Node.js ≥ 18.

```bash
# Build locally (Artifacts will be in target/module/)
./build.sh

# ...and also create the flashable zip (target/overlayfsx_v<version>_<code>.zip)
./build.sh --zip
```

Ubuntu/Debian quick setup: `sudo apt install build-essential git curl zip unzip`, install Rust with
[rustup](https://rustup.rs) (not `apt`), Node.js 20, and either Docker (`cross`) or the Android NDK (`cargo-ndk`,
`export ANDROID_NDK_HOME=...`). `build.sh` tells you what is missing.

Commit `Cargo.lock` and `metamodule/webroot/package-lock.json` so builds are reproducible
(`build.sh` uses `--locked` / `npm ci` automatically when they exist).

### Releasing

CI builds every push and pull request, but only **tags** create a release:

```bash
# 1. bump version in Cargo.toml and metamodule/module.prop (versionCode too)
git tag v1.3.5 && git push origin v1.3.5
```

The tag must equal `v<version>` from `module.prop`, otherwise the workflow fails.

## 👥 Credits & Acknowledgements

### Fork Maintainer

* **AshBorn** ([@RipperHybrid](https://github.com/RipperHybrid)) — WebUI development, kernel inspector, module sync, UI/UX design, and ongoing maintenance.

### Original Base Project

Huge thanks to the original creators who built the Meta OverlayFS foundation:

* [weishu](https://github.com/tiann)
* [Ylarod](https://github.com/Ylarod)
* [Wang Han](https://github.com/aviraxp)
* [7a72](https://github.com/7a72)

### Open Source

This project uses components from:

* `hole-punch` (Rust crate)
* `rustix` & `procfs`
* [Outfit](https://github.com/Outfitio/Outfit-Fonts) and [DM Mono](https://github.com/googlefonts/dm-mono) fonts (SIL Open Font License 1.1, see `metamodule/webroot/fonts/OFL-*.txt`)

## 📄 License

Licensed under **GPL-3.0**.

---

## 📝 Reporting Issues

**Important:** This is a modified fork. Please report bugs related to the WebUI, kernel inspector, module sync, or any fork-specific features to [@RipperHybrid](https://github.com/RipperHybrid). Do **not** report issues with this fork to the original KernelSU maintainers.
