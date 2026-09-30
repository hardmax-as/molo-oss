//! Sample-rate conversion to 48 kHz with rubato's synchronous FFT resampler.

use rubato::audioadapter_buffers::owned::InterleavedOwned;
use rubato::{Fft, FixedSync, Resampler};

use crate::error::{AudioError, Result};

/// The delivery and master sample rate (ARCHITECTURE section 5).
pub const TARGET_RATE: u32 = 48_000;

/// Resamples mono `samples` from `sample_rate` to 48 kHz. A 48 kHz input is
/// returned untouched.
pub fn to_target_rate(samples: Vec<f32>, sample_rate: u32) -> Result<Vec<f32>> {
    if sample_rate == TARGET_RATE {
        return Ok(samples);
    }
    let frames = samples.len();
    let mut resampler = Fft::<f32>::new(
        sample_rate as usize,
        TARGET_RATE as usize,
        1024,
        1,
        FixedSync::Input,
    )
    .map_err(|e| AudioError::Resample(e.to_string()))?;
    let input = InterleavedOwned::new_from(samples, 1, frames)
        .map_err(|e| AudioError::Resample(e.to_string()))?;
    let output = resampler
        .process_all(&input, frames, None)
        .map_err(|e| AudioError::Resample(e.to_string()))?;
    Ok(output.take_data())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn length_scales_with_the_ratio() {
        let input = vec![0.1f32; 44_100];
        let out = to_target_rate(input, 44_100).unwrap();
        let expected = 48_000;
        assert!(
            (out.len() as i64 - expected).abs() <= 64,
            "got {}",
            out.len()
        );
    }

    #[test]
    fn passthrough_at_48k() {
        let input = vec![0.2f32; 100];
        assert_eq!(to_target_rate(input.clone(), 48_000).unwrap(), input);
    }
}
