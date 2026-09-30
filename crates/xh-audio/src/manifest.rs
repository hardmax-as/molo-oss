//! The manifest written next to every processed asset. This shape is frozen
//! and mirrored by `AudioManifest` in `packages/core/src/audio.ts`; change
//! both or neither.

use serde::{Deserialize, Serialize};

/// Which program produced the asset.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Tool {
    /// Always `"xh-audio"`.
    pub name: String,
    /// The crate version.
    pub version: String,
}

/// `<sha256>.json`, one per processed asset.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Manifest {
    /// Format version; only `1` exists.
    pub schema_version: u8,
    /// SHA-256 of the Opus file bytes, lower-case hex.
    pub sha256: String,
    /// Duration of the delivered audio in milliseconds, after trimming.
    pub duration_ms: u64,
    /// Integrated loudness of the delivered audio, LUFS.
    pub lufs_integrated: f64,
    /// True peak of the delivered audio, dBTP.
    pub true_peak_dbtp: f64,
    /// Always 48000.
    pub sample_rate: u32,
    /// Always 1.
    pub channels: u8,
    /// Always `"opus"`.
    pub codec: String,
    /// Opus target bitrate in kbit/s.
    pub bitrate_kbps: u32,
    /// Always `"flac"`.
    pub master_codec: String,
    /// SHA-256 of the FLAC master bytes, lower-case hex.
    pub master_sha256: String,
    /// Silence removed from the start, in milliseconds of the source.
    pub trimmed_leading_ms: u64,
    /// Silence removed from the end, in milliseconds of the source.
    pub trimmed_trailing_ms: u64,
    /// Basename of the input file.
    pub source_filename: String,
    /// RFC 3339 UTC timestamp of processing.
    pub processed_at: String,
    /// Producer.
    pub tool: Tool,
}

impl Manifest {
    /// The invariants every manifest must satisfy; the property tests and
    /// the TypeScript schema check the same list.
    pub fn validate(&self) -> Result<(), String> {
        let hex64 = |s: &str| {
            s.len() == 64
                && s.bytes()
                    .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
        };
        if self.schema_version != 1 {
            return Err(format!("schema_version {} != 1", self.schema_version));
        }
        if !hex64(&self.sha256) {
            return Err("sha256 is not 64 lower-case hex chars".into());
        }
        if !hex64(&self.master_sha256) {
            return Err("master_sha256 is not 64 lower-case hex chars".into());
        }
        if self.duration_ms == 0 {
            return Err("duration_ms must be positive".into());
        }
        if self.sample_rate != 48_000 {
            return Err(format!("sample_rate {} != 48000", self.sample_rate));
        }
        if self.channels != 1 {
            return Err(format!("channels {} != 1", self.channels));
        }
        if self.codec != "opus" || self.master_codec != "flac" {
            return Err("codec must be opus and master_codec flac".into());
        }
        if !self.lufs_integrated.is_finite() || !self.true_peak_dbtp.is_finite() {
            return Err("loudness values must be finite".into());
        }
        if self.true_peak_dbtp > -1.0 + 1e-6 {
            return Err(format!(
                "true_peak_dbtp {} above -1.0 dBTP",
                self.true_peak_dbtp
            ));
        }
        if self.tool.name != "xh-audio" {
            return Err("tool.name must be xh-audio".into());
        }
        Ok(())
    }
}
