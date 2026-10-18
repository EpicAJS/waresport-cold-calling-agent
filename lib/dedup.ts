import { and, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { db, calls, contacts, dedupBlocks, emails } from "@/lib/db";

/**
 * Has a different teammate emailed or called this prospect recently? Matches on email address
 * and phone number across everyone's contact books.
 */
export async function priorTeammateContact(
  contact: { email: string | null; phone: string },
  ownerId: string,
  windowDays: number
): Promise<{ userId: string; at: Date; channel: "email" | "call" } | null> {
  if (windowDays <= 0) return null;
  const since = new Date(Date.now() - windowDays * 24 * 3600e3);

  if (contact.email) {
    const [e] = await db
      .select({ userId: emails.ownerId, at: emails.sentAt })
      .from(emails)
      .where(and(
        eq(sql`lower(${emails.toEmail})`, contact.email.toLowerCase()),
        ne(emails.ownerId, ownerId),
        inArray(emails.status, ["sent", "scheduled"]),
        gt(emails.sentAt, since),
      ))
      .orderBy(desc(emails.sentAt))
      .limit(1);
    if (e?.at) return { userId: e.userId, at: e.at, channel: "email" };
  }

  if (contact.phone) {
    const [c] = await db
      .select({ userId: calls.ownerId, at: calls.scheduledFor })
      .from(calls)
      .innerJoin(contacts, eq(calls.contactId, contacts.id))
      .where(and(
        eq(contacts.phone, contact.phone),
        ne(calls.ownerId, ownerId),
        inArray(calls.status, ["completed", "scheduled"]),
        gt(calls.scheduledFor, since),
      ))
      .orderBy(desc(calls.scheduledFor))
      .limit(1);
    if (c) return { userId: c.userId, at: c.at, channel: "call" };
  }
  return null;
}

export async function recordDedupBlock(v: {
  contactId: string; campaignId: string; blockedUserId: string;
  prior: { userId: string; at: Date; channel: "email" | "call" };
}) {
  await db.insert(dedupBlocks).values({
    contactId: v.contactId,
    campaignId: v.campaignId,
    blockedUserId: v.blockedUserId,
    priorUserId: v.prior.userId,
    priorContactAt: v.prior.at,
    channel: v.prior.channel,
  }).onConflictDoNothing();
}
