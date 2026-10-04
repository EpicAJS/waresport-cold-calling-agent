import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { createResetLink } from "@/lib/password-reset";
import { sendSimpleEmail } from "@/lib/email";

const MESSAGE = "If an account exists for that email, we've sent a link to reset the password. It expires in 1 hour.";

// Always returns the same message so this can't be used to discover which emails have accounts.
export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Enter your email address." }, { status: 400 });
  }
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.email, email.trim().toLowerCase()), eq(users.disabled, false)))
    .limit(1);

  if (user) {
    const link = await createResetLink(user.id, 1);
    const sent = await sendSimpleEmail(
      user.email,
      "Reset your password",
      `Hi ${user.name},\n\nSomeone (hopefully you) asked to reset your password. Choose a new one here:\n${link}\n\nThis link expires in 1 hour. If you didn't ask for this, you can ignore this email.`
    );
    if (!sent.ok) console.error("[forgot-password] could not send reset email:", sent.error);
  }
  return NextResponse.json({ ok: true, message: MESSAGE });
}
