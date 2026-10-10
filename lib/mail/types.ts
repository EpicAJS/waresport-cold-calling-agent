export type MailFolder = "inbox" | "sent";

export type MailMessage = {
  id: string;
  threadId: string | null;
  messageIdHeader: string | null;
  inReplyTo: string | null;
  references: string | null;
  from: { email: string; name: string | null };
  to: string[];
  subject: string;
  text: string;
  snippet: string;
  date: Date;
  headers: Record<string, string>;
};

export type OutgoingMessage = {
  fromName: string;
  fromEmail: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  /** Continue an existing conversation (follow-ups, replies). */
  thread?: { threadId: string | null; messageIdHeader: string | null; providerMessageId?: string | null };
};

export type SentResult = { id: string; threadId: string | null; messageIdHeader: string | null };

export type TokenSet = { accessToken: string; refreshToken: string | null; expiresAt: Date };

export type Profile = { email: string; name: string };

export interface MailProviderApi {
  authUrl(state: string, redirectUri: string, loginHint?: string): string;
  exchangeCode(code: string, redirectUri: string): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  profile(accessToken: string): Promise<Profile>;
  send(accessToken: string, msg: OutgoingMessage): Promise<SentResult>;
  list(accessToken: string, folder: MailFolder, since: Date, limit: number): Promise<MailMessage[]>;
}

export class MailAuthError extends Error {}

export function stripHtml(html: string) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/** Drops quoted history ("On ... wrote:" and "> " lines) so only the new reply text is analyzed. */
export function stripQuoted(text: string) {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (/^On .+wrote:\s*$/i.test(line.trim()) || /^-{2,}\s*Original Message\s*-{2,}/i.test(line.trim()) || /^From: .+/i.test(line.trim()) && out.length > 0) break;
    if (line.trim().startsWith(">")) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

export function parseAddress(raw: string): { email: string; name: string | null } {
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() };
  return { name: null, email: raw.trim().toLowerCase() };
}

export function replySubject(subject: string) {
  return /^re:/i.test(subject.trim()) ? subject : `Re: ${subject}`;
}
