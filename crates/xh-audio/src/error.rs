//! One error type for the whole pipeline. Every stage maps its library
//! error into a variant that says which stage failed; the message carries
//! the library's own text.

use std::fmt;

/// Why a file could not be processed.
#[derive(Debug)]
pub enum AudioError {
    /// Reading or writing a file failed.
    Io(std::io::Error),
    /// The container or codec could not be read.
    Decode(String),
    /// The input has no audio track.
    NoAudioTrack,
    /// The input contains no signal above the trim threshold.
    AllSilent,
    /// Loudness measurement failed.
    Loudness(String),
    /// Resampling failed.
    Resample(String),
    /// Opus or Ogg encoding failed.
    Opus(String),
    /// FLAC encoding failed.
    Flac(String),
    /// Manifest serialisation failed.
    Manifest(String),
}

impl fmt::Display for AudioError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AudioError::Io(e) => write!(f, "io: {e}"),
            AudioError::Decode(m) => write!(f, "decode: {m}"),
            AudioError::NoAudioTrack => f.write_str("decode: no audio track in input"),
            AudioError::AllSilent => f.write_str("trim: input is silent throughout"),
            AudioError::Loudness(m) => write!(f, "loudness: {m}"),
            AudioError::Resample(m) => write!(f, "resample: {m}"),
            AudioError::Opus(m) => write!(f, "opus: {m}"),
            AudioError::Flac(m) => write!(f, "flac: {m}"),
            AudioError::Manifest(m) => write!(f, "manifest: {m}"),
        }
    }
}

impl std::error::Error for AudioError {}

impl From<std::io::Error> for AudioError {
    fn from(e: std::io::Error) -> Self {
        AudioError::Io(e)
    }
}

impl From<symphonia::core::errors::Error> for AudioError {
    fn from(e: symphonia::core::errors::Error) -> Self {
        AudioError::Decode(e.to_string())
    }
}

impl From<ebur128::Error> for AudioError {
    fn from(e: ebur128::Error) -> Self {
        AudioError::Loudness(e.to_string())
    }
}

impl From<opus::Error> for AudioError {
    fn from(e: opus::Error) -> Self {
        AudioError::Opus(e.to_string())
    }
}

impl From<serde_json::Error> for AudioError {
    fn from(e: serde_json::Error) -> Self {
        AudioError::Manifest(e.to_string())
    }
}

/// Result alias for the crate.
pub type Result<T> = std::result::Result<T, AudioError>;
