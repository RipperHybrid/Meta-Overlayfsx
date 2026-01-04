// Overlayfs mounting implementation
// Migrated from ksud/src/mount.rs and ksud/src/init_event.rs

use anyhow::{Context, Result, bail};
use log::{info, warn, debug};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use procfs::process::Process;
use rustix::{fd::AsFd, fs::CWD, mount::*};

use crate::defs::{DISABLE_FILE_NAME, KSU_OVERLAY_SOURCE, SKIP_MOUNT_FILE_NAME, SYSTEM_RW_DIR};

// Mount overlayfs with given layers
pub fn mount_overlayfs(
    lower_dirs: &[String],
    lowest: &str,
    upperdir: Option<PathBuf>,
    workdir: Option<PathBuf>,
    dest: impl AsRef<Path>,
) -> Result<()> {
    let lowerdir_config = lower_dirs
        .iter()
        .map(|s| s.as_ref())
        .chain(std::iter::once(lowest))
        .collect::<Vec<_>>()
        .join(":");
    info!(
        "mount overlayfs on {:?}, lowerdir={}, upperdir={:?}, workdir={:?}",
        dest.as_ref(),
        lowerdir_config,
        upperdir,
        workdir
    );

    let upperdir = upperdir
        .filter(|up| up.exists())
        .map(|e| e.display().to_string());
    let workdir = workdir
        .filter(|wd| wd.exists())
        .map(|e| e.display().to_string());

    let result = (|| {
        let fs = fsopen("overlay", FsOpenFlags::FSOPEN_CLOEXEC)?;
        let fs = fs.as_fd();
        fsconfig_set_string(fs, "lowerdir", &lowerdir_config)?;
        if let (Some(upperdir), Some(workdir)) = (&upperdir, &workdir) {
            fsconfig_set_string(fs, "upperdir", upperdir)?;
            fsconfig_set_string(fs, "workdir", workdir)?;
        }
        fsconfig_set_string(fs, "source", KSU_OVERLAY_SOURCE)?;
        fsconfig_create(fs)?;
        let mount = fsmount(fs, FsMountFlags::FSMOUNT_CLOEXEC, MountAttrFlags::empty())?;
        move_mount(
            mount.as_fd(),
            "",
            CWD,
            dest.as_ref(),
            MoveMountFlags::MOVE_MOUNT_F_EMPTY_PATH,
        )
    })();

    if let Err(e) = result {
        warn!("fsopen mount failed: {e:#}, fallback to mount");
        let mut data = format!("lowerdir={lowerdir_config}");
        if let (Some(upperdir), Some(workdir)) = (upperdir, workdir) {
            data = format!("{data},upperdir={upperdir},workdir={workdir}");
        }
        mount(
            KSU_OVERLAY_SOURCE,
            dest.as_ref(),
            "overlay",
            MountFlags::empty(),
            data,
        )?;
    }
    Ok(())
}

// Bind mount from source to destination
pub fn bind_mount(from: impl AsRef<Path>, to: impl AsRef<Path>) -> Result<()> {
    // We use debug! here to avoid spamming logs during massive recursive binds
    debug!(
        "bind mount {} -> {}",
        from.as_ref().display(),
        to.as_ref().display()
    );
    let tree = open_tree(
        CWD,
        from.as_ref(),
        OpenTreeFlags::OPEN_TREE_CLOEXEC
            | OpenTreeFlags::OPEN_TREE_CLONE
            | OpenTreeFlags::AT_RECURSIVE,
    )?;
    move_mount(
        tree.as_fd(),
        "",
        CWD,
        to.as_ref(),
        MoveMountFlags::MOVE_MOUNT_F_EMPTY_PATH,
    )?;
    Ok(())
}

// Mount overlay for child mount points
fn mount_overlay_child(
    mount_point: &str,
    relative: &String,
    module_roots: &Vec<String>,
    stock_root: &String,
) -> Result<()> {
    if !module_roots
        .iter()
        .any(|lower| Path::new(&format!("{lower}{relative}")).exists())
    {
        return bind_mount(stock_root, mount_point);
    }
    if !Path::new(&stock_root).is_dir() {
        return Ok(());
    }
    let mut lower_dirs: Vec<String> = vec![];
    for lower in module_roots {
        let lower_dir = format!("{lower}{relative}");
        let path = Path::new(&lower_dir);
        if path.is_dir() {
            lower_dirs.push(lower_dir);
        } else if path.exists() {
            // stock root has been blocked by this file
            return Ok(());
        }
    }
    if lower_dirs.is_empty() {
        return Ok(());
    }
    // merge modules and stock
    if let Err(e) = mount_overlayfs(&lower_dirs, stock_root, None, None, mount_point) {
        warn!("failed: {e:#}, fallback to bind mount");
        bind_mount(stock_root, mount_point)?;
    }
    Ok(())
}

// Mount overlay with module layers and optional upperdir/workdir
pub fn mount_overlay(
    root: &String,
    module_roots: &Vec<String>,
    workdir: Option<PathBuf>,
    upperdir: Option<PathBuf>,
) -> Result<()> {
    info!("mount overlay for {root}");
    std::env::set_current_dir(root).with_context(|| format!("failed to chdir to {root}"))?;
    let stock_root = ".";

    // collect child mounts before mounting the root
    let mounts = Process::myself()?
        .mountinfo()
        .with_context(|| "get mountinfo")?;
    let mut mount_seq = mounts
        .0
        .iter()
        .filter(|m| {
            m.mount_point.starts_with(root) && !Path::new(&root).starts_with(&m.mount_point)
        })
        .map(|m| m.mount_point.to_str())
        .collect::<Vec<_>>();
    mount_seq.sort();
    mount_seq.dedup();

    mount_overlayfs(module_roots, root, upperdir, workdir, root)
        .with_context(|| "mount overlayfs for root failed")?;
    for mount_point in mount_seq.iter() {
        let Some(mount_point) = mount_point else {
            continue;
        };
        let relative = mount_point.replacen(root, "", 1);
        let stock_root: String = format!("{stock_root}{relative}");
        if !Path::new(&stock_root).exists() {
            continue;
        }
        if let Err(e) = mount_overlay_child(mount_point, &relative, module_roots, &stock_root) {
            warn!("failed to mount overlay for child {mount_point}: {e:#}, revert");
            umount_dir(root).with_context(|| format!("failed to revert {root}"))?;
            bail!(e);
        }
    }
    Ok(())
}

// Unmount directory
pub fn umount_dir(src: impl AsRef<Path>) -> Result<()> {
    unmount(src.as_ref(), UnmountFlags::empty())
        .with_context(|| format!("Failed to umount {}", src.as_ref().display()))?;
    Ok(())
}

// Mount a single partition with given lowerdir layers
fn mount_partition(partition_name: &str, lowerdir: &Vec<String>) -> Result<()> {
    if lowerdir.is_empty() {
        warn!("partition: {partition_name} lowerdir is empty");
        return Ok(());
    }

    let partition = format!("/{partition_name}");

    // if /partition is a symlink and linked to /system/partition, don't overlay separately
    if Path::new(&partition).read_link().is_ok() {
        warn!("partition: {partition} is a symlink");
        return Ok(());
    }

    let mut workdir = None;
    let mut upperdir = None;
    let system_rw_dir = Path::new(SYSTEM_RW_DIR);
    if system_rw_dir.exists() {
        workdir = Some(system_rw_dir.join(partition_name).join("workdir"));
        upperdir = Some(system_rw_dir.join(partition_name).join("upperdir"));
    }

    mount_overlay(&partition, lowerdir, workdir, upperdir)
}

// Collect enabled module IDs from metadata directory
fn collect_enabled_modules(metadata_dir: &str) -> Result<Vec<String>> {
    let dir = std::fs::read_dir(metadata_dir)
        .with_context(|| format!("Failed to read metadata directory: {}", metadata_dir))?;

    let mut enabled = Vec::new();

    for entry in dir.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let module_id = match entry.file_name().to_str() {
            Some(id) => id.to_string(),
            None => continue,
        };

        // Check status markers
        if path.join(DISABLE_FILE_NAME).exists() {
            info!("Module {} is disabled, skipping", module_id);
            continue;
        }

        if path.join(SKIP_MOUNT_FILE_NAME).exists() {
            info!("Module {} has skip_mount, skipping", module_id);
            continue;
        }

        // Verify module.prop exists
        if !path.join("module.prop").exists() && !path.eq(Path::new(SYSTEM_RW_DIR)) {
            warn!("Module {} has no module.prop, skipping", module_id);
            continue;
        }

        info!("Module {} enabled", module_id);
        enabled.push(module_id);
    }

    Ok(enabled)
}

// Build partition lowerdir lists from enabled modules
fn build_partition_lowerdirs(
    enabled_modules: &[String],
    content_dir: &str,
) -> (Vec<String>, HashMap<String, Vec<String>>) {
    let partition = vec!["vendor", "product", "system_ext", "odm", "oem"];
    let mut system_lowerdir: Vec<String> = Vec::new();
    let mut partition_lowerdir: HashMap<String, Vec<String>> = HashMap::new();

    // Initialize partition maps
    for part in &partition {
        partition_lowerdir.insert((*part).to_string(), Vec::new());
    }

    for module_id in enabled_modules {
        let module_content_path = Path::new(content_dir).join(module_id);

        if !module_content_path.exists() {
            warn!("Module {} has no content directory, skipping", module_id);
            continue;
        }

        info!("Processing module: {}", module_id);

        // Collect system partition
        let system_path = module_content_path.join("system");
        if system_path.is_dir() {
            system_lowerdir.push(system_path.display().to_string());
            info!("  + system/");
        }

        // Collect other partitions
        for part in &partition {
            let part_path = module_content_path.join(part);
            if part_path.is_dir()
                && let Some(v) = partition_lowerdir.get_mut(*part)
            {
                v.push(part_path.display().to_string());
                info!("  + {}/", part);
            }
        }
    }

    (system_lowerdir, partition_lowerdir)
}

// Mount all enabled modules systemlessly (dual-directory mode)
pub fn mount_modules_systemlessly(metadata_dir: &str, content_dir: &str) -> Result<()> {
    info!("Scanning modules (dual-directory mode)");
    info!("  Metadata: {}", metadata_dir);
    info!("  Content: {}", content_dir);

    // 1. Traverse metadata directory, collect enabled module IDs
    let enabled_modules = collect_enabled_modules(metadata_dir)?;

    if enabled_modules.is_empty() {
        info!("No enabled modules found");
        return Ok(());
    }

    info!("Found {} enabled module(s)", enabled_modules.len());

    // 2. Build partition lowerdir lists
    let (system_lowerdir, partition_lowerdir) = build_partition_lowerdirs(&enabled_modules, content_dir);

    // 3. Mount partitions
    info!("Mounting partitions...");

    if let Err(e) = mount_partition("system", &system_lowerdir) {
        warn!("mount system failed: {e:#}");
    }

    for (k, v) in partition_lowerdir {
        if let Err(e) = mount_partition(&k, &v) {
            warn!("mount {k} failed: {e:#}");
        }
    }

    info!("All partitions processed");
    Ok(())
}

// Helper for "Sticker" mode (Recursive Bind Mount)
// Recursively walks source directory and bind mounts individual files over target.
fn bind_mount_recursive(source: &Path, target: &Path) -> Result<()> {
    if !source.exists() {
        return Ok(());
    }

    if source.is_dir() {
        // If it's a directory, walk inside.
        // We check target existence because we can't recurse into a non-existent dir.
        if !target.exists() {
            // Since your shell script handles the Diff check, this branch 
            // should rarely hit unless a directory was deleted from System.
            // We just return safely.
            return Ok(());
        }

        let entries = fs::read_dir(source).with_context(|| format!("Failed to read dir {}", source.display()))?;
        
        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            let file_name = entry.file_name();
            let new_target = target.join(file_name);
            
            bind_mount_recursive(&path, &new_target)?;
        }
    } else {
        // It's a file
        // CRITICAL: We MUST check target.exists(). 
        // Even if your script says "files are same", we can't bind_mount 
        // if the underlying system path is missing. The kernel will panic/error.
        if target.exists() {
            if let Err(e) = bind_mount(source, target) {
                warn!("Failed to live patch {}: {:#}", target.display(), e);
            } else {
                info!("Live patched: {}", target.display());
            }
        } 
        // We removed the "else" warning here since your script guarantees 
        // we aren't trying to add new files.
    }
    Ok(())
}

// Live patch a specific module using "Sticker" mode (Recursive Bind Mounts)
// This avoids Error 22 (Overlay Loop) and protects other modules.
pub fn patch_specific_module(metadata_dir: &str, content_dir: &str, module_id: &str) -> Result<()> {
    info!("Live patching module: {} (Mode: Recursive Bind)", module_id);

    let metadata_path = Path::new(metadata_dir).join(module_id);
    let content_path = Path::new(content_dir).join(module_id);

    // 1. Basic Validation
    if !metadata_path.exists() {
        bail!("Module {} not found in metadata directory", module_id);
    }
    if !content_path.exists() {
        bail!("Module {} not found in content directory", module_id);
    }
    if metadata_path.join(DISABLE_FILE_NAME).exists() {
        bail!("Module {} is disabled", module_id);
    }
    if metadata_path.join(SKIP_MOUNT_FILE_NAME).exists() {
        bail!("Module {} has skip_mount", module_id);
    }

    info!("Module validation passed. Applying patches...");

    // 2. Define the partitions we support
    let partitions = vec!["system", "vendor", "product", "system_ext", "odm", "oem"];

    // 3. Loop through partitions and apply stickers
    // We don't need to mount other modules because "bind mounts" sit 
    // strictly on top of whatever is currently there (Layer N+1).
    for part in partitions {
        let source_path = content_path.join(part);
        
        // Target path calculation
        // /data/.../system -> /system
        let target_path = Path::new("/").join(part);

        if source_path.exists() {
            info!("Patching partition: /{}", part);
            bind_mount_recursive(&source_path, &target_path)?;
        }
    }

    info!("Live patch completed successfully");
    Ok(())
}