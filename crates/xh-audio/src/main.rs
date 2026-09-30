//! `xh-audio` command line.
//!
//! ```text
//! xh-audio process <input> <outdir> [--json]   decode, trim, normalise, resample, encode, manifest
//! xh-audio inspect <input> [--json]            measure only, write nothing
//! ```

use std::path::PathBuf;
use std::process::ExitCode;

use clap::{Parser, Subcommand};
use xh_audio::{Options, inspect, process};

#[derive(Parser)]
#[command(name = "xh-audio", version, about = "Molo audio pipeline")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Process one file into <outdir>/<sha256>.{opus,flac,json}.
    Process {
        /// Input audio (wav, flac, mp3, ogg/vorbis, ogg/opus, webm/opus, aiff).
        input: PathBuf,
        /// Output directory; created if missing.
        outdir: PathBuf,
        /// Print the report as JSON.
        #[arg(long)]
        json: bool,
        /// Opus bitrate in kbit/s.
        #[arg(long, default_value_t = 48)]
        bitrate: u32,
    },
    /// Measure loudness, true peak and trim points without writing.
    Inspect {
        /// Input audio.
        input: PathBuf,
        /// Print the measurement as JSON.
        #[arg(long)]
        json: bool,
    },
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    match cli.command {
        Command::Process {
            input,
            outdir,
            json,
            bitrate,
        } => {
            let opts = Options {
                opus_bitrate_kbps: bitrate,
                ..Options::default()
            };
            match process(&input, &outdir, &opts) {
                Ok(report) => {
                    if json {
                        println!(
                            "{}",
                            serde_json::to_string_pretty(&report).unwrap_or_default()
                        );
                    } else {
                        let m = &report.manifest;
                        println!("{}", report.opus_path.display());
                        println!("{}", report.flac_path.display());
                        println!("{}", report.json_path.display());
                        println!(
                            "duration {} ms, {:.1} LUFS, peak {:.2} dBTP, gain {:+.1} dB{}, trimmed {}/{} ms",
                            m.duration_ms,
                            m.lufs_integrated,
                            m.true_peak_dbtp,
                            report.gain_db,
                            if report.peak_limited {
                                " (peak-limited)"
                            } else {
                                ""
                            },
                            m.trimmed_leading_ms,
                            m.trimmed_trailing_ms
                        );
                    }
                    ExitCode::SUCCESS
                }
                Err(e) => {
                    eprintln!("xh-audio: {e}");
                    ExitCode::FAILURE
                }
            }
        }
        Command::Inspect { input, json } => match inspect(&input, &Options::default()) {
            Ok(i) => {
                if json {
                    println!("{}", serde_json::to_string_pretty(&i).unwrap_or_default());
                } else {
                    println!(
                        "{} Hz, {} ch, {} ms ({} ms after trim: -{} / -{}), {:.1} LUFS, peak {:.2} dBTP, would apply {:+.1} dB{}",
                        i.sample_rate,
                        i.channels,
                        i.duration_ms,
                        i.trimmed_duration_ms,
                        i.trimmed_leading_ms,
                        i.trimmed_trailing_ms,
                        i.lufs_integrated,
                        i.true_peak_dbtp,
                        i.gain_db,
                        if i.peak_limited {
                            " (peak-limited)"
                        } else {
                            ""
                        }
                    );
                }
                ExitCode::SUCCESS
            }
            Err(e) => {
                eprintln!("xh-audio: {e}");
                ExitCode::FAILURE
            }
        },
    }
}
