//! The end-to-end pipeline (ARCHITECTURE section 5):
//! decode → trim → resample → normalise → encode Opus + FLAC → manifest.
//!
//! Resampling runs before normalisation so loudness and true peak are
//! measured on the samples that are actually delivered; the manifest then
//! describes the file, not an intermediate.

use std::fs;
use std::path::{Path, PathBuf};

use chrono::{SecondsFormat, Utc};
use serde::Serialize;

use crate::decode::decode_mono;
use crate::encode::{encode_flac, encode_opus_ogg, sha256_hex};
use crate::error::{AudioError, Result};
use crate::loudness::{Measurement, NormaliseReport, measure, normalise};
use crate::manifest::{Manifest, Tool};
use crate::resample::{TARGET_RATE, to_target_rate};
use crate::trim::{TrimReport, samples_to_ms, trim_silence};

/// Processing targets. Defaults are the project's (ARCHITECTURE section 5).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Options {
    /// Integrated loudness target, LUFS.
    pub target_lufs: f64,
    /// True peak ceiling, dBTP.
    pub max_true_peak_dbtp: f64,
    /// Trim threshold, dBFS.
    pub trim_threshold_dbfs: f64,
    /// Silence kept on each side after trimming, ms.
    pub trim_pad_ms: u32,
    /// Opus bitrate, kbit/s.
    pub opus_bitrate_kbps: u32,
}

impl Default for Options {
    fn default() -> Self {
        Self {
            target_lufs: -16.0,
            max_true_peak_dbtp: -1.0,
            trim_threshold_dbfs: -50.0,
            trim_pad_ms: 80,
            opus_bitrate_kbps: 48,
        }
    }
}

/// What `process` wrote and measured.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ProcessReport {
    /// The manifest, also written to `json_path`.
    pub manifest: Manifest,
    /// `<outdir>/<sha256>.opus`
    pub opus_path: PathBuf,
    /// `<outdir>/<sha256>.flac`
    pub flac_path: PathBuf,
    /// `<outdir>/<sha256>.json`
    pub json_path: PathBuf,
    /// Gain applied in dB and whether the peak ceiling decided it.
    pub gain_db: f64,
    /// True when loudness ended below target because the peak ceiling bound.
    pub peak_limited: bool,
}

/// What `inspect` measured, without writing anything.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Inspection {
    /// Source sample rate.
    pub sample_rate: u32,
    /// Source channel count.
    pub channels: usize,
    /// Source duration before trimming, ms.
    pub duration_ms: u64,
    /// Duration after trimming, ms.
    pub trimmed_duration_ms: u64,
    /// Silence that would be removed from the start, ms.
    pub trimmed_leading_ms: u64,
    /// Silence that would be removed from the end, ms.
    pub trimmed_trailing_ms: u64,
    /// Integrated loudness of the trimmed source, LUFS.
    pub lufs_integrated: f64,
    /// True peak of the trimmed source, dBTP.
    pub true_peak_dbtp: f64,
    /// Gain the pipeline would apply, dB.
    pub gain_db: f64,
    /// Whether the peak ceiling would decide that gain.
    pub peak_limited: bool,
}

struct Prepared {
    samples: Vec<f32>,
    source_rate: u32,
    source_channels: usize,
    source_len: usize,
    trim: TrimReport,
}

fn prepare(input: &Path, opts: &Options) -> Result<Prepared> {
    let decoded = decode_mono(input)?;
    let source_len = decoded.samples.len();
    let (kept, trim) = trim_silence(
        &decoded.samples,
        decoded.sample_rate,
        opts.trim_threshold_dbfs,
        opts.trim_pad_ms,
    )?;
    let samples = to_target_rate(kept.to_vec(), decoded.sample_rate)?;
    Ok(Prepared {
        samples,
        source_rate: decoded.sample_rate,
        source_channels: decoded.source_channels,
        source_len,
        trim,
    })
}

fn plan_gain(m: &Measurement, opts: &Options) -> (f64, bool) {
    let gain = opts.target_lufs - m.lufs;
    if m.true_peak_dbtp + gain > opts.max_true_peak_dbtp {
        (opts.max_true_peak_dbtp - m.true_peak_dbtp, true)
    } else {
        (gain, false)
    }
}

/// Measures `input` and reports what processing would do. Writes nothing.
pub fn inspect(input: &Path, opts: &Options) -> Result<Inspection> {
    let p = prepare(input, opts)?;
    let m = measure(&p.samples, TARGET_RATE)?;
    if !m.lufs.is_finite() {
        return Err(AudioError::AllSilent);
    }
    let (gain_db, peak_limited) = plan_gain(&m, opts);
    Ok(Inspection {
        sample_rate: p.source_rate,
        channels: p.source_channels,
        duration_ms: samples_to_ms(p.source_len, p.source_rate),
        trimmed_duration_ms: samples_to_ms(p.samples.len(), TARGET_RATE),
        trimmed_leading_ms: samples_to_ms(p.trim.leading, p.source_rate),
        trimmed_trailing_ms: samples_to_ms(p.trim.trailing, p.source_rate),
        lufs_integrated: m.lufs,
        true_peak_dbtp: m.true_peak_dbtp,
        gain_db,
        peak_limited,
    })
}

/// Runs the whole pipeline on `input`, writing three files into `outdir`
/// named by the Opus file's SHA-256.
pub fn process(input: &Path, outdir: &Path, opts: &Options) -> Result<ProcessReport> {
    let mut p = prepare(input, opts)?;
    let norm: NormaliseReport = normalise(
        &mut p.samples,
        TARGET_RATE,
        opts.target_lufs,
        opts.max_true_peak_dbtp,
    )?;

    let opus = encode_opus_ogg(&p.samples, opts.opus_bitrate_kbps)?;
    let sha256 = sha256_hex(&opus.bytes);
    let flac = encode_flac(&p.samples)?;
    let master_sha256 = sha256_hex(&flac);

    let manifest = Manifest {
        schema_version: 1,
        sha256: sha256.clone(),
        duration_ms: samples_to_ms(p.samples.len(), TARGET_RATE),
        lufs_integrated: norm.after.lufs,
        true_peak_dbtp: norm.after.true_peak_dbtp,
        sample_rate: TARGET_RATE,
        channels: 1,
        codec: "opus".into(),
        bitrate_kbps: opus.bitrate_kbps,
        master_codec: "flac".into(),
        master_sha256,
        trimmed_leading_ms: samples_to_ms(p.trim.leading, p.source_rate),
        trimmed_trailing_ms: samples_to_ms(p.trim.trailing, p.source_rate),
        source_filename: input
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string(),
        processed_at: Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        tool: Tool {
            name: "xh-audio".into(),
            version: env!("CARGO_PKG_VERSION").into(),
        },
    };
    manifest.validate().map_err(AudioError::Manifest)?;

    fs::create_dir_all(outdir)?;
    let opus_path = outdir.join(format!("{sha256}.opus"));
    let flac_path = outdir.join(format!("{sha256}.flac"));
    let json_path = outdir.join(format!("{sha256}.json"));
    fs::write(&opus_path, &opus.bytes)?;
    fs::write(&flac_path, &flac)?;
    fs::write(&json_path, serde_json::to_vec_pretty(&manifest)?)?;

    Ok(ProcessReport {
        manifest,
        opus_path,
        flac_path,
        json_path,
        gain_db: norm.gain_db,
        peak_limited: norm.peak_limited,
    })
}
