/** Structural transport options so the CLI can use the same sender without Worker globals. */
interface SlackBindings {
  ENVIRONMENT: "local" | "preview" | "prod";
  SLACK_WEBHOOK_URL?: string;
  SLACK_SIGNUPS_WEBHOOK_URL?: string;
  SLACK_SUBSCRIPTIONS_WEBHOOK_URL?: string;
}

/**
 * Slack incoming webhook, mirroring `sendEmail`: with no `SLACK_WEBHOOK_URL`
 * bound the message is logged instead of posted, so the weekly cron is safe
 * to run in every environment. The webhook URL is a secret and never
 * appears in a log line. The content report uses counts; signups use first names only.
 */
export async function postSlack(
  env: SlackBindings,
  text: string,
  purpose: "content" | "signups" | "subscriptions" = "content",
): Promise<{ posted: boolean }> {
  const key =
    purpose === "signups"
      ? "SLACK_SIGNUPS_WEBHOOK_URL"
      : purpose === "subscriptions"
        ? "SLACK_SUBSCRIPTIONS_WEBHOOK_URL"
        : "SLACK_WEBHOOK_URL";
  const url = env[key];
  if (!url || (purpose !== "content" && env.ENVIRONMENT !== "prod")) {
    console.log(`[slack dry-run] ${purpose}\n${text}`);
    return { posted: false };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, unfurl_links: false, unfurl_media: false }),
      signal: AbortSignal.timeout(3_000),
    });
    if (!res.ok) {
      console.warn(`[slack] ${purpose} delivery failed (HTTP ${res.status})`);
      return { posted: false };
    }
    return { posted: true };
  } catch {
    // Fetch errors may contain the secret URL. Never log the exception or response body.
    console.warn(`[slack] ${purpose} delivery failed or timed out`);
    return { posted: false };
  }
}
