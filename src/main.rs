use anyhow::Result;
use log::info;

mod defs;
mod mount;
mod xcp;

fn print_usage() {
    eprintln!("Usage:");
    eprintln!("  meta-overlayfs              - Mount all enabled modules");
    eprintln!("  meta-overlayfs -u <module>  - Live patch specific module");
    eprintln!("  meta-overlayfs xcp <src> <dst> [--punch-hole] - Sparse copy");
}

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    
    // Handle xcp command
    if matches!(args.get(1), Some(cmd) if cmd == "xcp") {
        return xcp::run(&args[2..]);
    }

    // Check if -u flag is present
    let is_update_mode = matches!(args.get(1), Some(flag) if flag == "-u");

    // Always initialize logger (for both normal and -u mode)
    env_logger::builder()
        .filter_level(log::LevelFilter::Info)
        .init();

    // Handle -u flag for specific module patching
    if is_update_mode {
        if args.len() < 3 {
            eprintln!("Error: -u requires module ID");
            print_usage();
            std::process::exit(1);
        }
        
        info!("meta-overlayfs v{}", env!("CARGO_PKG_VERSION"));
        
        let module_id = &args[2];
        
        let metadata_dir = std::env::var("MODULE_METADATA_DIR")
            .unwrap_or_else(|_| defs::MODULE_METADATA_DIR.to_string());
        let content_dir = std::env::var("MODULE_CONTENT_DIR")
            .unwrap_or_else(|_| defs::MODULE_CONTENT_DIR.to_string());
        
        // Execute with normal logging
        return mount::patch_specific_module(&metadata_dir, &content_dir, module_id);
    }

    // Handle help flag
    if matches!(args.get(1), Some(flag) if flag == "-h" || flag == "--help") {
        print_usage();
        return Ok(());
    }

    // Default: mount all modules
    info!("meta-overlayfs v{}", env!("CARGO_PKG_VERSION"));
    
    let metadata_dir = std::env::var("MODULE_METADATA_DIR")
        .unwrap_or_else(|_| defs::MODULE_METADATA_DIR.to_string());
    let content_dir = std::env::var("MODULE_CONTENT_DIR")
        .unwrap_or_else(|_| defs::MODULE_CONTENT_DIR.to_string());

    info!("Metadata directory: {}", metadata_dir);
    info!("Content directory: {}", content_dir);

    // Execute dual-directory mounting
    mount::mount_modules_systemlessly(&metadata_dir, &content_dir)?;

    info!("Mount completed successfully");
    Ok(())
}