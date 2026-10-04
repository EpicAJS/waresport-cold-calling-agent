import { and, eq, gt, isNull } from "drizzle-orm";
import { db, passwordResets, users } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { appUrl } from "@/lib/env";

export async function createResetLink(userId: string, hoursValid: number) {
  const token = randomToken();
  await db.insert(passwordResets).values({
    tokenHash: sha256(token),
    userId,
    expiresAt: new Date(Date.now() + hoursValid * 3600e3),
  });
  return `${appUrl()}/reset/${token}`;
}

export async function findValidReset(token: string) {
  const [row] = await db
    .select({ id: passwordResets.id, userId: passwordResets.userId, email: users.email })
    .from(passwordResets)
    .innerJoin(users, eq(passwordResets.userId, users.id))
    .where(and(
      eq(passwordResets.tokenHash, sha256(token)),
      isNull(passwordResets.usedAt),
      gt(passwordResets.expiresAt, new Date()),
      eq(users.disabled, false),
    ))
    .limit(1);
  return row ?? null;
}
