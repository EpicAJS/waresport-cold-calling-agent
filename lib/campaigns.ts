import { and, eq, inArray, sql } from "drizzle-orm";
import { db, campaigns, campaignContacts, contacts } from "@/lib/db";

/** Per-campaign counters as correlated subqueries, for use in a select over `campaigns`. */
export const campaignStatColumns = {
  contactCount: sql<number>`(select count(*)::int from campaign_contacts cc where cc.campaign_id = ${campaigns.id})`,
  remaining: sql<number>`(select count(*)::int from campaign_contacts cc where cc.campaign_id = ${campaigns.id} and cc.status in ('pending','scheduled'))`,
  callsMade: sql<number>`(select count(*)::int from calls c where c.campaign_id = ${campaigns.id} and c.status in ('completed','failed'))`,
  callsQueued: sql<number>`(select count(*)::int from calls c where c.campaign_id = ${campaigns.id} and c.status = 'scheduled')`,
  answered: sql<number>`(select count(*)::int from calls c where c.campaign_id = ${campaigns.id} and coalesce(c.outcome_override, c.outcome) not in ('no-answer','voicemail','failed','pending','cancelled'))`,
  demosRequested: sql<number>`(select count(*)::int from calls c where c.campaign_id = ${campaigns.id} and coalesce(c.outcome_override, c.outcome) = 'demo-booked')`,
  demosScheduled: sql<number>`(select count(*)::int from bookings b where b.campaign_id = ${campaigns.id} and b.status = 'scheduled')`,
  emailsSent: sql<number>`(select count(*)::int from emails e where e.campaign_id = ${campaigns.id} and (e.status = 'sent' or (e.status = 'scheduled' and e.send_at <= now())))`,
};

export async function addContacts(campaignId: string, ownerId: string, contactIds: string[]) {
  const owned = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.ownerId, ownerId), inArray(contacts.id, contactIds)));
  if (!owned.length) return 0;
  const res = await db
    .insert(campaignContacts)
    .values(owned.map((c) => ({ campaignId, contactId: c.id })))
    .onConflictDoNothing()
    .returning({ id: campaignContacts.id });
  return res.length;
}
