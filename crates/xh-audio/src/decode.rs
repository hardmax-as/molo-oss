//! Decode any supported container/codec to mono f32 at the source rate.
//!
//! Symphonia demuxes and decodes WAV, FLAC, MP3, Ogg/Vorbis, AIFF and
//! Matroska/WebM. Opus has no Symphonia decoder, so Opus packets from Ogg or
//! WebM (what a browser's MediaRecorder produces) are handed to libopus.

use std::fs::File;
use std::path::Path;

use symphonia::core::codecs::CodecParameters;
use symphonia::core::codecs::audio::well_known::CODEC_ID_OPUS;
use symphonia::core::codecs::audio::{AudioCodecParameters, AudioDecoderOptions};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, FormatReader, TrackType};
use symphonia::core::io::{MediaSourceStream, MediaSourceStreamOptions};
use symphonia::core::meta::MetadataOptions;

use crate::error::{AudioError, Result};

/// Decoded, down-mixed audio.
#[derive(Debug, Clone, PartialEq)]
pub struct Decoded {
    /// Mono samples in -1.0..=1.0 at `sample_rate`.
    pub samples: Vec<f32>,
    /// The source sample rate in Hz.
    pub sample_rate: u32,
    /// How many channels the source had before down-mixing.
    pub source_channels: usize,
}

/// Decodes `path` to mono f32.
pub fn decode_mono(path: &Path) -> Result<Decoded> {
    let file = File::open(path)?;
    let mss = MediaSourceStream::new(Box::new(file), MediaSourceStreamOptions::default());
    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }
    let mut format = symphonia::default::get_probe()
        .probe(
            &hint,
            mss,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .map_err(|e| AudioError::Decode(format!("probe: {e}")))?;
    let track = format
        .default_track(TrackType::Audio)
        .ok_or(AudioError::NoAudioTrack)?;
    let track_id = track.id;
    let params = match &track.codec_params {
        Some(CodecParameters::Audio(p)) => p.clone(),
        _ => return Err(AudioError::NoAudioTrack),
    };
    if params.codec == CODEC_ID_OPUS {
        decode_opus(format.as_mut(), track_id, &params)
    } else {
        decode_symphonia(format.as_mut(), track_id, &params)
    }
}

/// Averages interleaved channels into mono, appending to `out`.
fn downmix_into(interleaved: &[f32], channels: usize, out: &mut Vec<f32>) {
    if channels <= 1 {
        out.extend_from_slice(interleaved);
        return;
    }
    let scale = 1.0 / channels as f32;
    for frame in interleaved.chunks_exact(channels) {
        out.push(frame.iter().sum::<f32>() * scale);
    }
}

fn decode_symphonia(
    format: &mut dyn FormatReader,
    track_id: u32,
    params: &AudioCodecParameters,
) -> Result<Decoded> {
    let mut decoder = symphonia::default::get_codecs()
        .make_audio_decoder(params, &AudioDecoderOptions::default())
        .map_err(|e| AudioError::Decode(format!("decoder: {e}")))?;
    let mut samples = Vec::new();
    let mut sample_rate = params.sample_rate.unwrap_or(0);
    let mut channels = params.channels.as_ref().map_or(0, |c| c.count());
    let mut scratch: Vec<f32> = Vec::new();
    loop {
        let packet = match format.next_packet() {
            Ok(Some(p)) => p,
            Ok(None) => break,
            Err(SymphoniaError::ResetRequired) => break,
            // Some readers (FLAC) report the end of the stream as an I/O EOF.
            Err(SymphoniaError::IoError(e)) if e.kind() == std::io::ErrorKind::UnexpectedEof => {
                break;
            }
            Err(e) => return Err(e.into()),
        };
        if packet.track_id != track_id {
            continue;
        }
        let buf = match decoder.decode(&packet) {
            Ok(b) => b,
            // A corrupt packet is skipped; a broken stream is an error.
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(e) => return Err(AudioError::Decode(format!("decode packet: {e}"))),
        };
        sample_rate = buf.spec().rate();
        channels = buf.spec().channels().count();
        scratch.clear();
        buf.copy_to_vec_interleaved::<f32>(&mut scratch);
        downmix_into(&scratch, channels, &mut samples);
    }
    if sample_rate == 0 || channels == 0 {
        return Err(AudioError::Decode(
            "stream reports no sample rate or channels".into(),
        ));
    }
    Ok(Decoded {
        samples,
        sample_rate,
        source_channels: channels,
    })
}

/// Opus decodes at 48 kHz; `pre_skip` samples from the OpusHead are discarded.
fn decode_opus(
    format: &mut dyn FormatReader,
    track_id: u32,
    params: &AudioCodecParameters,
) -> Result<Decoded> {
    const OPUS_RATE: u32 = 48_000;
    const MAX_FRAME: usize = 5760; // 120 ms at 48 kHz, the largest Opus frame
    let head = params.extra_data.as_deref();
    let (channels, pre_skip) = match head {
        Some(h) if h.len() >= 19 && &h[..8] == b"OpusHead" => (
            usize::from(h[9]),
            usize::from(u16::from_le_bytes([h[10], h[11]])),
        ),
        _ => (params.channels.as_ref().map_or(1, |c| c.count()), 0),
    };
    let opus_channels = match channels {
        1 => opus::Channels::Mono,
        2 => opus::Channels::Stereo,
        n => {
            return Err(AudioError::Decode(format!(
                "opus with {n} channels is not supported"
            )));
        }
    };
    let mut decoder = opus::Decoder::new(OPUS_RATE, opus_channels)?;
    let mut pcm = vec![0f32; MAX_FRAME * channels];
    let mut samples = Vec::new();
    loop {
        let packet = match format.next_packet() {
            Ok(Some(p)) => p,
            Ok(None) => break,
            Err(SymphoniaError::ResetRequired) => break,
            // Some readers (FLAC) report the end of the stream as an I/O EOF.
            Err(SymphoniaError::IoError(e)) if e.kind() == std::io::ErrorKind::UnexpectedEof => {
                break;
            }
            Err(e) => return Err(e.into()),
        };
        if packet.track_id != track_id {
            continue;
        }
        let frames = decoder.decode_float(&packet.data, &mut pcm, false)?;
        downmix_into(&pcm[..frames * channels], channels, &mut samples);
    }
    let samples = if samples.len() > pre_skip {
        samples.split_off(pre_skip)
    } else {
        Vec::new()
    };
    Ok(Decoded {
        samples,
        sample_rate: OPUS_RATE,
        source_channels: channels,
    })
}

#[cfg(test)]
mod tests {
    use super::downmix_into;

    #[test]
    fn downmix_averages_channels() {
        let mut out = Vec::new();
        downmix_into(&[1.0, -1.0, 0.5, 0.5], 2, &mut out);
        assert_eq!(out, vec![0.0, 0.5]);
        let mut mono = Vec::new();
        downmix_into(&[0.25, 0.75], 1, &mut mono);
        assert_eq!(mono, vec![0.25, 0.75]);
    }
}
