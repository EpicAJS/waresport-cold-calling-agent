import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, campaigns, campaignContacts, users } from "@/lib/db";
import { authed, canAccess } from "@/lib/auth";
import { dispatchCampaign } from "@/lib/dispatcher";
import { getOrgSettings } from "@/lib/settings";
import { withDefaults } from "@/lib/templates";

export const maxDuration = 60;

export const POST = authed(async (_req, { params }, user) => {
  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, params.id)).limit(1);
  if (!campaign || !canAccess(user, campaign.ownerId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (campaign.status === "active") return NextResponse.json({ error: "Campaign is already running." }, { status: 409 });

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(campaignContacts)
    .where(eq(campaignContacts.campaignId, campaign.id));
  if (count === 0) return NextResponse.json({ error: "Add at least one contact before launching." }, { status: 400 });

  const [owner] = await db.select().from(users).where(eq(users.id, campaign.ownerId)).limit(1);
  const org = await getOrgSettings();
  const emailReady = Boolean(org.resendApiKey && org.fromEmail);
  const usesBookingLink = JSON.stringify(withDefaults(campaign.emailTemplates)).includes("{{booking_link}}");

  if (campaign.channel === "call") {
    if (!process.env.BLAND_AI_API_KEY) return NextResponse.json({ error: "BLAND_AI_API_KEY is not configured." }, { status: 400 });
    if (!campaign.script.trim()) return NextResponse.json({ error: "The call script is empty." }, { status: 400 });
  } else {
    if (!emailReady) return NextResponse.json({ error: "Email isn't configured yet — an admin must add a Resend key and from address in Settings." }, { status: 400 });
    if (usesBookingLink && !owner?.bookingUrl) {
      return NextResponse.json({ error: "Your emails use {{booking_link}} — add your booking link in Settings first." }, { status: 400 });
    }
  }

  await db.update(campaigns).set({ status: "active", launchedAt: campaign.launchedAt ?? new Date() }).where(eq(campaigns.id, campaign.id));
  const scheduled = await dispatchCampaign(campaign.id);

  const warnings: string[] = [];
  if (campaign.channel === "call" && campaign.emailsEnabled && !emailReady) warnings.push("Follow-up emails are on but email isn't configured, so none will be sent.");
  if (campaign.channel === "call" && !owner?.bookingUrl) warnings.push("You have no booking link in Settings, so prospects who want a demo won't get one automatically.");
  return NextResponse.json({ ok: true, scheduled, warnings });
});
