//! EBU R128 measurement and gain normalisation.
//!
//! Normalisation is a single gain stage: the gain that brings integrated
//! loudness to the target is computed, and if that gain would push the true
//! peak above the ceiling, the gain is reduced so the peak sits exactly on
//! the ceiling. No limiter or compressor is applied: a citation-form word
//! recording must reach the learner with its dynamics intact, and a take
//! whose peak binds is better re-recorded quieter than squashed. The report
//! says when this happened so the dashboard can flag it.

use ebur128::{EbuR128, Mode};

use crate::error::{AudioError, Result};

/// Integrated loudness and true peak of a signal.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Measurement {
    /// Integrated loudness in LUFS (`-inf` for digital silence).
    pub lufs: f64,
    /// True peak in dBTP (`-inf` for digital silence).
    pub true_peak_dbtp: f64,
}

/// Integrated loudness is gated in 400 ms blocks, so a clip shorter than
/// this many seconds is tiled (repeated end to end) for the loudness
/// measurement only. A one-word take of 250 ms is normal for this project
/// and must measure as the loudness of that word, not as "no complete
/// block". True peak is unaffected by tiling.
pub const MIN_MEASURE_SECONDS: f64 = 3.0;

/// Measures a mono signal.
pub fn measure(samples: &[f32], sample_rate: u32) -> Result<Measurement> {
    let mut meter = EbuR128::new(1, sample_rate, Mode::I | Mode::TRUE_PEAK)?;
    let min_len = (MIN_MEASURE_SECONDS * f64::from(sample_rate)) as usize;
    if samples.is_empty() {
        return Ok(Measurement {
            lufs: f64::NEG_INFINITY,
            true_peak_dbtp: f64::NEG_INFINITY,
        });
    }
    let repeats = min_len.div_ceil(samples.len()).max(1);
    for _ in 0..repeats {
        meter.add_frames_f32(samples)?;
    }
    let lufs = meter.loudness_global()?;
    let peak = meter.true_peak(0)?;
    let true_peak_dbtp = if peak > 0.0 {
        20.0 * peak.log10()
    } else {
        f64::NEG_INFINITY
    };
    Ok(Measurement {
        lufs,
        true_peak_dbtp,
    })
}

/// What normalisation did.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct NormaliseReport {
    /// Before any gain.
    pub before: Measurement,
    /// Gain applied, in dB.
    pub gain_db: f64,
    /// True when the peak ceiling, not the loudness target, decided the gain.
    pub peak_limited: bool,
    /// After the gain, re-measured.
    pub after: Measurement,
}

/// Applies the gain that reaches `target_lufs`, reduced if needed so the
/// true peak stays at or below `max_true_peak_dbtp`.
pub fn normalise(
    samples: &mut [f32],
    sample_rate: u32,
    target_lufs: f64,
    max_true_peak_dbtp: f64,
) -> Result<NormaliseReport> {
    let before = measure(samples, sample_rate)?;
    if !before.lufs.is_finite() || !before.true_peak_dbtp.is_finite() {
        return Err(AudioError::AllSilent);
    }
    let mut gain_db = target_lufs - before.lufs;
    let mut peak_limited = false;
    if before.true_peak_dbtp + gain_db > max_true_peak_dbtp {
        gain_db = max_true_peak_dbtp - before.true_peak_dbtp;
        peak_limited = true;
    }
    let gain = 10f64.powf(gain_db / 20.0) as f32;
    for s in samples.iter_mut() {
        *s *= gain;
    }
    let mut after = measure(samples, sample_rate)?;
    // The interpolated peak can land a hair above the ceiling after rounding;
    // a second, tiny correction keeps the promise in the manifest exact.
    if after.true_peak_dbtp > max_true_peak_dbtp {
        let fix = 10f64.powf((max_true_peak_dbtp - after.true_peak_dbtp) / 20.0) as f32;
        for s in samples.iter_mut() {
            *s *= fix;
        }
        gain_db += 20.0 * f64::from(fix).log10();
        peak_limited = true;
        after = measure(samples, sample_rate)?;
    }
    Ok(NormaliseReport {
        before,
        gain_db,
        peak_limited,
        after,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine(freq: f64, amp: f32, seconds: f64, rate: u32) -> Vec<f32> {
        let n = (seconds * f64::from(rate)) as usize;
        (0..n)
            .map(|i| {
                amp * (2.0 * std::f64::consts::PI * freq * i as f64 / f64::from(rate)).sin() as f32
            })
            .collect()
    }

    #[test]
    fn a_quiet_sine_is_raised_to_the_target() {
        let mut s = sine(1000.0, 0.05, 2.0, 48_000);
        let r = normalise(&mut s, 48_000, -16.0, -1.0).unwrap();
        assert!(!r.peak_limited, "{r:?}");
        assert!((r.after.lufs - -16.0).abs() < 0.5, "{r:?}");
        assert!(r.after.true_peak_dbtp <= -1.0, "{r:?}");
    }

    #[test]
    fn a_peaky_signal_is_held_at_the_ceiling() {
        // A short click train: high peak, low integrated loudness.
        let mut s = vec![0.0f32; 96_000];
        for i in (0..96_000).step_by(4800) {
            s[i] = 0.9;
        }
        let r = normalise(&mut s, 48_000, -16.0, -1.0).unwrap();
        assert!(r.peak_limited, "{r:?}");
        assert!(r.after.true_peak_dbtp <= -1.0 + 1e-6, "{r:?}");
        assert!(r.after.lufs < -16.0, "{r:?}");
    }

    #[test]
    fn a_short_word_length_burst_still_measures() {
        // 250 ms is shorter than one R128 gating block; tiling makes it measurable.
        let mut s = sine(440.0, 0.1, 0.25, 48_000);
        let r = normalise(&mut s, 48_000, -16.0, -1.0).unwrap();
        assert!(r.after.lufs.is_finite(), "{r:?}");
        assert!((r.after.lufs - -16.0).abs() < 0.5, "{r:?}");
    }

    #[test]
    fn silence_cannot_be_normalised() {
        let mut s = vec![0.0f32; 48_000];
        assert!(matches!(
            normalise(&mut s, 48_000, -16.0, -1.0),
            Err(AudioError::AllSilent)
        ));
    }
}
