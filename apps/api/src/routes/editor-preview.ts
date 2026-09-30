import {
  PreviewPathResponse,
  PreviewUnitResponse,
  PreviewUnitsResponse,
  type AudioRef,
} from "@molo/core";
import { editorPreviewRepo } from "@molo/db";
import { Schema } from "effect";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { enrolledCourse } from "../course.ts";
import type { AppEnv } from "../env.ts";
import { requireEditorial } from "../middleware.ts";
import { publicAudioUrl, signAudioUrl } from "../signing.ts";

export const editorPreviewRoutes = new Hono<AppEnv>()
  .use("*", requireEditorial)
  .use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    await next();
  })
  .get("/path", async (c) => {
    const units = await editorPreviewRepo(c.get("db"), c.get("actor")!).tree(
      (await enrolledCourse(c)).id,
    );
    return c.json(Schema.encodeSync(PreviewPathResponse)({ units }));
  })
  .get("/units", async (c) => {
    const units = await editorPreviewRepo(c.get("db"), c.get("actor")!).tree(
      (await enrolledCourse(c)).id,
    );
    return c.json(Schema.encodeSync(PreviewUnitsResponse)({ units }));
  })
  .get("/units/:slug", async (c) => {
    const sourceLang = c.get("sourceLang");
    const data = await editorPreviewRepo(c.get("db"), c.get("actor")!).unit(
      c.req.param("slug"),
      (await enrolledCourse(c)).id,
      sourceLang,
    );
    if (!data) throw new HTTPException(404, { message: "preview unit not found" });
    const audioAssets: Record<string, AudioRef> = {};
    const byTarget = new Map<string, AudioRef[]>();
    for (const { asset, speaker } of data.audioRows) {
      const audio: AudioRef = {
        id: asset.id,
        tier: asset.tier,
        durationMs: asset.durationMs,
        speaker,
        attribution: asset.tier === "2_native_forvo" ? "Pronunciation by Forvo" : null,
        url:
          asset.status === "published"
            ? publicAudioUrl(c.env.PUBLIC_AUDIO_BASE_URL, asset.r2Key)
            : await signAudioUrl(
                c.env.AUDIO_SIGNING_SECRET,
                c.env.PUBLIC_AUDIO_BASE_URL,
                "private",
                asset.r2Key,
              ),
      };
      audioAssets[asset.id] = audio;
      const key = `${asset.targetKind}:${asset.targetId}`;
      byTarget.set(key, [...(byTarget.get(key) ?? []), audio]);
    }
    const lexemes = Object.fromEntries(
      data.lexemeRows.map(({ row, nounClass }) => {
        const gloss = data.glossRows.find((g) => g.lexemeId === row.id) ?? null;
        const voices = byTarget.get(`lexeme:${row.id}`) ?? [];
        return [row.id, { ...row, nounClass, gloss, voices, audio: voices[0] ?? null }];
      }),
    );
    const sentences = Object.fromEntries(
      data.sentenceRows.map((row) => {
        const gloss = data.sentenceGlossRows.find((g) => g.sentenceId === row.id) ?? null;
        const voices = byTarget.get(`sentence:${row.id}`) ?? [];
        return [
          row.id,
          {
            ...row,
            gloss,
            voices,
            audio: voices[0] ?? null,
            tokens: data.tokens.filter((t) => t.sentenceId === row.id),
          },
        ];
      }),
    );
    // Newest take first, as the learner route picks it.
    const clickAudio = Object.fromEntries(
      [...byTarget.entries()].flatMap(([key, voices]) =>
        key.startsWith("click:") && voices.length > 0
          ? [[key.slice("click:".length), voices[voices.length - 1]!] as const]
          : [],
      ),
    );
    return c.json(
      Schema.encodeSync(PreviewUnitResponse)({
        unit: data.unit,
        sourceLang,
        lexemes,
        sentences,
        audioAssets,
        clickAudio,
      }),
    );
  });
