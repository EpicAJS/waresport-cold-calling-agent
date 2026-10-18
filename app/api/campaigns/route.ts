import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, campaigns, users } from "@/lib/db";
import { authed, ownedBy } from "@/lib/auth";
import { parseCampaignFields } from "@/lib/campaign-input";
import { addContacts, campaignStatColumns } from "@/lib/campaigns";
import { DEFAULT_TEMPLATES } from "@/lib/templates";
import { DEFAULT_VOICE } from "@/lib/bland";

export const GET = authed(async (_req, _ctx, user) => {
  const rows = await db
    .select({ campaign: campaigns, ownerName: users.name, ...campaignStatColumns })
    .from(campaigns)
    .innerJoin(users, eq(campaigns.ownerId, users.id))
    .where(ownedBy(user, campaigns.ownerId))
    .orderBy(desc(campaigns.createdAt));
  return NextResponse.json(rows.map(({ campaign, ...rest }) => ({ ...campaign, ...rest })));
});

export const POST = authed(async (req, _ctx, user) => {
  const body = await req.json().catch(() => ({}));
  const { fields, errors } = parseCampaignFields({ channel: "call", ...body });
  if (!fields.name) errors.push("Name is required.");
  if (errors.length) return NextResponse.json({ error: errors.join(" ") }, { status: 400 });

  const [campaign] = await db
    .insert(campaigns)
    .values({
      ownerId: user.id,
      name: fields.name as string,
      voiceId: DEFAULT_VOICE,
      emailTemplates: DEFAULT_TEMPLATES,
      ...fields,
    })
    .returning();

  const ids: string[] = Array.isArray(body.contactIds) ? body.contactIds.filter((x: unknown) => typeof x === "string") : [];
  if (ids.length) await addContacts(campaign.id, campaign.ownerId, ids);

  return NextResponse.json(campaign, { status: 201 });
});
