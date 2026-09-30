import { ageEligibility, type AgeDeclaration } from "@molo/core";
import {
  APIError,
  addOAuthServerContext,
  createAuthMiddleware,
  getOAuthState,
} from "better-auth/api";

/**
 * Where Better Auth creates a user from a social identity: the native id-token
 * sign-in (Apple on iOS, and Google in the integrity tests) and the redirect
 * callback (web, and Google on mobile through the Expo proxy).
 */
const SOCIAL_CREATION_PATHS = new Set(["/sign-in/social", "/callback/:id"]);

/** Installed per request; only eligibility and validated country survive OAuth. */
export function createAgeGate() {
  let ageOk = false;
  let country: AgeDeclaration["country"] | null = null;
  return {
    before: createAuthMiddleware(async (ctx) => {
      ageOk = false;
      country = null;
      const email = ctx.path === "/sign-up/email";
      const social = ctx.path === "/sign-in/social";
      if (!email && !social) return;
      const raw: unknown = email ? ctx.body : ctx.body?.additionalData?.ageDeclaration;
      // A social sign-in without a declaration either finds its account or,
      // on a one-tap sign-up, creates one that waits behind the age step.
      if (social && raw === undefined) return;
      const result = ageEligibility(raw);
      if (!result.ok)
        throw new APIError("BAD_REQUEST", { code: "AGE_REQUIREMENT", message: result.reason });
      ageOk = true;
      // ageEligibility decoded and validated this declaration before we retain its country.
      country = (raw as AgeDeclaration).country;
      if (email) {
        delete ctx.body.birthYear;
        delete ctx.body.country;
        delete ctx.body.ageReached;
      } else {
        delete ctx.body.additionalData.ageDeclaration;
        await addOAuthServerContext({ ageOk: true, country });
      }
    }),
    beforeCreate: async (user: Record<string, unknown>, ctx?: { path?: string } | null) => {
      const oauth = await getOAuthState();
      if (!ageOk && oauth?.serverContext?.["ageOk"] !== true) {
        // One-tap Apple or Google sign-up: the account is created without age
        // proof, and the API blocks it behind the age step (`POST /me/age`)
        // until a declaration is accepted. Every other creation path — e-mail
        // sign-up, magic links — still needs the proof up front.
        if (ctx?.path !== undefined && SOCIAL_CREATION_PATHS.has(ctx.path))
          return { data: { ...user, ageOk: false, agePending: true, country: null } };
        throw new APIError("BAD_REQUEST", { code: "AGE_REQUIREMENT", message: "invalid" });
      }
      const declared = country ?? oauth?.serverContext?.["country"];
      // An OAuth flow started before this deployment can carry only ageOk: keep country unknown.
      const validatedCountry =
        declared === "NO" || declared === "ZA" || declared === "OTHER" ? declared : null;
      return { data: { ...user, ageOk: true, agePending: false, country: validatedCountry } };
    },
  };
}
