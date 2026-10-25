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

/// Directory nesting limit for `walk_dir` (guards against pathological trees).
const MAX_WALK_DEPTH: usize = 64;

// Escape a string for manual JSON building (quotes, backslashes and all control characters).
fn escape_json(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

// /proc/mounts escapes space, tab, newline and backslash as 3-digit octal (\040, \011, \012, \134).
// Undo that so paths with such characters can be matched against the real file system.
fn unescape_mount(s: &str) -> String {
    let b = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'\\'
            && i + 3 < b.len()
            && b[i + 1..i + 4].iter().all(|c| (b'0'..=b'7').contains(c))
        {
            let v = (b[i + 1] - b'0') as u32 * 64
                + (b[i + 2] - b'0') as u32 * 8
                + (b[i + 3] - b'0') as u32;
            if v <= 255 {
                out.push(v as u8);
                i += 4;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

// Recursively collect all file paths under a directory, relative to base.
// Directories are skipped - only files (and symlinks, which overlayfs treats as files) are counted.
// Symlinked directories are NOT followed, so symlink loops cannot hang the walk.
fn walk_dir(dir: &Path, base: &Path, entries: &mut Vec<String>, depth: usize) {
    if depth > MAX_WALK_DEPTH {
        return;
    }
    let Ok(read_dir) = fs::read_dir(dir) else {
        return;
    };
    for entry in read_dir.flatten() {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        let path = entry.path();
        if file_type.is_dir() {
            walk_dir(&path, base, entries, depth + 1);
        } else if let Ok(rel) = path.strip_prefix(base) {
            entries.push(rel.display().to_string());
        }
    }
}

// Parse a mount path to extract the content dir root and module ID.
// Looks for the /mnt/ segment - everything before it is the content dir,
// the first path component after it is the module ID.
fn extract_from_mnt_path(path: &str) -> Option<(String, String)> {
    let idx = path.find("/mnt/")?;
    let content_dir = path[..idx + 4].to_string();
    let remainder = &path[idx + 5..];
    let module_id = remainder.split('/').next().filter(|s| !s.is_empty())?;
    Some((module_id.to_string(), content_dir))
}

fn push_unique(list: &mut Vec<String>, value: &str) {
    if !list.iter().any(|v| v == value) {
        list.push(value.to_string());
    }
}

/// Result of scanning /proc/mounts.
#[derive(Debug, Default, PartialEq)]
struct ActiveMounts {
    /// mount point -> module ids in lowerdir priority order (index 0 wins)
    partitions: BTreeMap<String, Vec<String>>,
    /// content directory the modules live in (empty when nothing was found)
    content_dir: String,
}

/// Find every mount that belongs to us.
///
/// `env_content_dir` is the hint exported by the mount script; when it is absent the content
/// directory is derived from the mount entries themselves.
fn parse_mounts(mounts_data: &str, env_content_dir: Option<&str>) -> ActiveMounts {
    let mut active_partitions: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut resolved_content_dir = env_content_dir
        .map(|d| d.trim_end_matches('/').to_string())
        .unwrap_or_default();

    // Pass 1: OverlayFS mounts (fsopen / new-style kernel path)
    // Each lowerdir entry is a colon-separated list of absolute paths the kernel
    // is stacking. We scan each segment to identify which belong to us.
    for line in mounts_data.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 4 {
            continue;
        }

        let mount_point = unescape_mount(parts[1]);
        let fs_type = parts[2];
        let options = parts[3];

        if fs_type != "overlay" {
            continue;
        }

        if let Some(lowerdir_str) = options.split(',').find(|s| s.starts_with("lowerdir=")) {
            let paths = lowerdir_str.trim_start_matches("lowerdir=");
            let mut modules_in_order: Vec<String> = Vec::new();
            let mut is_our_mount = false;

            for raw_path in paths.split(':') {
                let path = unescape_mount(raw_path);

                // Strategy 1: content dir known - check if this lowerdir segment lives under it
                let matched = if !resolved_content_dir.is_empty() {
                    let prefix = format!("{}/", resolved_content_dir);
                    match path.strip_prefix(&prefix) {
                        Some(remainder) => {
                            match remainder.split('/').next().filter(|s| !s.is_empty()) {
                                Some(module_id) => {
                                    push_unique(&mut modules_in_order, module_id);
                                    true
                                }
                                None => false,
                            }
                        }
                        None => false,
                    }
                } else {
                    false
                };

                // Strategy 2: derive the content dir dynamically from the path itself
                if !matched {
                    if let Some((module_id, content_dir)) = extract_from_mnt_path(&path) {
                        if path.contains("/data/adb/") {
                            is_our_mount = true;
                            if resolved_content_dir.is_empty() {
                                resolved_content_dir = content_dir;
                            }
                            push_unique(&mut modules_in_order, &module_id);
                        }
                    }
                } else {
                    is_our_mount = true;
                }
            }

            if is_our_mount {
                active_partitions.insert(mount_point, modules_in_order);
            }
        }
    }

    // Pass 2: Bind mounts (legacy mount() fallback)
    // When fsopen overlay is rejected, individual dirs are bind-mounted instead.
    // The mount source is a direct path into the content dir rather than a lowerdir entry.
    // e.g. source=<content_dir>/<module_id>/product/media  mount_point=/product/media
    for line in mounts_data.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 3 {
            continue;
        }

        let source = unescape_mount(parts[0]);
        let mount_point = unescape_mount(parts[1]);
        let fs_type = parts[2];

        if fs_type == "overlay" {
            continue;
        }

        // Strategy 1: match source against the already-resolved content dir
        let matched = if !resolved_content_dir.is_empty() {
            let prefix = format!("{}/", resolved_content_dir);
            match source.strip_prefix(&prefix) {
                Some(remainder) => match remainder.split('/').next().filter(|s| !s.is_empty()) {
                    Some(module_id) => {
                        let entry = active_partitions.entry(mount_point.clone()).or_default();
                        push_unique(entry, module_id);
                        true
                    }
                    None => false,
                },
                None => false,
            }
        } else {
            false
        };

        // Strategy 2: content dir not yet known - extract it from the source path
        if !matched {
            if let Some((module_id, content_dir)) = extract_from_mnt_path(&source) {
                if source.contains("/data/adb/") {
                    if resolved_content_dir.is_empty() {
                        resolved_content_dir = content_dir;
                    }
                    let entry = active_partitions.entry(mount_point).or_default();
                    push_unique(entry, &module_id);
                }
            }
        }
    }

    ActiveMounts {
        partitions: active_partitions,
        content_dir: resolved_content_dir,
    }
}

/// Everything learned by walking the module trees.
#[derive(Debug, Default)]
struct Analysis {
    /// module id -> number of distinct overlaid files
    file_counts: BTreeMap<String, usize>,
    /// module id -> logical partitions (e.g. /system/fonts)
    module_partitions: BTreeMap<String, Vec<String>>,
    /// virtual path -> module ids providing it (index 0 = winner)
    file_map: BTreeMap<String, Vec<String>>,
}

/// Walk the file tree under each kernel-confirmed partition for every active module.
/// Sub-partition paths (e.g. /system/fonts, /product/overlay) are derived from file paths
/// rather than mount entries - Android does not create separate mounts for these dirs.
fn analyze(active_partitions: &BTreeMap<String, Vec<String>>, content_dir: &str) -> Analysis {
    let mut result = Analysis::default();
    let mut processed: BTreeMap<String, HashSet<String>> = BTreeMap::new();

    for (partition, modules) in active_partitions {
        let part_name = partition.trim_start_matches('/');

        for module_id in modules {
            let mod_part_path = Path::new(content_dir).join(module_id).join(part_name);
            if !mod_part_path.exists() {
                continue;
            }

            let mut files = Vec::new();
            walk_dir(&mod_part_path, &mod_part_path, &mut files, 0);

            if !files.is_empty() {
                let p_list = result
                    .module_partitions
                    .entry(module_id.clone())
                    .or_default();

                for f in &files {
                    // First path component of a relative file path is its sub-partition dir.
                    // Files sitting directly in the partition root have no sub-dir component.
                    let sub: Option<&str> = if f.contains('/') {
                        f.split('/').next().filter(|s| !s.is_empty())
                    } else {
                        None
                    };

                    let logical_partition = match sub {
                        Some(dir) => format!("/{}/{}", part_name, dir),
                        None => format!("/{}", part_name),
                    };

                    if !p_list.contains(&logical_partition) {
                        p_list.push(logical_partition);
                    }
                }
            }

            for f in files {
                let virtual_path = format!("{}/{}", part_name, f);

                // Deduplicate per module to avoid inflated counts from nested bind mounts
                // where the same file can appear under both /product and /product/media entries.
                let seen = processed.entry(module_id.clone()).or_default();
                if seen.insert(virtual_path.clone()) {
                    *result.file_counts.entry(module_id.clone()).or_insert(0) += 1;
                }

                // Track all modules providing each virtual path to detect conflicts.
                // Left-to-right lowerdir order means index 0 is the winner.
                let conflict_list = result.file_map.entry(virtual_path).or_default();
                if !conflict_list.contains(module_id) {
                    conflict_list.push(module_id.clone());
                }
            }
        }
    }

    result
}

/// Collapse sub-paths so the display list only shows top-level partition roots.
/// e.g. if both /product and /product/media are present, /product/media is hidden.
fn display_roots(active_partitions: &BTreeMap<String, Vec<String>>) -> Vec<&str> {
    let mut display_partitions: Vec<&str> = Vec::new();
    for p in active_partitions.keys() {
        let is_sub = display_partitions
            .iter()
            .any(|base| p.starts_with(&format!("{}/", base)));
        if !is_sub {
            display_partitions.push(p.as_str());
        }
    }
    display_partitions
}

pub fn run(args: &[String]) -> Result<()> {
    let is_raw = args.contains(&"-r".to_string()) || args.contains(&"--raw".to_string());

    if !is_raw {
        info!(target: "overlayfsx::inspect", "Meta OverlayFS - Real-Time Kernel Inspector");
        info!(target: "overlayfsx::inspect", "Querying /proc/mounts for actual active overlays...");
    }

    let mounts_data = fs::read_to_string("/proc/mounts").unwrap_or_default();

    // Primary hint - exported by the mount script before invoking the binary.
    // If absent, the dynamic fallback in parse_mounts discovers the path from /proc/mounts instead.
    let env_content_dir = std::env::var("MODULE_CONTENT_DIR").ok();

    let ActiveMounts {
        partitions: active_partitions,
        content_dir: resolved_content_dir,
    } = parse_mounts(&mounts_data, env_content_dir.as_deref());

    if active_partitions.is_empty() || resolved_content_dir.is_empty() {
        if is_raw {
            println!(
                "{{ \"status\": \"error\", \"message\": \"No active Meta OverlayFS mounts found in the kernel.\" }}"
            );
        } else {
            info!(target: "overlayfsx::inspect", "CRITICAL: No active Meta OverlayFS mounts found in the kernel.");
            info!(target: "overlayfsx::inspect", "The mount process likely failed or the device has not rebooted.");
        }
        return Ok(());
    }

    let display_partitions = display_roots(&active_partitions);

    if !is_raw {
        info!(target: "overlayfsx::inspect", "Mounted: {}", display_partitions.join(", "));
    }

    let Analysis {
        file_counts: global_module_file_counts,
        module_partitions,
        file_map: global_file_map,
    } = analyze(&active_partitions, &resolved_content_dir);

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

        let parts_str = display_partitions
            .iter()
            .map(|p| format!("\"{}\"", escape_json(p)))
            .collect::<Vec<_>>()
            .join(", ");
        json.push_str(&format!("  \"partitions\": [{}],\n", parts_str));

        json.push_str("  \"modules\": [\n");
        let mut mods_str = Vec::new();
        for mod_id in &active_modules {
            let count = global_module_file_counts.get(mod_id).copied().unwrap_or(0);

            let mut m_parts = module_partitions.get(mod_id).cloned().unwrap_or_default();
            m_parts.sort();

            let m_parts_str = m_parts
                .iter()
                .map(|p| format!("\"{}\"", escape_json(p)))
                .collect::<Vec<_>>()
                .join(", ");

            mods_str.push(format!(
                "    {{ \"id\": \"{}\", \"files\": {}, \"partitions\": [{}] }}",
                escape_json(mod_id),
                count,
                m_parts_str
            ));
        }
        json.push_str(&mods_str.join(",\n"));
        json.push_str("\n  ],\n");

        json.push_str("  \"conflicts\": [\n");
        let mut conf_str = Vec::new();
        for (file, mods) in &conflicts {
            let winner = &mods[0];
            let ignored = mods[1..]
                .iter()
                .map(|m| format!("\"{}\"", escape_json(m)))
                .collect::<Vec<_>>()
                .join(", ");
            conf_str.push(format!(
                "    {{ \"file\": \"{}\", \"winner\": \"{}\", \"ignored\": [{}] }}",
                escape_json(file),
                escape_json(winner),
                ignored
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    const CD: &str = "/data/adb/metamodule/mnt";

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("overlayfsx-test-{}-{}", std::process::id(), name));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn touch(path: &Path) {
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, b"x").unwrap();
    }

    #[test]
    fn escape_json_handles_quotes_backslashes_and_control_chars() {
        assert_eq!(escape_json("plain"), "plain");
        assert_eq!(escape_json("a\"b\\c"), "a\\\"b\\\\c");
        assert_eq!(escape_json("l1\nl2\r\tend"), "l1\\nl2\\r\\tend");
        assert_eq!(escape_json("\u{1}\u{1f}"), "\\u0001\\u001f");
        assert_eq!(escape_json("ünï/ok"), "ünï/ok");
    }

    #[test]
    fn unescape_mount_decodes_octal_sequences() {
        assert_eq!(unescape_mount("/a\\040b"), "/a b");
        assert_eq!(unescape_mount("x\\011y\\012z"), "x\ty\nz");
        assert_eq!(unescape_mount("back\\134slash"), "back\\slash");
        // not octal / out of range / truncated: left untouched
        assert_eq!(unescape_mount("a\\08b"), "a\\08b");
        assert_eq!(unescape_mount("a\\777b"), "a\\777b");
        assert_eq!(unescape_mount("end\\04"), "end\\04");
        assert_eq!(unescape_mount("trailing\\"), "trailing\\");
        assert_eq!(unescape_mount("/system"), "/system");
    }

    #[test]
    fn extract_from_mnt_path_splits_content_dir_and_module() {
        assert_eq!(
            extract_from_mnt_path("/data/adb/metamodule/mnt/modA/system/app"),
            Some(("modA".to_string(), CD.to_string()))
        );
        assert_eq!(extract_from_mnt_path("/system/bin"), None);
        assert_eq!(extract_from_mnt_path("/data/adb/metamodule/mnt/"), None);
    }

    fn sample_mounts() -> String {
        [
            format!("KSU /system overlay ro,seclabel,relatime,lowerdir={CD}/a/system:{CD}/b/system:/system 0 0"),
            format!("KSU /vendor overlay ro,seclabel,lowerdir={CD}/a/vendor:/vendor 0 0"),
            "KSU /odm overlay ro,lowerdir=/other/place/odm:/odm 0 0".to_string(),
            "/dev/block/loop3 /data/adb/metamodule/mnt ext4 rw,noatime 0 0".to_string(),
            "tmpfs /dev tmpfs rw 0 0".to_string(),
            "short line".to_string(),
        ]
        .join("\n")
    }

    #[test]
    fn parse_mounts_with_env_hint() {
        let m = parse_mounts(&sample_mounts(), Some(CD));
        assert_eq!(m.content_dir, CD);
        assert_eq!(m.partitions.len(), 2);
        assert_eq!(m.partitions["/system"], vec!["a", "b"]); // order = priority
        assert_eq!(m.partitions["/vendor"], vec!["a"]);
        assert!(!m.partitions.contains_key("/odm"));
    }

    #[test]
    fn parse_mounts_discovers_content_dir_without_env() {
        let m = parse_mounts(&sample_mounts(), None);
        assert_eq!(m.content_dir, CD);
        assert_eq!(m.partitions["/system"], vec!["a", "b"]);
    }

    #[test]
    fn parse_mounts_trims_trailing_slash_of_env_hint() {
        let m = parse_mounts(&sample_mounts(), Some("/data/adb/metamodule/mnt/"));
        assert_eq!(m.content_dir, CD);
        assert_eq!(m.partitions["/system"], vec!["a", "b"]);
    }

    #[test]
    fn parse_mounts_decodes_escaped_paths() {
        let line = "KSU /my\\040part overlay ro,lowerdir=/data/adb/my\\040mods/mnt/modA/system:/system 0 0";
        let m = parse_mounts(line, None);
        assert_eq!(m.content_dir, "/data/adb/my mods/mnt");
        assert_eq!(m.partitions["/my part"], vec!["modA"]);
    }

    #[test]
    fn parse_mounts_reads_bind_mount_fallback() {
        let data = format!(
            "{CD}/b/product/media /product/media none rw,bind 0 0\n{CD}/c/product/media /product/media none rw,bind 0 0\n{CD}/b/product/media /product/media none rw,bind 0 0"
        );
        let m = parse_mounts(&data, Some(CD));
        assert_eq!(m.partitions["/product/media"], vec!["b", "c"]); // no duplicates
    }

    #[test]
    fn parse_mounts_reports_nothing_when_no_overlay_is_ours() {
        let m = parse_mounts(
            "tmpfs /dev tmpfs rw 0 0\nKSU /odm overlay ro,lowerdir=/x/odm:/odm 0 0",
            None,
        );
        assert!(m.partitions.is_empty());
        assert!(m.content_dir.is_empty());
    }

    #[test]
    fn display_roots_hides_sub_mounts() {
        let mut p = BTreeMap::new();
        for k in ["/product", "/product/media", "/system", "/system_ext"] {
            p.insert(k.to_string(), vec![]);
        }
        assert_eq!(
            display_roots(&p),
            vec!["/product", "/system", "/system_ext"]
        );
    }

    #[test]
    fn walk_dir_counts_files_and_does_not_follow_symlink_loops() {
        let root = temp_dir("walk");
        touch(&root.join("a/one"));
        touch(&root.join("a/b/two"));
        touch(&root.join("top"));
        std::os::unix::fs::symlink(&root, root.join("a/loop")).unwrap(); // would recurse forever if followed
        std::os::unix::fs::symlink("/etc/hosts", root.join("link_file")).unwrap();

        let mut files = Vec::new();
        walk_dir(&root, &root, &mut files, 0);
        files.sort();
        assert_eq!(
            files,
            vec!["a/b/two", "a/loop", "a/one", "link_file", "top"]
        );
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn walk_dir_stops_at_depth_limit() {
        let root = temp_dir("depth");
        let mut deep = root.clone();
        for _ in 0..(MAX_WALK_DEPTH + 5) {
            deep = deep.join("d");
        }
        touch(&deep.join("too_deep"));
        touch(&root.join("shallow"));
        let mut files = Vec::new();
        walk_dir(&root, &root, &mut files, 0);
        assert_eq!(files, vec!["shallow"]);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn analyze_finds_winner_conflicts_and_sub_partitions() {
        let root = temp_dir("analyze");
        touch(&root.join("a/system/app/x.apk"));
        touch(&root.join("a/system/fonts/f.ttf"));
        touch(&root.join("a/system/root_file"));
        touch(&root.join("b/system/app/x.apk"));

        let mut active = BTreeMap::new();
        active.insert(
            "/system".to_string(),
            vec!["a".to_string(), "b".to_string()],
        );
        let r = analyze(&active, root.to_str().unwrap());

        assert_eq!(r.file_counts["a"], 3);
        assert_eq!(r.file_counts["b"], 1);
        assert_eq!(r.file_map["system/app/x.apk"], vec!["a", "b"]); // a wins
        assert_eq!(r.file_map["system/fonts/f.ttf"], vec!["a"]);
        let mut parts = r.module_partitions["a"].clone();
        parts.sort();
        assert_eq!(parts, vec!["/system", "/system/app", "/system/fonts"]);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn analyze_counts_files_once_for_nested_mounts() {
        let root = temp_dir("nested");
        touch(&root.join("a/product/media/m.png"));
        touch(&root.join("a/product/other"));

        let mut active = BTreeMap::new();
        active.insert("/product".to_string(), vec!["a".to_string()]);
        active.insert("/product/media".to_string(), vec!["a".to_string()]);
        let r = analyze(&active, root.to_str().unwrap());

        assert_eq!(r.file_counts["a"], 2); // m.png is reachable via both mounts but counted once
        assert_eq!(r.file_map["product/media/m.png"], vec!["a"]);
        let _ = fs::remove_dir_all(&root);
    }
}
