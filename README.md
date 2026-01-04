# Meta-Overlayfsx

<div align="center">

![Build Status](https://img.shields.io/github/actions/workflow/status/RipperHybrid/Meta-Overlayfsx/build-overlayfsx.yml?branch=main&style=flat&color=purple&label=Build&logo=github)
![License](https://img.shields.io/github/license/RipperHybrid/Meta-Overlayfsx?style=flat&color=blue)

</div>

**Meta-Overlayfsx** is an advanced evolution of the original KernelSU overlayfs metamodule. It introduces a modern WebUI, selective Live Patching capabilities, and robust image management.

## ✨ Key Features

### 1. ⚡ Selective Live Patching
Update specific modules without rebooting!
- **How it works:** Uses recursive bind mounts ("Sticker Mode") to layer new files over the active file system immediately.
- **Safety:** The installer compares file structures. If only content changed, it patches live. If the directory structure changed, it requests a reboot.
- **Toggle:** Configurable per-module via the WebUI.

### 2. 🖥️ Modern WebUI
A comprehensive dashboard integrated directly into KernelSU Manager.
- **Dashboard:** Visualize storage usage (ext4 image), mount status, and system stats.
- **Module Manager:** Search, filter, enable/disable modules, and toggle Live Patching.
- **Tools:** View/Clear logs, Optimize Storage (hole punching to shrink image size).
- **Design:** Clean, dark-themed, responsive UI.

### 3. 🛡️ Robust Architecture
- **Dual-Directory:** Keeps metadata in `/data/adb/modules` and content in a mounted ext4 image.
- **Auto-Repair:** Automatically cleans up orphaned modules or "skip_mount" artifacts.
- **Universal Binary:** Auto-selects `aarch64` or `x86_64` binary during installation.

## 📥 Installation

1. Download the latest `meta-overlayfsx-v*.zip` from Releases.
2. Install via KernelSU Manager **OR** via ADB:
```bash
adb push meta-overlayfsx-v1.3.2.zip /sdcard/
adb shell su -c 'ksud module install /sdcard/meta-overlayfsx-v1.3.2.zip'
```
3. Reboot.

## 🚀 Usage

### Accessing the WebUI
1. Open **KernelSU Manager**.
2. Go to the **Modules** tab.
3. Find **OverlayFS Enhanced**.
4. Click the **WebUI** (or Settings) button (if supported by your manager) or access via the local server if configured.

### Live Patching (CLI)
While the WebUI is the recommended method, you can trigger updates manually:
```bash
# Force live update a specific module
/data/adb/modules/meta-overlayfsx/meta-overlayfsx -u <module_id>
```

### Storage Optimization
Run this command (or use the WebUI button) to punch holes in the ext4 image and reclaim disk space:
```bash
/data/adb/modules/meta-overlayfsx/meta-overlayfsx xcp <src> <dst> --punch-hole
```

## 🏗️ Building

**Requirements:** `cargo`, `cargo-ndk`, `cross` (optional).

```bash
# Build locally (Artifacts will be in target/module/)
./build.sh
```

## 👥 Credits & Acknowledgements

### Original Base Project
Huge thanks to the original creators who built the Meta OverlayFS foundation:
- [weishu](https://github.com/tiann)
- [Ylarod](https://github.com/Ylarod) 
- [Wang Han](https://github.com/aviraxp) 
- [7a72](https://github.com/7a72) 

### Open Source
This project uses components from:
- `hole-punch` (Rust crate)
- `rustix` & `procfs`

## 📄 License
Licensed under **GPL-3.0**.