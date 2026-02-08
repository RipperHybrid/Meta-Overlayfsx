# Overlayfsx

<div align="center">

![Build Status](https://img.shields.io/github/actions/workflow/status/RipperHybrid/meta-overlayfsx/build.yml?branch=main&style=flat&color=purple&label=Build&logo=github)
![License](https://img.shields.io/github/license/RipperHybrid/meta-overlayfsx?style=flat&color=blue)

</div>

**Overlayfsx** is an advanced evolution of the original KernelSU overlayfs metamodule. It introduces a modern WebUI and robust image management to handle modules efficiently using an ext4 image overlay.

## ✨ Key Features

### 1. 🖥️ Modern WebUI
A comprehensive dashboard integrated directly into KernelSU Manager.
- **Dashboard:** Visualize storage usage (ext4 image), mount status, and system stats.
- **Module Manager:** Search, filter, enable/disable modules, and manage uninstalls.
- **Tools:** View/Clear logs, Optimize Storage (hole punching to shrink image size).
- **Design:** Clean, dark-themed, responsive UI.

### 2. 🛡️ Robust Architecture
- **Dual-Directory:** Keeps metadata (props, disable flags) in `/data/adb/modules` and content in a mounted ext4 image.
- **Auto-Repair:** Automatically cleans up orphaned modules or "skip_mount" artifacts on boot.
- **Universal Binary:** Auto-selects `aarch64` or `x86_64` binary during installation.

### 3. ⚡ Storage Optimization
- **Smart Management:** Uses sparse files for the module image.
- **Optimization Tool:** Includes a built-in tool (`xcp`) to punch holes in the image file, reclaiming disk space from deleted modules without destroying the image.

## 📥 Installation

1. Download the latest `overlayfsx-v*.zip` from Releases.
2. Install via KernelSU Manager **OR** via ADB:
```bash
adb push overlayfsx-v1.3.2.zip /sdcard/
adb shell su -c 'ksud module install /sdcard/overlayfsx-v1.3.2.zip'

```

3. Reboot.

## 🚀 Usage

### Accessing the WebUI

1. Open **KernelSU Manager**.
2. Go to the **Modules** tab.
3. Find **OverlayFS Enhanced**.
4. Click the **WebUI** (or Settings) button (if supported by your manager) or access via the local server if configured.

### Storage Optimization

Run this command (or use the WebUI button) to punch holes in the ext4 image and reclaim disk space from deleted files:

```bash
/data/adb/modules/overlayfsx/overlayfsx xcp <src> <dst> --punch-hole

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

* [weishu](https://github.com/tiann)
* [Ylarod](https://github.com/Ylarod)
* [Wang Han](https://github.com/aviraxp)
* [7a72](https://github.com/7a72)

### Open Source

This project uses components from:

* `hole-punch` (Rust crate)
* `rustix` & `procfs`

## 📄 License

Licensed under **GPL-3.0**.
