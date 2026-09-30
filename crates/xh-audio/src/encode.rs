//! Opus-in-Ogg delivery file and FLAC master.

use std::borrow::Cow;

use flacenc::bitsink::ByteSink;
use flacenc::component::BitRepr;
use flacenc::error::Verify;
use flacenc::source::MemSource;
use ogg::writing::{PacketWriteEndInfo, PacketWriter};
use opus::{Application, Bitrate, Channels, Encoder};
use sha2::{Digest, Sha256};

use crate::error::{AudioError, Result};
use crate::resample::TARGET_RATE;

/// Opus frame length at 48 kHz: 20 ms, the codec's default and the size
/// with the best quality/latency balance for speech.
const OPUS_FRAME: usize = 960;
/// Ogg stream serial. Any value works; a fixed one keeps output reproducible.
const OGG_SERIAL: u32 = 0x4d4f_4c4f; // "MOLO"

/// An encoded Opus file and the facts the manifest needs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpusFile {
    /// Complete Ogg/Opus file bytes (RFC 7845).
    pub bytes: Vec<u8>,
    /// Encoder lookahead written to OpusHead, in 48 kHz samples.
    pub pre_skip: u16,
    /// Target bitrate in kbit/s.
    pub bitrate_kbps: u32,
}

fn opus_head(pre_skip: u16) -> Vec<u8> {
    let mut h = Vec::with_capacity(19);
    h.extend_from_slice(b"OpusHead");
    h.push(1); // version
    h.push(1); // channel count
    h.extend_from_slice(&pre_skip.to_le_bytes());
    h.extend_from_slice(&TARGET_RATE.to_le_bytes()); // original input sample rate
    h.extend_from_slice(&0i16.to_le_bytes()); // output gain
    h.push(0); // channel mapping family 0: mono/stereo
    h
}

fn opus_tags() -> Vec<u8> {
    let vendor = format!("xh-audio {}", env!("CARGO_PKG_VERSION"));
    let mut t = Vec::new();
    t.extend_from_slice(b"OpusTags");
    t.extend_from_slice(&(vendor.len() as u32).to_le_bytes());
    t.extend_from_slice(vendor.as_bytes());
    t.extend_from_slice(&0u32.to_le_bytes()); // no user comments
    t
}

/// Encodes 48 kHz mono samples to an Ogg/Opus file at `bitrate_kbps`.
pub fn encode_opus_ogg(samples: &[f32], bitrate_kbps: u32) -> Result<OpusFile> {
    let mut encoder = Encoder::new(TARGET_RATE, Channels::Mono, Application::Audio)?;
    encoder.set_bitrate(Bitrate::Bits((bitrate_kbps * 1000) as i32))?;
    let pre_skip = u16::try_from(encoder.get_lookahead()?)
        .map_err(|_| AudioError::Opus("lookahead does not fit in u16".into()))?;

    let mut bytes = Vec::new();
    {
        let mut writer = PacketWriter::new(&mut bytes);
        writer.write_packet(
            opus_head(pre_skip),
            OGG_SERIAL,
            PacketWriteEndInfo::EndPage,
            0,
        )?;
        writer.write_packet(opus_tags(), OGG_SERIAL, PacketWriteEndInfo::EndPage, 0)?;

        let total = samples.len();
        let n_frames = total.div_ceil(OPUS_FRAME).max(1);
        let mut frame = [0f32; OPUS_FRAME];
        let mut packet = vec![0u8; 4000];
        for i in 0..n_frames {
            let start = i * OPUS_FRAME;
            let end = (start + OPUS_FRAME).min(total);
            frame.fill(0.0);
            if start < end {
                frame[..end - start].copy_from_slice(&samples[start..end]);
            }
            let n = encoder.encode_float(&frame, &mut packet)?;
            let last = i + 1 == n_frames;
            // Granule position = pre_skip + samples decodable so far; on the
            // last page it points at the true end so decoders drop the padding.
            let granule = if last {
                u64::from(pre_skip) + total as u64
            } else {
                u64::from(pre_skip) + ((i + 1) * OPUS_FRAME) as u64
            };
            let info = if last {
                PacketWriteEndInfo::EndStream
            } else {
                PacketWriteEndInfo::NormalPacket
            };
            writer.write_packet(Cow::Owned(packet[..n].to_vec()), OGG_SERIAL, info, granule)?;
        }
    }
    Ok(OpusFile {
        bytes,
        pre_skip,
        bitrate_kbps,
    })
}

/// FLAC master bit depth. 24 bits keeps the float pipeline's headroom.
pub const FLAC_BITS: usize = 24;

/// Encodes 48 kHz mono samples to a FLAC file at 24 bits.
pub fn encode_flac(samples: &[f32]) -> Result<Vec<u8>> {
    let scale = ((1i32 << (FLAC_BITS - 1)) - 1) as f32;
    let ints: Vec<i32> = samples
        .iter()
        .map(|s| (s.clamp(-1.0, 1.0) * scale).round() as i32)
        .collect();
    let source = MemSource::from_samples(&ints, 1, FLAC_BITS, TARGET_RATE as usize);
    let mut config = flacenc::config::Encoder::default();
    // Deterministic, single-threaded output: a master's bytes should not
    // depend on the core count of the machine that made it.
    config.multithread = false;
    let config = config
        .into_verified()
        .map_err(|(_, e)| AudioError::Flac(e.to_string()))?;
    let stream = flacenc::encode_with_fixed_block_size(&config, source, config.block_size)
        .map_err(|e| AudioError::Flac(e.to_string()))?;
    let mut sink = ByteSink::new();
    stream
        .write(&mut sink)
        .map_err(|e| AudioError::Flac(e.to_string()))?;
    let mut bytes = sink.as_slice().to_vec();
    fix_streaminfo_min_block_size(&mut bytes)?;
    Ok(bytes)
}

/// flacenc 0.5.1 writes the size of the final, shorter block into
/// STREAMINFO's *minimum block size*. The FLAC specification defines that
/// field as the minimum block size used in the stream *excluding the last
/// block*, so for a fixed-block-size stream it must equal the maximum.
/// ffmpeg tolerates the discrepancy; Symphonia's frame parser does not and
/// fails to sync at all. This rewrites the two bytes so the master is
/// spec-conformant and decodable by both. MD5 and frames are untouched.
fn fix_streaminfo_min_block_size(bytes: &mut [u8]) -> Result<()> {
    // "fLaC" (4) + metadata block header (4) + STREAMINFO: min (2), max (2), ...
    if bytes.len() < 12 || &bytes[..4] != b"fLaC" || bytes[4] & 0x7f != 0 {
        return Err(AudioError::Flac(
            "encoder output does not start with a STREAMINFO block".into(),
        ));
    }
    let (min, max) = ([bytes[8], bytes[9]], [bytes[10], bytes[11]]);
    if min != max {
        bytes[8] = max[0];
        bytes[9] = max[1];
    }
    Ok(())
}

/// Lower-case hex SHA-256 of `bytes`.
pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut out = String::with_capacity(64);
    for b in digest {
        use std::fmt::Write;
        let _ = write!(out, "{b:02x}");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_is_64_lowercase_hex() {
        let h = sha256_hex(b"molo");
        assert_eq!(h.len(), 64);
        assert!(
            h.chars()
                .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
        );
        assert_eq!(
            sha256_hex(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn opus_head_layout() {
        let h = opus_head(312);
        assert_eq!(h.len(), 19);
        assert_eq!(&h[..8], b"OpusHead");
        assert_eq!(h[9], 1);
        assert_eq!(u16::from_le_bytes([h[10], h[11]]), 312);
        assert_eq!(u32::from_le_bytes([h[12], h[13], h[14], h[15]]), 48_000);
    }

    #[test]
    fn encodes_a_short_signal_to_ogg_opus() {
        let s: Vec<f32> = (0..48_000).map(|i| 0.3 * (i as f32 * 0.05).sin()).collect();
        let f = encode_opus_ogg(&s, 48).unwrap();
        assert_eq!(&f.bytes[..4], b"OggS");
        assert!(f.bytes.len() > 1000);
        assert_eq!(f.bitrate_kbps, 48);
    }

    #[test]
    fn encodes_flac_with_signature_and_a_spec_conformant_streaminfo() {
        // 9600 samples: two 4096-sample blocks and a short last one, which is
        // exactly the case where flacenc mis-reports the minimum block size.
        let s: Vec<f32> = (0..9600).map(|i| 0.3 * (i as f32 * 0.05).sin()).collect();
        let bytes = encode_flac(&s).unwrap();
        assert_eq!(&bytes[..4], b"fLaC");
        assert_eq!(
            bytes[4], 0x80,
            "STREAMINFO must be the only (last) metadata block"
        );
        let min = u16::from_be_bytes([bytes[8], bytes[9]]);
        let max = u16::from_be_bytes([bytes[10], bytes[11]]);
        assert_eq!(
            min, max,
            "fixed-block stream: min block size must exclude the last block"
        );
        let rate = u32::from_be_bytes([0, bytes[18], bytes[19], bytes[20]]) >> 4;
        assert_eq!(rate, 48_000);
        let channels = ((bytes[20] >> 1) & 0x7) + 1;
        assert_eq!(channels, 1);
        let bps = (((bytes[20] & 1) as u16) << 4 | (bytes[21] >> 4) as u16) + 1;
        assert_eq!(bps, 24);
    }
}
