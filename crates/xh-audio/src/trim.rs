//! Leading and trailing silence removal.

use crate::error::{AudioError, Result};

/// What was cut.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TrimReport {
    /// Samples removed from the start (after keeping the pad).
    pub leading: usize,
    /// Samples removed from the end (after keeping the pad).
    pub trailing: usize,
}

/// Converts a dBFS threshold to a linear amplitude.
pub fn dbfs_to_linear(dbfs: f64) -> f32 {
    10f64.powf(dbfs / 20.0) as f32
}

/// Removes leading and trailing samples whose absolute value stays below
/// `threshold_dbfs`, keeping `pad_ms` of the quiet part on each side so the
/// onset is not clipped. Returns the kept range and the report.
///
/// Errors with [`AudioError::AllSilent`] when nothing in the input crosses
/// the threshold, because a silent take is a recording error, not audio.
pub fn trim_silence(
    samples: &[f32],
    sample_rate: u32,
    threshold_dbfs: f64,
    pad_ms: u32,
) -> Result<(&[f32], TrimReport)> {
    let threshold = dbfs_to_linear(threshold_dbfs);
    let first = samples.iter().position(|s| s.abs() > threshold);
    let last = samples.iter().rposition(|s| s.abs() > threshold);
    let (Some(first), Some(last)) = (first, last) else {
        return Err(AudioError::AllSilent);
    };
    let pad = (u64::from(sample_rate) * u64::from(pad_ms) / 1000) as usize;
    let start = first.saturating_sub(pad);
    let end = (last + 1 + pad).min(samples.len());
    Ok((
        &samples[start..end],
        TrimReport {
            leading: start,
            trailing: samples.len() - end,
        },
    ))
}

/// Samples to milliseconds, rounded to nearest.
pub fn samples_to_ms(samples: usize, sample_rate: u32) -> u64 {
    (samples as u64 * 1000 + u64::from(sample_rate) / 2) / u64::from(sample_rate)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_and_keeps_pad() {
        let rate = 1000;
        let mut s = vec![0.0f32; 1000];
        for x in &mut s[400..600] {
            *x = 0.5;
        }
        let (kept, report) = trim_silence(&s, rate, -50.0, 80).unwrap();
        // 80 ms pad at 1 kHz is 80 samples on each side.
        assert_eq!(
            report,
            TrimReport {
                leading: 320,
                trailing: 320
            }
        );
        assert_eq!(kept.len(), 200 + 160);
    }

    #[test]
    fn pad_is_clamped_at_the_edges() {
        let s = vec![0.5f32; 10];
        let (kept, report) = trim_silence(&s, 1000, -50.0, 80).unwrap();
        assert_eq!(kept.len(), 10);
        assert_eq!(
            report,
            TrimReport {
                leading: 0,
                trailing: 0
            }
        );
    }

    #[test]
    fn silence_is_an_error() {
        let s = vec![0.0001f32; 100];
        assert!(matches!(
            trim_silence(&s, 1000, -50.0, 80),
            Err(AudioError::AllSilent)
        ));
    }

    #[test]
    fn ms_rounding() {
        assert_eq!(samples_to_ms(48_000, 48_000), 1000);
        assert_eq!(samples_to_ms(24, 48_000), 1);
        assert_eq!(samples_to_ms(23, 48_000), 0);
    }
}
