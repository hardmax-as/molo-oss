# xh-audio

The audio pipeline (ARCHITECTURE §5). One input recording in, three files
out: a delivery Opus, a FLAC master, and a manifest. Rust because audio DSP
belongs in a native binary on the Queue consumer's path, not in TypeScript
on a Worker.

```text
xh-audio process <input> <outdir> [--json] [--bitrate 48]
xh-audio inspect <input> [--json]
```

`process` writes `<outdir>/<sha256>.opus`, `<sha256>.flac` and
`<sha256>.json`, where `<sha256>` is the hash of the Opus bytes, so
re-uploads dedupe by content. `inspect` measures and reports what `process`
would do without writing anything.

## Pipeline

| Stage | What | Library |
|---|---|---|
| decode | any of wav, flac, mp3, ogg/vorbis, ogg/opus, webm/opus, aiff → mono f32 | `symphonia` 0.6 (demux + decode); `opus` for Opus packets, which Symphonia does not decode |
| trim | drop leading/trailing samples below −50 dBFS, keep 80 ms pad each side; a wholly silent take is refused | own code |
| resample | to 48 kHz | `rubato` 5, synchronous FFT resampler |
| normalise | gain to −16 LUFS integrated; if that would put the true peak above −1 dBTP, the gain is reduced so the peak sits on the ceiling | `ebur128` |
| encode | Opus 48 kbit/s mono, 20 ms frames, in Ogg (RFC 7845, OpusHead pre-skip from the encoder lookahead); FLAC 24-bit master | `opus` (libopus, built from source via `cmake`), `ogg`, `flacenc` |
| manifest | see below | `serde_json`, `sha2` |

Three deliberate choices:

- **Resample before measuring.** Loudness and true peak in the manifest
  describe the 48 kHz samples that are actually encoded, not the source.
- **No limiter.** When the peak ceiling binds, the file ends up quieter than
  −16 LUFS and the report says `peak_limited: true`. A citation-form word
  with its dynamics squashed is worse for a learner than one that is a
  little quiet; the dashboard should flag these for a quieter retake.
- **A spec-conformant FLAC header.** `flacenc` 0.5.1 puts the last, shorter
  block's length in STREAMINFO's minimum block size; the specification says
  that field excludes the last block. The pipeline corrects the two bytes
  after encoding, because Symphonia refuses to read the file otherwise
  (ffmpeg does not mind). Encoding is single-threaded so the master's bytes
  are reproducible across machines.

## Manifest (frozen, `schema_version: 1`)

Mirrored by `AudioManifest` in `packages/core/src/audio.ts`. Change both or
neither.

```json
{
  "schema_version": 1,
  "sha256": "<64 lower-case hex: SHA-256 of the .opus bytes>",
  "duration_ms": 1180,
  "lufs_integrated": -16.0,
  "true_peak_dbtp": -3.2,
  "sample_rate": 48000,
  "channels": 1,
  "codec": "opus",
  "bitrate_kbps": 48,
  "master_codec": "flac",
  "master_sha256": "<64 lower-case hex: SHA-256 of the .flac bytes>",
  "trimmed_leading_ms": 340,
  "trimmed_trailing_ms": 520,
  "source_filename": "inja__s01__t1.wav",
  "processed_at": "2026-09-03T18:04:11.201Z",
  "tool": { "name": "xh-audio", "version": "0.1.0" }
}
```

Invariants (`Manifest::validate`, also property-tested): both hashes are 64
lower-case hex characters; `duration_ms > 0`; `sample_rate == 48000`;
`channels == 1`; `codec == "opus"`; `master_codec == "flac"`; loudness
values finite; `true_peak_dbtp <= -1.0`; `tool.name == "xh-audio"`.

## Building

`libopus` is compiled from the bundled source by `opusic-sys`, which needs
`cmake` and a C compiler on the PATH (`brew install cmake` locally,
`apt-get install cmake` in CI). No system libopus is needed.

```bash
cargo build --release -p xh-audio
cargo test -p xh-audio          # unit tests + synthetic end-to-end + property tests
```

Tests generate their own WAV files (sine bursts with silence padding); no
recordings are committed.
