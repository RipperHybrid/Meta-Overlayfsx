use anyhow::Result;
use log::info;

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
mod defs;
mod inspect;
// Mounting needs Android-only syscalls (rustix fork). Gating it lets `cargo test` run on a normal host.
#[cfg(target_os = "android")]
mod mount;
mod xcp;

fn print_help() {
    info!(target: "overlayfsx::help", "Meta OverlayFS Tool (overlayfsx)");
    info!(target: "overlayfsx::help", "Usage: overlayfsx [COMMAND] [OPTIONS]");
    info!(target: "overlayfsx::help", "");
    info!(target: "overlayfsx::help", "Commands:");
    info!(target: "overlayfsx::help", "  (none)      Mount all enabled modules (Default behavior during boot)");
    info!(target: "overlayfsx::help", "  inspect     View active mounts and file conflicts");
    info!(target: "overlayfsx::help", "              Options:");
    info!(target: "overlayfsx::help", "                -r, --raw    Output data in pure JSON format for WebUI parsing");
    info!(target: "overlayfsx::help", "  xcp         Copy sparse file with optional hole punching");
    info!(target: "overlayfsx::help", "              Options:");
    info!(target: "overlayfsx::help", "                --punch-hole Punch holes in the destination file");
    info!(target: "overlayfsx::help", "  -h, --help  Show this help message");
}

fn main() -> Result<()> {
    // 1. Initialize logger FIRST so help menus and early exits can log properly
    env_logger::builder()
        .filter_level(log::LevelFilter::Info)
        .init();

    let args: Vec<String> = std::env::args().collect();

    // 2. Check for help flag early
    if matches!(args.get(1), Some(cmd) if cmd == "-h" || cmd == "--help") {
        print_help();
        return Ok(());
    }

    // 3. `xcp` sub-command
    if matches!(args.get(1), Some(cmd) if cmd == "xcp") {
        return xcp::run(&args[2..]);
    }

    // 4. `inspect` sub-command (remaining args are its flags)
    if matches!(args.get(1), Some(cmd) if cmd == "inspect") {
        return inspect::run(&args[2..]);
    }

    // 5. Default: mount all enabled modules
    info!(target: "overlayfsx::main", "Overlayfsx v{}", env!("CARGO_PKG_VERSION"));
    run_mount()
}

#[cfg(not(target_os = "android"))]
fn run_mount() -> Result<()> {
    anyhow::bail!("mounting is only supported on Android; use `inspect` or `xcp` on this platform")
}

#[cfg(target_os = "android")]
fn run_mount() -> Result<()> {
    // Dual-directory support: metadata + content
    let metadata_dir = std::env::var("MODULE_METADATA_DIR")
        .unwrap_or_else(|_| defs::MODULE_METADATA_DIR.to_string());
    let content_dir = std::env::var("MODULE_CONTENT_DIR")
        .unwrap_or_else(|_| defs::MODULE_CONTENT_DIR.to_string());

    info!(target: "overlayfsx::main", "Metadata directory: {}", metadata_dir);
    info!(target: "overlayfsx::main", "Content directory: {}", content_dir);

    // Execute dual-directory mounting
    mount::mount_modules_systemlessly(&metadata_dir, &content_dir)?;

    info!(target: "overlayfsx::main", "Mount completed successfully");
    Ok(())
}
