// FILE: src/main.rs
use std::fs::File;
use std::io::{self, Write};
use std::thread;
use std::time::{Duration, Instant};

fn parse_arg<T: std::str::FromStr>(value: Option<&str>, default: T) -> T {
    value
        .and_then(|v| v.parse().ok())
        .unwrap_or(default)
}

/// Parse --flag or --flag=value from argv, returning (found, Option<value_str>)
fn get_flag<'a>(args: &'a [String], name: &str) -> Option<Option<&'a str>> {
    let prefix_eq = format!("--{}=", name);
    let exact = format!("--{}", name);
    for arg in args {
        if let Some(val) = arg.strip_prefix(&prefix_eq) {
            return Some(Some(val));
        }
        if arg == &exact {
            return Some(None);
        }
    }
    None
}

fn main() {
    let args: Vec<String> = std::env::args().collect();

    if args.len() < 2 {
        eprintln!("Usage: judge-probe [FLAGS...]");
        eprintln!();
        eprintln!("Flags (all optional values fall back to defaults):");
        eprintln!("  --time[=SECONDS]          Busy-loop CPU work (default: 5s)");
        eprintln!("  --sleep[=SECONDS]         Wall-clock sleep   (default: 5s)");
        eprintln!("  --memory[=MiB]            Allocate memory    (default: 512 MiB)");
        eprintln!("  --exitcode[=CODE]         Exit with code     (default: 1)");
        eprintln!("  --stdout[=MESSAGE]        Print to stdout    (default: 'Hello, world (stdout)')");
        eprintln!("  --stderr[=MESSAGE]        Print to stderr    (default: 'Hello, world (stderr)')");
        eprintln!("  --write[=MiB,DEST]        Write data to stdout/stderr/file (default: 512 MiB, stdout)");
        eprintln!("  --exitsig[=SIGNAL]        Send signal to self (default: 11 / SIGSEGV)");
        eprintln!("  --throw                   Panic with a runtime message (like unhandled exception)");
        eprintln!();
        eprintln!("Multiple flags may be combined. They run in the order listed above.");
        std::process::exit(0);
    }

    // --time[=seconds]: busy loop
    if let Some(val) = get_flag(&args, "time") {
        let seconds: u64 = parse_arg(val, 5);
        eprintln!("[time] Busy-looping for {} second(s)...", seconds);
        let limit = Duration::from_secs(seconds);
        let start = Instant::now();
        let mut dummy: i64 = 0;
        while Instant::now().duration_since(start) < limit {
            dummy = dummy.wrapping_add(1);
        }
        eprintln!("[time] Done. dummy={}", dummy);
    }

    // --sleep[=seconds]: wall-clock sleep
    if let Some(val) = get_flag(&args, "sleep") {
        let seconds: u64 = parse_arg(val, 5);
        eprintln!("[sleep] Sleeping for {} second(s)...", seconds);
        thread::sleep(Duration::from_secs(seconds));
        eprintln!("[sleep] Done.");
    }

    // --memory[=MiB]: allocate and touch memory to prevent optimisation
    if let Some(val) = get_flag(&args, "memory") {
        let mib: usize = parse_arg(val, 512);
        let bytes = mib * 1024 * 1024;
        eprintln!("[memory] Allocating {} MiB...", mib);
        let mut v: Vec<u8> = vec![69u8; bytes];
        // Touch every page so the OS actually commits it, and prevent
        // the compiler from optimising the allocation away entirely.
        std::hint::black_box(v.as_mut_slice());
        eprintln!("[memory] Done.");
    }

    // --stdout[=message]: write a line to stdout
    if let Some(val) = get_flag(&args, "stdout") {
        let msg = val.unwrap_or("Hello, world (stdout)");
        println!("{}", msg);
    }

    // --stderr[=message]: write a line to stderr
    if let Some(val) = get_flag(&args, "stderr") {
        let msg = val.unwrap_or("Hello, world (stderr)");
        eprintln!("{}", msg);
    }

    // --write[=MiB,DEST]: stream data to stdout / stderr / a file path
    //   DEST: "stdout" | "stderr" | <file path>   (default: "stdout")
    if let Some(val) = get_flag(&args, "write") {
        // Parse "MiB,dest" or just "MiB"
        let (mib, dest): (usize, &str) = match val {
            None => (512, "stdout"),
            Some(s) => match s.split_once(',') {
                Some((m, d)) => (parse_arg(Some(m), 512), d),
                None => (parse_arg(Some(s), 512), "stdout"),
            },
        };

        // 64-KiB buffer of repeating base64 alphabet (printable, compresses
        // poorly, safe for binary destinations too)
        const BASE64: &[u8] =
            b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        const BUF_SIZE: usize = 64 * 1024;
        let buf: Vec<u8> = (0..BUF_SIZE).map(|i| BASE64[i % 64]).collect();

        let total_bytes: usize = mib * 1024 * 1024;

        eprintln!("[write] Writing {} MiB to {}...", mib, dest);

        // Helper that does the actual writing loop.
        let write_all = |w: &mut dyn Write| -> io::Result<()> {
            let mut written = 0usize;
            while written < total_bytes {
                let chunk = (total_bytes - written).min(BUF_SIZE);
                w.write_all(&buf[..chunk])?;
                written += chunk;
            }
            w.flush()
        };

        let result = match dest {
            "stdout" => write_all(&mut io::stdout().lock()),
            "stderr" => write_all(&mut io::stderr().lock()),
            path => {
                let mut f = File::create(path).unwrap_or_else(|e| {
                    eprintln!("[write] Cannot open '{}': {}", path, e);
                    std::process::exit(1);
                });
                write_all(&mut f)
            }
        };

        if let Err(e) = result {
            eprintln!("[write] Error during write (disk full?): {}", e);
            std::process::exit(1);
        }

        eprintln!("[write] Done ({} bytes).", total_bytes);
    }

    // --throw: panic (models an unhandled C++ exception / abort)
    if get_flag(&args, "throw").is_some() {
        panic!("unhandled exception: runtime error");
    }

    // --exitsig[=signal]: raise a signal (default SIGSEGV=11)
    // Placed late so other flags can still run first.
    #[cfg(unix)]
    if let Some(val) = get_flag(&args, "exitsig") {
        let sig: libc::c_int = parse_arg(val, 11);
        eprintln!("[exitsig] Raising signal {}...", sig);
        unsafe { 
          libc::signal(sig, libc::SIG_DFL);
          libc::raise(sig);
        };
    }

    // --exitcode[=code]: exit with a specific code (must be last)
    if let Some(val) = get_flag(&args, "exitcode") {
        let code: i32 = parse_arg(val, 1);
        std::process::exit(code);
    }
}