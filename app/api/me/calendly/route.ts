import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { authed } from "@/lib/auth";
import { decrypt, encrypt, randomToken } from "@/lib/crypto";
import { appUrl, isPublicUrl } from "@/lib/env";

const API = "https://api.calendly.com";

async function calendly(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Connects a rep's Calendly account by creating a signed webhook subscription for their bookings.
export const POST = authed(async (req, _ctx, user) => {
  const { token } = await req.json().catch(() => ({}));
  if (typeof token !== "string" || !token.trim()) return NextResponse.json({ error: "Paste your Calendly personal access token." }, { status: 400 });
  if (!isPublicUrl(appUrl())) {
    return NextResponse.json({ error: "Calendly needs a public URL for webhooks. Set APP_URL to your deployed address first." }, { status: 400 });
  }

  const me = await calendly(token.trim(), "/users/me");
  if (!me.ok) return NextResponse.json({ error: "Calendly rejected that token." }, { status: 400 });
  const userUri: string = me.data.resource.uri;
  const orgUri: string = me.data.resource.current_organization;
  const callbackUrl = `${appUrl()}/api/webhooks/calendly/${user.id}`;
  const signingKey = randomToken(24);

  const body = JSON.stringify({
    url: callbackUrl,
    events: ["invitee.created", "invitee.canceled"],
    organization: orgUri,
    user: userUri,
    scope: "user",
    signing_key: signingKey,
  });
  let sub = await calendly(token.trim(), "/webhook_subscriptions", { method: "POST", body });
  if (sub.status === 409) {
    // A subscription for this URL already exists (e.g. reconnecting) — replace it so we know its signing key.
    const list = await calendly(token.trim(), `/webhook_subscriptions?organization=${encodeURIComponent(orgUri)}&user=${encodeURIComponent(userUri)}&scope=user`);
    for (const s of list.data.collection ?? []) {
      if (s.callback_url === callbackUrl) await calendly(token.trim(), s.uri, { method: "DELETE" });
    }
    sub = await calendly(token.trim(), "/webhook_subscriptions", { method: "POST", body });
  }
  if (!sub.ok) {
    const msg = sub.data?.message ?? sub.data?.title ?? `HTTP ${sub.status}`;
    return NextResponse.json({ error: `Couldn't create the Calendly webhook: ${msg}. Webhooks require a paid Calendly plan.` }, { status: 400 });
  }

  const [u] = await db.select({ bookingUrl: users.bookingUrl }).from(users).where(eq(users.id, user.id)).limit(1);
  await db.update(users).set({
    bookingProvider: "calendly",
    bookingUrl: u?.bookingUrl || me.data.resource.scheduling_url || null,
    calendlyTokenEnc: encrypt(token.trim()),
    calendlyWebhookUri: sub.data.resource.uri,
    calendlySigningKey: signingKey,
  }).where(eq(users.id, user.id));

  return NextResponse.json({ ok: true, schedulingUrl: me.data.resource.scheduling_url });
});

export const DELETE = authed(async (_req, _ctx, user) => {
  const [u] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  const token = decrypt(u.calendlyTokenEnc);
  if (token && u.calendlyWebhookUri) await calendly(token, u.calendlyWebhookUri, { method: "DELETE" }).catch(() => null);
  await db.update(users).set({ calendlyTokenEnc: null, calendlyWebhookUri: null, calendlySigningKey: null }).where(eq(users.id, user.id));
  return NextResponse.json({ ok: true });
});
