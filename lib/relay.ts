import { AwsClient } from "aws4fetch";
import type { OrgSettings } from "@/lib/settings";

// The "relay" sends email that doesn't go through a rep's connected inbox: invites, password resets,
// and campaign emails for reps without a connected inbox. Amazon SES when SES_* is set, else Resend.

export type RelayMessage = {
  fromName: string;
  fromEmail: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  /** Only honored when the relay can schedule (Resend). */
  sendAt?: Date;
  idempotencyKey?: string;
};

export type RelayResult = { ok: true; id: string } | { ok: false; error: string; retryLater?: boolean };

export type Relay = {
  provider: "ses" | "resend";
  /** Can hand over emails due later (Resend holds them); SES sends only when due. */
  canSchedule: boolean;
  /** Pause between sends to stay under the provider's rate limit. */
  gapMs: number;
  send(m: RelayMessage): Promise<RelayResult>;
};

const RESEND = "https://api.resend.com";

export function sesConfig() {
  const accessKeyId = process.env.SES_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SES_SECRET_ACCESS_KEY;
  const region = process.env.SES_REGION;
  return accessKeyId && secretAccessKey && region ? { accessKeyId, secretAccessKey, region } : null;
}

/** "Name <email>" with the name quoted, or MIME-encoded when it isn't plain ASCII. */
export function formatAddress(name: string, email: string) {
  const n = name.trim();
  if (!n) return email;
  // eslint-disable-next-line no-control-regex
  if (/[^\x20-\x7e]/.test(n)) return `=?UTF-8?B?${Buffer.from(n).toString("base64")}?= <${email}>`;
  return `"${n.replace(/["\\]/g, "\\$&")}" <${email}>`;
}

export function relayFor(org: OrgSettings): Relay | null {
  if (!org.fromEmail) return null;
  const ses = sesConfig();
  if (ses) return sesRelay(ses);
  if (org.resendApiKey) return resendRelay(org.resendApiKey);
  return null;
}

function sesRelay(cfg: { accessKeyId: string; secretAccessKey: string; region: string }): Relay {
  const client = new AwsClient({ accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey, region: cfg.region, service: "ses" });
  return {
    provider: "ses",
    canSchedule: false,
    gapMs: 100, // SES production accounts allow at least 14/second
    async send(m) {
      const res = await client.fetch(`https://email.${cfg.region}.amazonaws.com/v2/email/outbound-emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          FromEmailAddress: formatAddress(m.fromName, m.fromEmail),
          Destination: { ToAddresses: [m.to] },
          ...(m.replyTo ? { ReplyToAddresses: [m.replyTo] } : {}),
          Content: {
            Simple: {
              Subject: { Data: m.subject, Charset: "UTF-8" },
              Body: { Text: { Data: m.text, Charset: "UTF-8" }, Html: { Data: m.html, Charset: "UTF-8" } },
              ...(m.headers ? { Headers: Object.entries(m.headers).map(([Name, Value]) => ({ Name, Value })) } : {}),
            },
          },
        }),
      }).catch((err: unknown) => err instanceof Error ? err : new Error(String(err)));
      if (res instanceof Error) return { ok: false, error: `Amazon SES unreachable: ${res.message}`, retryLater: true };
      const data = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true, id: data.MessageId };
      const type = String(res.headers.get("x-amzn-errortype") ?? data.__type ?? "").split(":")[0];
      const message = data.message ?? data.Message ?? `HTTP ${res.status}`;
      if (res.status === 429 || res.status >= 500 || /TooManyRequests|Throttl/.test(type)) {
        return { ok: false, error: `Amazon SES is busy (${message})`, retryLater: true };
      }
      if (/not verified/i.test(message)) {
        return { ok: false, error: `Amazon SES: ${message}. Verify the domain in SES, and request production access to email unverified recipients.` };
      }
      return { ok: false, error: `Amazon SES: ${message}` };
    },
  };
}

function resendRelay(apiKey: string): Relay {
  return {
    provider: "resend",
    canSchedule: true,
    gapMs: 550, // Resend's default limit is 2 requests/second
    async send(m) {
      const res = await fetch(`${RESEND}/emails`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(m.idempotencyKey ? { "Idempotency-Key": m.idempotencyKey } : {}),
        },
        body: JSON.stringify({
          from: formatAddress(m.fromName, m.fromEmail),
          to: m.to,
          ...(m.replyTo ? { reply_to: m.replyTo } : {}),
          subject: m.subject,
          html: m.html,
          text: m.text,
          ...(m.headers ? { headers: m.headers } : {}),
          ...(m.sendAt ? { scheduled_at: m.sendAt.toISOString() } : {}),
        }),
      }).catch((err: unknown) => err instanceof Error ? err : new Error(String(err)));
      if (res instanceof Error) return { ok: false, error: `Resend unreachable: ${res.message}`, retryLater: true };
      const data = await res.json().catch(() => ({}));
      if (res.ok) return { ok: true, id: data.id };
      const error = data.message ?? data.error ?? `HTTP ${res.status}`;
      return { ok: false, error, retryLater: res.status === 429 || res.status >= 500 };
    },
  };
}

export async function cancelResendScheduled(apiKey: string, id: string) {
  const res = await fetch(`${RESEND}/emails/${id}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
  }).catch(() => null);
  return Boolean(res?.ok);
}

/** Reps whose address is on the company's sending domain can send as themselves through the relay. */
export function relaySender(org: OrgSettings, rep: { name: string; email: string }) {
  const domain = (e: string) => e.split("@")[1]?.toLowerCase() ?? "";
  if (domain(rep.email) && domain(rep.email) === domain(org.fromEmail)) return { fromName: rep.name, fromEmail: rep.email };
  return { fromName: `${rep.name} at ${org.companyName}`, fromEmail: org.fromEmail };
}
