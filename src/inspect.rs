// overlayfsx inspect (Real-Time Kernel Mount Inspector)
//
// Unlike standard user-space simulations that guess what "should" be mounted based on
// folder structures, this tool queries the Linux kernel directly via /proc/mounts.
// It dynamically extracts the exact `lowerdir` parameters the kernel is currently enforcing.
// This eliminates assumptions: if a mount failed, the kernel won't report it here.
// If multiple modules inject the same file, the kernel's left-to-right lowerdir
// priority strictly dictates which file "wins".

use anyhow::Result;
use log::info;
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::Path;

// Safely escape strings for raw JSON manual building
fn escape_json(s: &str) -> String {
    s.replace('\\', "\\\\").replace('\"', "\\\"")
}

// Recursively collect all file paths under a directory, relative to base.
// Directories are skipped — only true files are counted.
fn walk_dir(dir: &Path, base: &Path, entries: &mut Vec<String>) {
    if let Ok(read_dir) = fs::read_dir(dir) {
        for entry in read_dir.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk_dir(&path, base, entries);
            } else if let Ok(rel) = path.strip_prefix(base) {
                entries.push(rel.display().to_string());
            }
        }
    }
}

// Parse a mount path to extract the content dir root and module ID.
// Looks for the /mnt/ segment — everything before it is the content dir,
// the first path component after it is the module ID.
fn extract_from_mnt_path(path: &str) -> Option<(String, String)> {
    let idx = path.find("/mnt/")?;
    let content_dir = path[..idx + 4].to_string();
    let remainder = &path[idx + 5..];
    let module_id = remainder.split('/').next().filter(|s| !s.is_empty())?;
    Some((module_id.to_string(), content_dir))
}

pub fn run(args: &[String]) -> Result<()> {
    let is_raw = args.contains(&"-r".to_string()) || args.contains(&"--raw".to_string());

    if !is_raw {
        info!(target: "overlayfsx::inspect", "Meta OverlayFS - Real-Time Kernel Inspector");
        info!(target: "overlayfsx::inspect", "Querying /proc/mounts for actual active overlays...");
    }

    let mounts_data = fs::read_to_string("/proc/mounts").unwrap_or_default();

    // Primary hint — exported by the mount script before invoking the binary.
    // If absent, the dynamic fallback below discovers the path from /proc/mounts instead.
    let env_content_dir = std::env::var("MODULE_CONTENT_DIR").ok();

    let mut active_partitions: BTreeMap<String, Vec<String>> = BTreeMap::new();

    // Resolved at runtime — either from the env var or extracted from live mount entries.
    // Used for all subsequent file-system lookups so no path is ever hardcoded.
    let mut resolved_content_dir = env_content_dir.clone().unwrap_or_default();

    // Pass 1: OverlayFS mounts (fsopen / new-style kernel path)
    // Each lowerdir entry is a colon-separated list of absolute paths the kernel
    // is stacking. We scan each segment to identify which belong to us.
    for line in mounts_data.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 4 { continue; }

        let mount_point = parts[1];
        let fs_type     = parts[2];
        let options     = parts[3];

        if fs_type != "overlay" { continue; }

        if let Some(lowerdir_str) = options.split(',').find(|s| s.starts_with("lowerdir=")) {
            let paths = lowerdir_str.trim_start_matches("lowerdir=");
            let mut modules_in_order = Vec::new();
            let mut is_our_mount = false;

            for path in paths.split(':') {
                // Strategy 1: env var is set — check if this lowerdir segment lives under it
                let matched = if !resolved_content_dir.is_empty() {
                    let prefix = format!("{}/", resolved_content_dir);
                    if path.starts_with(&prefix) {
                        let remainder = &path[prefix.len()..];
                        if let Some(module_id) = remainder.split('/').next().filter(|s| !s.is_empty()) {
                            if !modules_in_order.contains(&module_id.to_string()) {
                                modules_in_order.push(module_id.to_string());
                            }
                            true
                        } else { false }
                    } else { false }
                } else { false };

                // Strategy 2: no env var — derive content dir dynamically from the path itself
                if !matched {
                    if let Some((module_id, content_dir)) = extract_from_mnt_path(path) {
                        if path.contains("/data/adb/") {
                            is_our_mount = true;
                            if resolved_content_dir.is_empty() {
                                resolved_content_dir = content_dir;
                            }
                            if !modules_in_order.contains(&module_id) {
                                modules_in_order.push(module_id);
                            }
                        }
                    }
                } else {
                    is_our_mount = true;
                }
            }

            if is_our_mount {
                active_partitions.insert(mount_point.to_string(), modules_in_order);
            }
        }
    }

    // Pass 2: Bind mounts (legacy mount() fallback)
    // When fsopen overlay is rejected, individual dirs are bind-mounted instead.
    // The mount source is a direct path into the content dir rather than a lowerdir entry.
    // e.g. source=<content_dir>/<module_id>/product/media  mount_point=/product/media
    for line in mounts_data.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 3 { continue; }

        let source      = parts[0];
        let mount_point = parts[1];
        let fs_type     = parts[2];

        if fs_type == "overlay" { continue; }

        // Strategy 1: match source against the already-resolved content dir
        let matched = if !resolved_content_dir.is_empty() {
            let prefix = format!("{}/", resolved_content_dir);
            if source.starts_with(&prefix) {
                let remainder = &source[prefix.len()..];
                if let Some(module_id) = remainder.splitn(2, '/').next().filter(|s| !s.is_empty()) {
                    let entry = active_partitions.entry(mount_point.to_string()).or_default();
                    if !entry.contains(&module_id.to_string()) {
                        entry.push(module_id.to_string());
                    }
                    true
                } else { false }
            } else { false }
        } else { false };

        // Strategy 2: content dir not yet known — extract it from the source path
        if !matched {
            if let Some((module_id, content_dir)) = extract_from_mnt_path(source) {
                if source.contains("/data/adb/") {
                    if resolved_content_dir.is_empty() {
                        resolved_content_dir = content_dir;
                    }
                    let entry = active_partitions.entry(mount_point.to_string()).or_default();
                    if !entry.contains(&module_id) {
                        entry.push(module_id);
                    }
                }
            }
        }
    }

    if active_partitions.is_empty() || resolved_content_dir.is_empty() {
        if is_raw {
            println!("{{ \"status\": \"error\", \"message\": \"No active Meta OverlayFS mounts found in the kernel.\" }}");
        } else {
            info!(target: "overlayfsx::inspect", "CRITICAL: No active Meta OverlayFS mounts found in the kernel.");
            info!(target: "overlayfsx::inspect", "The mount process likely failed or the device has not rebooted.");
        }
        return Ok(());
    }

    // Collapse sub-paths so the display array only shows top-level partition roots.
    // e.g. if both /product and /product/media are present, /product/media is hidden.
    let mut display_partitions: Vec<&str> = Vec::new();
    for p in active_partitions.keys() {
        let mut is_sub = false;
        for base in &display_partitions {
            if p.starts_with(&format!("{}/", base)) {
                is_sub = true;
                break;
            }
        }
        if !is_sub {
            display_partitions.push(p.as_str());
        }
    }

    if !is_raw {
        info!(target: "overlayfsx::inspect", "Mounted: {}", display_partitions.join(", "));
    }

    let mut global_module_file_counts: BTreeMap<String, usize> = BTreeMap::new();
    let mut module_partitions: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut global_file_map: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut processed_files_per_module: BTreeMap<String, Vec<String>> = BTreeMap::new();

    // Walk the actual file tree under each kernel-confirmed partition for every active module.
    // Sub-partition paths (e.g. /system/fonts, /product/overlay) are derived from file paths
    // rather than mount entries — Android does not create separate mounts for these dirs.
    for (partition, modules) in &active_partitions {
        let part_name = partition.trim_start_matches('/');

        for module_id in modules {
            let mod_part_path = Path::new(&resolved_content_dir)
                .join(module_id)
                .join(part_name);
            if !mod_part_path.exists() { continue; }

            let mut files = Vec::new();
            walk_dir(&mod_part_path, &mod_part_path, &mut files);

            if !files.is_empty() {
                let p_list = module_partitions.entry(module_id.clone()).or_default();

                for f in &files {
                    // First path component of a relative file path is its sub-partition dir.
                    // Files sitting directly in the partition root have no sub-dir component.
                    let sub: Option<&str> = if f.contains('/') {
                        f.splitn(2, '/').next().filter(|s| !s.is_empty())
                    } else {
                        None
                    };

                    let logical_partition = match sub {
                        Some(dir) => format!("/{}/{}", part_name, dir),
                        None      => format!("/{}", part_name),
                    };

                    if !p_list.contains(&logical_partition) {
                        p_list.push(logical_partition);
                    }
                }
            }

            for f in files {
                let virtual_path = format!("{}/{}", part_name, f);

                // Deduplicate per-module to avoid inflated counts from nested bind mounts
                // where the same file can appear under both /product and /product/media entries.
                let module_files = processed_files_per_module.entry(module_id.clone()).or_default();
                if !module_files.contains(&virtual_path) {
                    module_files.push(virtual_path.clone());
                    *global_module_file_counts.entry(module_id.clone()).or_insert(0) += 1;
                }

                // Track all modules providing each virtual path to detect conflicts.
                // Left-to-right lowerdir order means index 0 is the winner.
                let conflict_list = global_file_map.entry(virtual_path).or_default();
                if !conflict_list.contains(module_id) {
                    conflict_list.push(module_id.clone());
                }
            }
        }
    }

    let active_modules: Vec<String> = global_module_file_counts.keys().cloned().collect();
    let mut total_overlaid = 0;
    let mut total_conflicted = 0;
    let mut conflicts: Vec<(String, Vec<String>)> = Vec::new();

    for (file, mods) in &global_file_map {
        total_overlaid += 1;
        if mods.len() > 1 {
            total_conflicted += 1;
            conflicts.push((file.clone(), mods.clone()));
        }
    }

    // 7. Output Routing (JSON vs Human Readable)
    if is_raw {
        let mut json = String::new();
        json.push_str("{\n");
        json.push_str("  \"status\": \"success\",\n");

        let parts_str = display_partitions.iter()
            .map(|p| format!("\"{}\"", escape_json(p)))
            .collect::<Vec<_>>()
            .join(", ");
        json.push_str(&format!("  \"partitions\": [{}],\n", parts_str));

        json.push_str("  \"modules\": [\n");
        let mut mods_str = Vec::new();
        for mod_id in &active_modules {
            let count = global_module_file_counts.get(mod_id).copied().unwrap_or(0);

            let mut m_parts = module_partitions
                .get(mod_id)
                .cloned()
                .unwrap_or_default();
            m_parts.sort();

            let m_parts_str = m_parts.iter()
                .map(|p| format!("\"{}\"", escape_json(p)))
                .collect::<Vec<_>>()
                .join(", ");

            mods_str.push(format!(
                "    {{ \"id\": \"{}\", \"files\": {}, \"partitions\": [{}] }}",
                escape_json(mod_id), count, m_parts_str
            ));
        }
        json.push_str(&mods_str.join(",\n"));
        json.push_str("\n  ],\n");

        json.push_str("  \"conflicts\": [\n");
        let mut conf_str = Vec::new();
        for (file, mods) in &conflicts {
            let winner = &mods[0];
            let ignored = mods[1..].iter()
                .map(|m| format!("\"{}\"", escape_json(m)))
                .collect::<Vec<_>>()
                .join(", ");
            conf_str.push(format!(
                "    {{ \"file\": \"{}\", \"winner\": \"{}\", \"ignored\": [{}] }}",
                escape_json(file), escape_json(winner), ignored
            ));
        }
        json.push_str(&conf_str.join(",\n"));
        json.push_str("\n  ],\n");

        json.push_str("  \"stats\": {\n");
        json.push_str(&format!("    \"total_overlaid\": {},\n", total_overlaid));
        json.push_str(&format!("    \"total_conflicted\": {}\n", total_conflicted));
        json.push_str("  }\n");
        json.push_str("}");

        println!("{}", json);

    } else {
        for (i, mod_id) in active_modules.iter().enumerate() {
            let count = global_module_file_counts.get(mod_id).copied().unwrap_or(0);
            info!(
                target: "overlayfsx::inspect",
                "{}. {}   {} files   [LIVE]",
                i + 1, mod_id, count
            );
        }

        if !conflicts.is_empty() {
            info!(target: "overlayfsx::inspect", "");
            info!(target: "overlayfsx::inspect", "[Conflicts]:");

            let mut seen_signatures = HashSet::new();
            let mut display_lines = Vec::new();

            // Deduplicate visually identical conflict lines caused by Android symlinks
            // pointing multiple paths to the same underlying inode.
            for (file, mods) in &conflicts {
                let winner = &mods[0];
                let mut status_string = format!("[✅ {}]", winner);
                for loser in mods.iter().skip(1) {
                    status_string.push_str(&format!(" [❌ {}]", loser));
                }

                let file_name = file.rsplit('/').next().unwrap_or(file);
                let signature = format!("{} {}", file_name, status_string);

                if seen_signatures.insert(signature) {
                    display_lines.push((file_name.to_string(), status_string));
                }
            }

            let last_idx = display_lines.len().saturating_sub(1);
            for (i, (file_name, status_string)) in display_lines.iter().enumerate() {
                let branch = if i == last_idx { "└─" } else { "├─" };
                info!(
                    target: "overlayfsx::inspect",
                    "  {} {} {}",
                    branch, file_name, status_string
                );
            }

            total_conflicted = display_lines.len();
        }

        info!(target: "overlayfsx::inspect", "Total Overlaid Files: {}", total_overlaid);
        info!(target: "overlayfsx::inspect", "Total Conflicted Files: {}", total_conflicted);
    }

    Ok(())
}