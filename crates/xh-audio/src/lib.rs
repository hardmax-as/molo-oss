//! `xh-audio`: Molo's audio pipeline (ARCHITECTURE section 5).
//!
//! Takes an editor's recording or upload and produces what the learner
//! surface serves: a trimmed, loudness-normalised, 48 kHz mono Opus file, a
//! FLAC master of the same samples, and a JSON manifest whose shape is
//! frozen in `README.md` and mirrored by `packages/core`.
//!
//! ```no_run
//! use std::path::Path;
//! use xh_audio::{Options, process};
//!
//! let report = process(Path::new("take.wav"), Path::new("out"), &Options::default())?;
//! assert_eq!(report.manifest.sample_rate, 48_000);
//! # Ok::<(), xh_audio::AudioError>(())
//! ```

#![forbid(unsafe_code)]

pub mod decode;
pub mod encode;
pub mod error;
pub mod loudness;
pub mod manifest;
pub mod pipeline;
pub mod resample;
pub mod trim;

pub use error::{AudioError, Result};
pub use manifest::{Manifest, Tool};
pub use pipeline::{Inspection, Options, ProcessReport, inspect, process};
