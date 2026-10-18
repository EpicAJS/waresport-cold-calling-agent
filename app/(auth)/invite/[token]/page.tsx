import { Suspense } from "react";
import Link from "next/link";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, invites } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import AuthForm from "@/components/auth-form";
import OAuthButtons from "@/components/oauth-buttons";

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: { token: string } }) {
  const [invite] = await db
    .select({ email: invites.email })
    .from(invites)
    .where(and(eq(invites.tokenHash, sha256(params.token)), isNull(invites.acceptedAt), gt(invites.expiresAt, new Date())))
    .limit(1);

  if (!invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base px-4">
        <div className="max-w-sm bg-white rounded-xl border border-gray-200 p-6 text-center space-y-3">
          <h1 className="text-lg font-bold text-gray-900">Invite not valid</h1>
          <p className="text-sm text-gray-500">This invite link is invalid, already used, or expired. Ask your admin for a new one.</p>
          <Link href="/login" className="text-sm text-brand-600 hover:underline">Go to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <Suspense>
      <AuthForm
        header={<OAuthButtons />}
        title="Join your team"
        subtitle={`Create your account for ${invite.email}`}
        endpoint={`/api/auth/invite/${params.token}`}
        submitLabel="Create account"
        fields={[
          { name: "name", label: "Full name", autoComplete: "name" },
          { name: "password", label: "Password (8+ characters)", type: "password", autoComplete: "new-password" },
        ]}
      />
    </Suspense>
  );
}
