import { randomBytes } from "crypto";
import {
  MailAuthError, parseAddress, stripHtml,
  type MailFolder, type MailMessage, type MailProviderApi, type OutgoingMessage, type TokenSet,
} from "./types";

const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const SCOPES = [
  "openid", "email", "profile",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
];

function creds() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Google sign-in isn't configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).");
  return { id, secret };
}

async function tokenRequest(params: Record<string, string>): Promise<TokenSet> {
  const { id, secret } = creds();
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.error === "invalid_grant") throw new MailAuthError("Google access was revoked — reconnect this inbox.");
    throw new Error(`Google token error: ${data.error_description ?? data.error ?? res.status}`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
  };
}

async function gmail<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new MailAuthError("Gmail rejected the access token.");
  if (!res.ok) throw new Error(`Gmail API ${res.status}: ${data.error?.message ?? "request failed"}`);
  return data as T;
}

function encodeHeader(value: string) {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function buildMime(msg: OutgoingMessage) {
  const boundary = `b_${randomBytes(12).toString("hex")}`;
  const headers: Record<string, string> = {
    From: `${encodeHeader(msg.fromName)} <${msg.fromEmail}>`,
    To: msg.to,
    Subject: encodeHeader(msg.subject),
    "MIME-Version": "1.0",
    "Content-Type": `multipart/alternative; boundary="${boundary}"`,
    ...(msg.thread?.messageIdHeader ? { "In-Reply-To": msg.thread.messageIdHeader, References: msg.thread.messageIdHeader } : {}),
    ...(msg.headers ?? {}),
  };
  const head = Object.entries(headers).map(([k, v]) => `${k}: ${v}`).join("\r\n");
  const part = (type: string, body: string) =>
    `--${boundary}\r\nContent-Type: ${type}; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(body, "utf8").toString("base64").replace(/.{76}/g, "$&\r\n")}\r\n`;
  return `${head}\r\n\r\n${part("text/plain", msg.text)}${part("text/html", msg.html)}--${boundary}--`;
}

type GmailPart = { mimeType?: string; body?: { data?: string }; parts?: GmailPart[]; headers?: Array<{ name: string; value: string }> };
type GmailMessage = { id: string; threadId: string; snippet?: string; internalDate?: string; payload?: GmailPart };

function decode(data?: string) {
  return data ? Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : "";
}

function findBody(part: GmailPart | undefined, type: string): string {
  if (!part) return "";
  if (part.mimeType === type && part.body?.data) return decode(part.body.data);
  for (const p of part.parts ?? []) {
    const found = findBody(p, type);
    if (found) return found;
  }
  return "";
}

function toMailMessage(m: GmailMessage): MailMessage {
  const headers = Object.fromEntries((m.payload?.headers ?? []).map((h) => [h.name.toLowerCase(), h.value]));
  const text = findBody(m.payload, "text/plain") || stripHtml(findBody(m.payload, "text/html")) || (m.snippet ?? "");
  return {
    id: m.id,
    threadId: m.threadId,
    messageIdHeader: headers["message-id"] ?? null,
    inReplyTo: headers["in-reply-to"] ?? null,
    references: headers["references"] ?? null,
    from: parseAddress(headers["from"] ?? ""),
    to: (headers["to"] ?? "").split(",").map((a) => parseAddress(a).email).filter(Boolean),
    subject: headers["subject"] ?? "",
    text,
    snippet: (m.snippet ?? text.slice(0, 200)).replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&"),
    date: m.internalDate ? new Date(Number(m.internalDate)) : new Date(),
    headers,
  };
}

export const google: MailProviderApi = {
  authUrl(state, redirectUri, loginHint) {
    const { id } = creds();
    const p = new URLSearchParams({
      client_id: id,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
      ...(loginHint ? { login_hint: loginHint } : {}),
    });
    return `${AUTH}?${p}`;
  },

  exchangeCode: (code, redirectUri) => tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),

  refresh: (refreshToken) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }),

  async profile(token) {
    const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.email) throw new Error("Couldn't read the Google profile.");
    return { email: String(data.email).toLowerCase(), name: data.name || data.email };
  },

  async send(token, msg) {
    const raw = Buffer.from(buildMime(msg), "utf8").toString("base64url");
    const sent = await gmail<{ id: string; threadId: string }>(token, "/messages/send", {
      method: "POST",
      body: JSON.stringify({ raw, ...(msg.thread?.threadId ? { threadId: msg.thread.threadId } : {}) }),
    });
    const meta = await gmail<GmailMessage>(token, `/messages/${sent.id}?format=metadata&metadataHeaders=Message-ID`).catch(() => null);
    const messageIdHeader = meta?.payload?.headers?.find((h) => h.name.toLowerCase() === "message-id")?.value ?? null;
    return { id: sent.id, threadId: sent.threadId, messageIdHeader };
  },

  async list(token, folder: MailFolder, since, limit) {
    const q = `${folder === "inbox" ? "in:inbox" : "in:sent"} after:${Math.floor(since.getTime() / 1000)}`;
    const ids = await gmail<{ messages?: Array<{ id: string }> }>(token, `/messages?q=${encodeURIComponent(q)}&maxResults=${limit}`);
    const out: MailMessage[] = [];
    for (const { id } of ids.messages ?? []) {
      out.push(toMailMessage(await gmail<GmailMessage>(token, `/messages/${id}?format=full`)));
    }
    return out.sort((a, b) => a.date.getTime() - b.date.getTime());
  },
};
