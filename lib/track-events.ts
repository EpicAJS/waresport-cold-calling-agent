import { eq, sql } from "drizzle-orm";
import { db, emails, emailEvents } from "@/lib/db";

// Opens within this window after sending are usually mail-server prefetches, not people.
const PREFETCH_GRACE_MS = 15_000;

export async function recordEmailEvent(emailId: string, type: "open" | "click", url?: string) {
  if (!/^[0-9a-f-]{36}$/i.test(emailId)) return false;
  const [e] = await db.select({ id: emails.id, contactId: emails.contactId, sentAt: emails.sentAt }).from(emails).where(eq(emails.id, emailId)).limit(1);
  if (!e?.sentAt) return false;
  if (type === "open" && Date.now() - e.sentAt.getTime() < PREFETCH_GRACE_MS) return true;

  const now = new Date();
  const nowIso = now.toISOString();
  await db.insert(emailEvents).values({ emailId: e.id, contactId: e.contactId, type, url: url ?? null });
  await db.update(emails).set(
    type === "open"
      ? { openCount: sql`${emails.openCount} + 1`, firstOpenedAt: sql`coalesce(${emails.firstOpenedAt}, ${nowIso}::timestamptz)`, lastOpenedAt: now }
      // A click implies the email was opened even if images were blocked.
      : { clickCount: sql`${emails.clickCount} + 1`, openCount: sql`greatest(${emails.openCount}, 1)`, firstOpenedAt: sql`coalesce(${emails.firstOpenedAt}, ${nowIso}::timestamptz)`, lastOpenedAt: now }
  ).where(eq(emails.id, e.id));
  return true;
}
