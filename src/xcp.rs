use anyhow::{Context, Result, bail};
use hole_punch::*;
use std::{
    fs::{File, OpenOptions},
    io::ErrorKind,
    os::unix::fs::FileExt,
    path::Path,
};

/// Handle the `xcp` command: copy sparse file with optional hole punching.
pub fn run(args: &[String]) -> Result<()> {
    let mut positional: Vec<&str> = Vec::with_capacity(2);
    let mut punch_hole = false;

    for arg in args {
        match arg.as_str() {
            "--punch-hole" => punch_hole = true,
            "-h" | "--help" => {
                print_usage();
                return Ok(());
            }
            _ => positional.push(arg),
        }
    }

    if positional.len() < 2 {
        print_usage();
        bail!("xcp requires source and destination paths");
    }
    if positional.len() > 2 {
        bail!("unexpected argument: {}", positional[2]);
    }

    copy_sparse_file(positional[0], positional[1], punch_hole)
}

fn print_usage() {
    eprintln!("Usage: overlayfsx xcp <src> <dst> [--punch-hole]");
}

/// Size of the I/O buffer used while copying data segments.
const COPY_BUF: usize = 1 << 20; // 1 MiB
/// Granularity used to detect all-zero blocks (matches the usual ext4 block size).
const BLOCK: usize = 4096;

/// Fill `buf` from `file` at `offset`, retrying on short reads.
/// Returns the number of bytes read (less than `buf.len()` only at EOF).
fn read_full_at(file: &File, buf: &mut [u8], mut offset: u64) -> std::io::Result<usize> {
    let mut filled = 0;
    while filled < buf.len() {
        match file.read_at(&mut buf[filled..], offset) {
            Ok(0) => break,
            Ok(n) => {
                filled += n;
                offset += n as u64;
            }
            Err(e) if e.kind() == ErrorKind::Interrupted => continue,
            Err(e) => return Err(e),
        }
    }
    Ok(filled)
}

/// Copy a sparse file. Only data segments of the source are copied. With `punch_hole`,
/// every all-zero 4 KiB block is additionally left unwritten in the (freshly truncated,
/// therefore fully sparse) destination, so zeroed free space becomes a real hole again.
pub fn copy_sparse_file<P: AsRef<Path>, Q: AsRef<Path>>(
    src: P,
    dst: Q,
    punch_hole: bool,
) -> Result<()> {
    let (src, dst) = (src.as_ref(), dst.as_ref());

    if let (Ok(a), Ok(b)) = (src.canonicalize(), dst.canonicalize()) {
        if a == b {
            bail!("source and destination are the same file");
        }
    }

    let mut src_file =
        File::open(src).with_context(|| format!("failed to open {}", src.display()))?;
    let dst_file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(dst)
        .with_context(|| format!("failed to open {}", dst.display()))?;

    let result = copy_segments(&mut src_file, &dst_file, punch_hole);
    if result.is_err() {
        // Never leave a half-written image behind: callers `mv` the destination afterwards.
        drop(dst_file);
        let _ = std::fs::remove_file(dst);
    }
    result
}

fn copy_segments(src_file: &mut File, dst_file: &File, punch_hole: bool) -> Result<()> {
    let total_len = src_file.metadata()?.len();
    dst_file.set_len(total_len)?;

    let segments = src_file.scan_chunks()?;
    let mut buffer = vec![0u8; COPY_BUF];

    for segment in segments {
        if !matches!(segment.segment_type, SegmentType::Data) {
            continue;
        }
        let start = segment.start;
        let end = (segment.end + 1).min(total_len);
        let mut pos = start;

        while pos < end {
            let want = std::cmp::min(buffer.len() as u64, end - pos) as usize;
            let got = read_full_at(src_file, &mut buffer[..want], pos)
                .with_context(|| format!("read failed at offset {pos}"))?;
            if got == 0 {
                break;
            }

            for (i, block) in buffer[..got].chunks(BLOCK).enumerate() {
                if punch_hole && block.iter().all(|&b| b == 0) {
                    continue; // leave a hole
                }
                dst_file
                    .write_all_at(block, pos + (i * BLOCK) as u64)
                    .with_context(|| {
                        format!("write failed at offset {}", pos + (i * BLOCK) as u64)
                    })?;
            }
            pos += got as u64;
        }
    }

    dst_file.sync_all().context("failed to sync destination")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::MetadataExt;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let dir =
            std::env::temp_dir().join(format!("overlayfsx-xcp-{}-{}", std::process::id(), name));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// 8 MiB sparse file: data at the start, an explicit run of zeros, data in the middle and at the end.
    fn make_source(path: &Path) {
        let f = File::create(path).unwrap();
        f.set_len(8 << 20).unwrap();
        f.write_all_at(b"HEAD", 0).unwrap();
        f.write_all_at(&vec![0u8; 256 * 1024], 1 << 20).unwrap(); // zeros that are really allocated
        f.write_all_at(b"MIDDLE", 4 << 20).unwrap();
        f.write_all_at(b"TAIL", (8 << 20) - 4).unwrap();
    }

    #[test]
    fn copy_keeps_content_and_punch_hole_reclaims_zero_blocks() {
        let dir = temp_dir("copy");
        let (src, plain, punched) = (dir.join("src"), dir.join("plain"), dir.join("punched"));
        make_source(&src);

        copy_sparse_file(&src, &plain, false).unwrap();
        copy_sparse_file(&src, &punched, true).unwrap();

        let want = std::fs::read(&src).unwrap();
        assert_eq!(std::fs::read(&plain).unwrap(), want);
        assert_eq!(std::fs::read(&punched).unwrap(), want);
        assert_eq!(std::fs::metadata(&punched).unwrap().len(), 8 << 20);
        // the zero run must not take space in the punched copy
        assert!(
            std::fs::metadata(&punched).unwrap().blocks()
                <= std::fs::metadata(&plain).unwrap().blocks()
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn refuses_identical_source_and_destination() {
        let dir = temp_dir("same");
        let f = dir.join("img");
        make_source(&f);
        assert!(copy_sparse_file(&f, &f, false).is_err());
        assert_eq!(std::fs::read(&f).unwrap()[..4], *b"HEAD"); // untouched
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn failed_copy_leaves_no_destination_behind() {
        let dir = temp_dir("missing");
        let dst = dir.join("out");
        assert!(copy_sparse_file(dir.join("does-not-exist"), &dst, false).is_err());
        assert!(!dst.exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
