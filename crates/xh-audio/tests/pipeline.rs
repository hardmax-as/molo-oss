//! End-to-end and property tests on synthetic signals. No real recordings
//! are used or committed; every input is generated here.

use std::path::{Path, PathBuf};

use proptest::prelude::*;
use xh_audio::decode::decode_mono;
use xh_audio::{Manifest, Options, inspect, process};

/// Writes a 16-bit PCM WAV (mono or stereo) so the pipeline exercises the
/// real demuxer and decoder, not a shortcut.
fn write_wav(path: &Path, rate: u32, channels: u16, interleaved: &[f32]) {
    let data_len = (interleaved.len() * 2) as u32;
    let mut b = Vec::with_capacity(44 + data_len as usize);
    b.extend_from_slice(b"RIFF");
    b.extend_from_slice(&(36 + data_len).to_le_bytes());
    b.extend_from_slice(b"WAVEfmt ");
    b.extend_from_slice(&16u32.to_le_bytes());
    b.extend_from_slice(&1u16.to_le_bytes()); // PCM
    b.extend_from_slice(&channels.to_le_bytes());
    b.extend_from_slice(&rate.to_le_bytes());
    b.extend_from_slice(&(rate * u32::from(channels) * 2).to_le_bytes());
    b.extend_from_slice(&(channels * 2).to_le_bytes());
    b.extend_from_slice(&16u16.to_le_bytes());
    b.extend_from_slice(b"data");
    b.extend_from_slice(&data_len.to_le_bytes());
    for s in interleaved {
        b.extend_from_slice(&((s.clamp(-1.0, 1.0) * 32767.0).round() as i16).to_le_bytes());
    }
    std::fs::write(path, b).unwrap();
}

/// Silence, a sine burst, silence.
fn burst(rate: u32, freq: f64, amp: f32, lead_s: f64, tone_s: f64, tail_s: f64) -> Vec<f32> {
    let n = |s: f64| (s * f64::from(rate)).round() as usize;
    let mut v = vec![0.0f32; n(lead_s)];
    let tone = n(tone_s);
    for i in 0..tone {
        let t = i as f64 / f64::from(rate);
        // Short fades avoid clicks at the edges.
        let fade = (i.min(tone - i) as f64 / (0.005 * f64::from(rate))).min(1.0);
        v.push(amp * (fade * (2.0 * std::f64::consts::PI * freq * t).sin()) as f32);
    }
    v.extend(std::iter::repeat_n(0.0f32, n(tail_s)));
    v
}

fn tmpdir(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("xh-audio-test-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}

#[test]
fn processes_a_wav_burst_to_manifest_opus_and_flac() {
    let dir = tmpdir("basic");
    let input = dir.join("take.wav");
    write_wav(&input, 44_100, 1, &burst(44_100, 440.0, 0.2, 0.4, 1.0, 0.6));

    let report = process(&input, &dir.join("out"), &Options::default()).unwrap();
    let m = &report.manifest;
    m.validate().unwrap();
    assert_eq!(m.sample_rate, 48_000);
    assert_eq!(m.channels, 1);
    assert_eq!(m.codec, "opus");
    assert_eq!(m.master_codec, "flac");
    assert_eq!(m.source_filename, "take.wav");
    // 1.0 s of tone plus 80 ms pad on each side, give or take the fades.
    assert!(
        (1100..=1250).contains(&m.duration_ms),
        "duration {}",
        m.duration_ms
    );
    assert!(
        (300..=400).contains(&m.trimmed_leading_ms),
        "leading {}",
        m.trimmed_leading_ms
    );
    assert!(
        (500..=600).contains(&m.trimmed_trailing_ms),
        "trailing {}",
        m.trimmed_trailing_ms
    );
    assert!(
        (m.lufs_integrated - -16.0).abs() < 1.0,
        "lufs {}",
        m.lufs_integrated
    );
    assert!(m.true_peak_dbtp <= -1.0 + 1e-6);
    assert!(!report.peak_limited);

    // Files exist, named by the opus sha, and the manifest round-trips.
    assert!(report.opus_path.ends_with(format!("{}.opus", m.sha256)));
    assert!(report.flac_path.exists());
    let on_disk: Manifest =
        serde_json::from_slice(&std::fs::read(&report.json_path).unwrap()).unwrap();
    assert_eq!(&on_disk, m);
    assert_eq!(
        xh_audio::encode::sha256_hex(&std::fs::read(&report.opus_path).unwrap()),
        m.sha256
    );
    assert_eq!(
        xh_audio::encode::sha256_hex(&std::fs::read(&report.flac_path).unwrap()),
        m.master_sha256
    );

    // The Opus file decodes back through the same front door (Ogg demux + libopus).
    let back = decode_mono(&report.opus_path).unwrap();
    assert_eq!(back.sample_rate, 48_000);
    let back_ms = back.samples.len() as u64 * 1000 / 48_000;
    assert!(
        (back_ms as i64 - m.duration_ms as i64).abs() <= 25,
        "roundtrip {} vs {}",
        back_ms,
        m.duration_ms
    );

    // And the FLAC master decodes too.
    let master = decode_mono(&report.flac_path).unwrap();
    assert_eq!(master.sample_rate, 48_000);
    assert_eq!(
        xh_audio::trim::samples_to_ms(master.samples.len(), 48_000),
        m.duration_ms
    );
}

#[test]
fn stereo_input_is_downmixed() {
    let dir = tmpdir("stereo");
    let input = dir.join("stereo.wav");
    let mono = burst(48_000, 300.0, 0.3, 0.1, 0.5, 0.1);
    let interleaved: Vec<f32> = mono.iter().flat_map(|s| [*s, *s]).collect();
    write_wav(&input, 48_000, 2, &interleaved);
    let i = inspect(&input, &Options::default()).unwrap();
    assert_eq!(i.channels, 2);
    assert_eq!(i.sample_rate, 48_000);
    assert!(!i.peak_limited);
}

#[test]
fn silence_is_refused() {
    let dir = tmpdir("silent");
    let input = dir.join("silent.wav");
    write_wav(&input, 48_000, 1, &vec![0.0; 48_000]);
    let err = process(&input, &dir.join("out"), &Options::default()).unwrap_err();
    assert!(matches!(err, xh_audio::AudioError::AllSilent), "{err}");
}

#[test]
fn a_hot_transient_is_peak_limited_not_clipped() {
    let dir = tmpdir("peak");
    let input = dir.join("clicks.wav");
    let mut s = vec![0.0f32; 48_000];
    for i in (2400..45_000).step_by(6000) {
        s[i] = 0.95;
        s[i + 1] = -0.95;
    }
    write_wav(&input, 48_000, 1, &s);
    let report = process(&input, &dir.join("out"), &Options::default()).unwrap();
    assert!(report.peak_limited);
    assert!(report.manifest.true_peak_dbtp <= -1.0 + 1e-6);
    assert!(report.manifest.lufs_integrated < -16.0);
}

proptest! {
    #![proptest_config(ProptestConfig { cases: 12, ..ProptestConfig::default() })]

    /// For any plausible word-length sine burst at any common source rate,
    /// the manifest invariants hold and the loudness target is met unless
    /// the peak ceiling binds (which the report says).
    #[test]
    fn manifest_invariants_hold(
        rate in prop::sample::select(vec![16_000u32, 22_050, 44_100, 48_000]),
        freq in 150.0f64..2500.0,
        amp in 0.02f32..0.9,
        lead in 0.0f64..0.4,
        tone in 0.25f64..1.5,
        tail in 0.0f64..0.4,
        stereo in any::<bool>(),
    ) {
        let dir = tmpdir(&format!("prop-{rate}-{}", (freq * 1000.0) as u64));
        let input = dir.join("in.wav");
        let mono = burst(rate, freq, amp, lead, tone, tail);
        if stereo {
            let interleaved: Vec<f32> = mono.iter().flat_map(|s| [*s, *s * 0.5]).collect();
            write_wav(&input, rate, 2, &interleaved);
        } else {
            write_wav(&input, rate, 1, &mono);
        }
        let report = process(&input, &dir.join("out"), &Options::default()).unwrap();
        let m = &report.manifest;
        prop_assert!(m.validate().is_ok(), "{:?}", m.validate());
        prop_assert_eq!(m.sample_rate, 48_000);
        prop_assert!(m.duration_ms > 0);
        prop_assert!(m.true_peak_dbtp <= -1.0 + 1e-6, "peak {}", m.true_peak_dbtp);
        if report.peak_limited {
            prop_assert!(m.lufs_integrated <= -16.0 + 1e-6, "limited but lufs {}", m.lufs_integrated);
        } else {
            prop_assert!((m.lufs_integrated - -16.0).abs() <= 1.0, "lufs {}", m.lufs_integrated);
        }
        // Pad survives only where there was silence to keep: min(lead, 80 ms) each side.
        let expected_ms = ((tone + lead.min(0.08) + tail.min(0.08)) * 1000.0) as i64;
        prop_assert!(
            (m.duration_ms as i64 - expected_ms).abs() <= 60,
            "duration {} vs {}",
            m.duration_ms,
            expected_ms
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
