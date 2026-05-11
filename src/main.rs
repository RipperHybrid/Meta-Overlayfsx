use anyhow::Result;
use log::info;

mod defs;
mod mount;
mod xcp;
mod inspect;

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

    // 3. Check for CLI sub-commands
    if matches!(args.get(1), Some(cmd) if cmd == "xcp") {
        return xcp::run(&args[2..]);
    }

    // Execute the active mount inspector, pass remaining args for flags
    if matches!(args.get(1), Some(cmd) if cmd == "inspect") {
        return inspect::run(&args[2..]);
    }

    // 4. Main Mount Sequence
    info!(target: "overlayfsx::main", "Overlayfsx v{}", env!("CARGO_PKG_VERSION"));

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