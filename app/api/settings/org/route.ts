import { NextResponse } from "next/server";
import { db, orgSettings } from "@/lib/db";
import { authed } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { getOrgSettings } from "@/lib/settings";
import { appUrl, isPublicUrl } from "@/lib/env";
import { providerConfigured } from "@/lib/mail";

export const GET = authed(async (_req, _ctx, user) => {
  const s = await getOrgSettings();
  return NextResponse.json({
    companyName: s.companyName,
    fromEmail: s.fromEmail,
    mailingAddress: s.mailingAddress,
    resendKeySet: Boolean(s.resendApiKey),
    resendKeySource: s.resendKeySource,
    dedupWindowDays: s.dedupWindowDays,
    mailboxDailyLimit: s.mailboxDailyLimit,
    trackOpens: s.trackOpens,
    integrations: {
      bland: Boolean(process.env.BLAND_AI_API_KEY),
      serpapi: Boolean(process.env.SERP_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
      google: providerConfigured("google"),
      microsoft: providerConfigured("microsoft"),
      email: Boolean(s.resendApiKey && s.fromEmail),
      cron: Boolean(process.env.CRON_SECRET),
      publicUrl: isPublicUrl(appUrl()),
    },
    appUrl: appUrl(),
    isAdmin: user.role === "admin",
  });
});

export const PUT = authed(async (req) => {
  const body = await req.json().catch(() => ({}));
  const patch: Partial<typeof orgSettings.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.companyName === "string" && body.companyName.trim()) patch.companyName = body.companyName.trim();
  if (typeof body.fromEmail === "string") patch.fromEmail = body.fromEmail.trim() || null;
  if (typeof body.mailingAddress === "string") patch.mailingAddress = body.mailingAddress.trim() || null;
  if (typeof body.resendApiKey === "string" && body.resendApiKey.trim()) patch.resendApiKeyEnc = encrypt(body.resendApiKey.trim());
  if (body.clearResendApiKey) patch.resendApiKeyEnc = null;
  if (body.dedupWindowDays !== undefined) {
    const n = Number(body.dedupWindowDays);
    if (!Number.isInteger(n) || n < 0 || n > 365) return NextResponse.json({ error: "Dedup window must be 0–365 days." }, { status: 400 });
    patch.dedupWindowDays = n;
  }
  if (body.mailboxDailyLimit !== undefined) {
    const n = Number(body.mailboxDailyLimit);
    if (!Number.isInteger(n) || n < 1 || n > 2000) return NextResponse.json({ error: "Daily limit must be 1–2000." }, { status: 400 });
    patch.mailboxDailyLimit = n;
  }
  if (typeof body.trackOpens === "boolean") patch.trackOpens = body.trackOpens;

  await db.insert(orgSettings).values({ id: 1, ...patch }).onConflictDoUpdate({ target: orgSettings.id, set: patch });
  return NextResponse.json({ ok: true });
}, { admin: true });
