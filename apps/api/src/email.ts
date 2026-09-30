import type { Bindings } from "./env.ts";

export interface Email {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

/**
 * Resend when a key is configured (preview/prod); otherwise the message is
 * logged. Workers cannot speak SMTP, so Mailpit is for the Bun-side tools.
 * Sending costs money, so a missing key is a dry run, never an error.
 */
export async function sendEmail(env: Bindings, email: Email): Promise<{ sent: boolean }> {
  if (!env.RESEND_API_KEY) {
    console.log(
      `[email dry-run] to=${email.to} subject=${JSON.stringify(email.subject)}\n${email.text}`,
    );
    return { sent: false };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.RESEND_FROM ?? "Molo <no-reply@molo.example>",
      to: [email.to],
      subject: email.subject,
      text: email.text,
    }),
  });
  if (!res.ok) throw new Error(`resend: ${res.status} ${await res.text()}`);
  return { sent: true };
}
