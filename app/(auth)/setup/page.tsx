import { Suspense } from "react";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db, users } from "@/lib/db";
import AuthForm from "@/components/auth-form";
import OAuthButtons from "@/components/oauth-buttons";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  if (count > 0) redirect("/login");

  return (
    <Suspense>
      <AuthForm
        header={<OAuthButtons />}
        title="Create admin account"
        subtitle="This first account manages the team, API settings, and phone numbers."
        endpoint="/api/auth/setup"
        submitLabel="Create account"
        fields={[
          { name: "name", label: "Full name", autoComplete: "name" },
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password (8+ characters)", type: "password", autoComplete: "new-password" },
        ]}
      />
    </Suspense>
  );
}
