import { NextResponse } from "next/server";
import { db, orgSettings } from "@/lib/db";
import { authed } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { getOrgSettings } from "@/lib/settings";
import { appUrl, isPublicUrl } from "@/lib/env";

export const GET = authed(async (_req, _ctx, user) => {
  const s = await getOrgSettings();
  return NextResponse.json({
    companyName: s.companyName,
    fromEmail: s.fromEmail,
    mailingAddress: s.mailingAddress,
    resendKeySet: Boolean(s.resendApiKey),
    resendKeySource: s.resendKeySource,
    integrations: {
      bland: Boolean(process.env.BLAND_AI_API_KEY),
      serpapi: Boolean(process.env.SERP_API_KEY),
      openai: Boolean(process.env.OPENAI_API_KEY),
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

  await db.insert(orgSettings).values({ id: 1, ...patch }).onConflictDoUpdate({ target: orgSettings.id, set: patch });
  return NextResponse.json({ ok: true });
}, { admin: true });
