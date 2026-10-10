import { Suspense } from "react";
import Link from "next/link";
import AuthForm from "@/components/auth-form";
import { findValidReset } from "@/lib/password-reset";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ params }: { params: { token: string } }) {
  const reset = await findValidReset(params.token);

  if (!reset) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base px-4">
        <div className="max-w-sm bg-white rounded-xl border border-gray-200 p-6 text-center space-y-3">
          <h1 className="text-lg font-bold text-gray-900">Link not valid</h1>
          <p className="text-sm text-gray-500">This reset link is invalid, already used, or expired.</p>
          <Link href="/forgot-password" className="text-sm text-blue-600 hover:underline">Request a new link</Link>
        </div>
      </div>
    );
  }

  return (
    <Suspense>
      <AuthForm
        title="Choose a new password"
        subtitle={`For ${reset.email}. You'll be signed out everywhere else.`}
        endpoint={`/api/auth/reset/${params.token}`}
        submitLabel="Save password and sign in"
        fields={[{ name: "password", label: "New password (8+ characters)", type: "password", autoComplete: "new-password" }]}
      />
    </Suspense>
  );
}
