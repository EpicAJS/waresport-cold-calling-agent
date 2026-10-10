import {
  MailAuthError, stripHtml,
  type MailFolder, type MailMessage, type MailProviderApi, type TokenSet,
} from "./types";

const GRAPH = "https://graph.microsoft.com/v1.0/me";
const SCOPES = ["openid", "email", "profile", "offline_access", "User.Read", "Mail.ReadWrite", "Mail.Send"];

function creds() {
  const id = process.env.MICROSOFT_CLIENT_ID;
  const secret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Microsoft sign-in isn't configured (MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET).");
  return { id, secret, tenant: process.env.MICROSOFT_TENANT_ID || "common" };
}

async function tokenRequest(params: Record<string, string>): Promise<TokenSet> {
  const { id, secret, tenant } = creds();
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, scope: SCOPES.join(" "), ...params }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (data.error === "invalid_grant") throw new MailAuthError("Microsoft access was revoked — reconnect this inbox.");
    throw new Error(`Microsoft token error: ${data.error_description ?? data.error ?? res.status}`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
  };
}

async function graph<T>(token: string, path: string, init: RequestInit & { prefer?: string } = {}): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : `${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.prefer ? { Prefer: init.prefer } : {}),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (res.status === 202 || res.status === 204) return {} as T;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) throw new MailAuthError("Outlook rejected the access token.");
  if (!res.ok) throw new Error(`Microsoft Graph ${res.status}: ${data.error?.message ?? "request failed"}`);
  return data as T;
}

type GraphMessage = {
  id: string;
  conversationId?: string;
  internetMessageId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType: string; content: string };
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string } }>;
  receivedDateTime?: string;
  sentDateTime?: string;
  internetMessageHeaders?: Array<{ name: string; value: string }>;
};

const SELECT = "id,conversationId,internetMessageId,subject,bodyPreview,body,from,toRecipients,receivedDateTime,sentDateTime,internetMessageHeaders";

function toMailMessage(m: GraphMessage): MailMessage {
  const headers = Object.fromEntries((m.internetMessageHeaders ?? []).map((h) => [h.name.toLowerCase(), h.value]));
  const content = m.body?.content ?? "";
  const text = m.body?.contentType?.toLowerCase() === "html" ? stripHtml(content) : content;
  return {
    id: m.id,
    threadId: m.conversationId ?? null,
    messageIdHeader: m.internetMessageId ?? null,
    inReplyTo: headers["in-reply-to"] ?? null,
    references: headers["references"] ?? null,
    from: { email: (m.from?.emailAddress?.address ?? "").toLowerCase(), name: m.from?.emailAddress?.name ?? null },
    to: (m.toRecipients ?? []).map((r) => (r.emailAddress?.address ?? "").toLowerCase()).filter(Boolean),
    subject: m.subject ?? "",
    text: text || (m.bodyPreview ?? ""),
    snippet: m.bodyPreview ?? text.slice(0, 200),
    date: new Date(m.receivedDateTime ?? m.sentDateTime ?? Date.now()),
    headers,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function findSentItem(token: string, internetMessageId: string) {
  const filter = encodeURIComponent(`internetMessageId eq '${internetMessageId.replace(/'/g, "''")}'`);
  for (let i = 0; i < 3; i++) {
    const r = await graph<{ value: GraphMessage[] }>(token, `/mailFolders/sentitems/messages?$filter=${filter}&$select=id,conversationId`).catch(() => null);
    if (r?.value?.[0]) return r.value[0];
    await sleep(1200);
  }
  return null;
}

export const microsoft: MailProviderApi = {
  authUrl(state, redirectUri, loginHint) {
    const { id, tenant } = creds();
    const p = new URLSearchParams({
      client_id: id,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: SCOPES.join(" "),
      prompt: "select_account",
      state,
      ...(loginHint ? { login_hint: loginHint } : {}),
    });
    return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${p}`;
  },

  exchangeCode: (code, redirectUri) => tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri }),

  refresh: (refreshToken) => tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }),

  async profile(token) {
    const me = await graph<{ mail?: string; userPrincipalName?: string; displayName?: string }>(token, "");
    const email = (me.mail || me.userPrincipalName || "").toLowerCase();
    if (!email) throw new Error("Couldn't read the Microsoft profile.");
    return { email, name: me.displayName || email };
  },

  async send(token, msg) {
    const body = { contentType: "HTML", content: msg.html };
    const to = [{ emailAddress: { address: msg.to } }];
    // Graph only accepts custom "x-" headers on outgoing mail.
    const internetMessageHeaders = Object.entries(msg.headers ?? {})
      .filter(([k]) => k.toLowerCase().startsWith("x-"))
      .map(([name, value]) => ({ name, value }));

    let draft: GraphMessage;
    if (msg.thread?.providerMessageId) {
      draft = await graph<GraphMessage>(token, `/messages/${msg.thread.providerMessageId}/createReply`, { method: "POST" });
      await graph(token, `/messages/${draft.id}`, {
        method: "PATCH",
        body: JSON.stringify({ toRecipients: to, body: { contentType: "HTML", content: msg.html + (draft.body?.content ?? "") } }),
      });
    } else {
      draft = await graph<GraphMessage>(token, "/messages", {
        method: "POST",
        body: JSON.stringify({ subject: msg.subject, body, toRecipients: to, ...(internetMessageHeaders.length ? { internetMessageHeaders } : {}) }),
      });
    }
    const full = await graph<GraphMessage>(token, `/messages/${draft.id}?$select=id,conversationId,internetMessageId`);
    await graph(token, `/messages/${draft.id}/send`, { method: "POST" });
    const sent = full.internetMessageId ? await findSentItem(token, full.internetMessageId) : null;
    return { id: sent?.id ?? draft.id, threadId: full.conversationId ?? null, messageIdHeader: full.internetMessageId ?? null };
  },

  async list(token, folder: MailFolder, since, limit) {
    const field = folder === "inbox" ? "receivedDateTime" : "sentDateTime";
    const path = `/mailFolders/${folder === "inbox" ? "inbox" : "sentitems"}/messages`
      + `?$filter=${encodeURIComponent(`${field} ge ${since.toISOString()}`)}&$orderby=${field} asc&$top=${limit}&$select=${SELECT}`;
    const r = await graph<{ value: GraphMessage[] }>(token, path, { prefer: 'outlook.body-content-type="text"' });
    return (r.value ?? []).map(toMailMessage);
  },
};
