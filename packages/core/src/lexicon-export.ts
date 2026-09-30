import { Schema } from "effect";

/** Metadata shipped beside the archive; filenames cannot point outside this package. */
export const LexiconPackageManifest = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  publishedOnly: Schema.Boolean,
  headwords: Schema.Int.pipe(Schema.nonNegative()),
  sentences: Schema.Int.pipe(Schema.nonNegative()),
  exportedAt: Schema.String,
  licence: Schema.Literal("CC-BY-SA-4.0"),
  archive: Schema.Literal("lexicon.tgz"),
  bytes: Schema.Int.pipe(Schema.nonNegative()),
  sha256: Schema.String.pipe(Schema.pattern(/^[a-f0-9]{64}$/)),
});
export type LexiconPackageManifest = typeof LexiconPackageManifest.Type;
