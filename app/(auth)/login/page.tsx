import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import AuthForm from "@/components/auth-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/dashboard");
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
  if (count === 0) redirect("/setup");

  return (
    <Suspense>
      <AuthForm
        title="Sign in"
        subtitle="Waresport Cold Calling Agent"
        endpoint="/api/auth/login"
        submitLabel="Sign in"
        fields={[
          { name: "email", label: "Email", type: "email", autoComplete: "email" },
          { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
        ]}
        footer={
          <div className="text-center space-y-1">
            <Link href="/forgot-password" className="text-sm text-blue-600 hover:underline">Forgot password?</Link>
            <p className="text-xs text-gray-400">No account? Ask your admin for an invite link.</p>
          </div>
        }
      />
    </Suspense>
  );
}
