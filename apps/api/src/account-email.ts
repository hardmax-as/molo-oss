import { createI18n, type UiLanguage } from "@molo/i18n";

import type { Email } from "./email.ts";

/**
 * Settings → Account → Change email (Better Auth `user.changeEmail`).
 *
 * Better Auth 1.7.2 sends the change link through the same
 * `sendVerificationEmail` callback as a sign-up confirmation, with the user's
 * address already swapped for the new one. The token is the only place that
 * says which kind of mail it is: a change carries `updateTo` (the new
 * address) next to `email` (the current one). The payload is read here only
 * to choose the copy and the recipients; the signature is verified by
 * Better Auth when the link is opened, never here.
 */
export interface EmailChange {
  readonly from: string;
  readonly to: string;
}

export function emailChangeFromToken(token: string): EmailChange | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const json: unknown = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(payload.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
          c.charCodeAt(0),
        ),
      ),
    );
    if (typeof json !== "object" || json === null) return null;
    const { email, updateTo } = json as { email?: unknown; updateTo?: unknown };
    return typeof email === "string" && typeof updateTo === "string" && updateTo !== ""
      ? { from: email, to: updateTo }
      : null;
  } catch {
    return null;
  }
}

/**
 * The link lands on the web app's Settings page, whichever client asked: the
 * learner opens it from a mail app, maybe on another device, and Better Auth
 * signs that browser in when it applies the change. Only the `callbackURL`
 * parameter is replaced; the token is untouched.
 */
export function landOnSettings(url: string, webOrigin: string): string {
  const u = new URL(url);
  u.searchParams.set("callbackURL", `${webOrigin}/settings?email=changed#account`);
  return u.toString();
}

/**
 * Two mails for one request: the link to the new address, and a notice to
 * the current one, which is how the owner learns of a change they did not ask
 * for. The notice carries no link; the change needs the new inbox.
 */
export function emailChangeMails(
  change: EmailChange,
  url: string,
  lang: UiLanguage,
): [verify: Email, notice: Email] {
  const t = createI18n(lang).t;
  return [
    {
      to: change.to,
      subject: t("email.changeVerify.subject"),
      text: t("email.changeVerify.body", { email: change.to, url }),
    },
    {
      to: change.from,
      subject: t("email.changeNotice.subject"),
      text: t("email.changeNotice.body", { email: change.to }),
    },
  ];
}
