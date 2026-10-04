"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { inputCls } from "@/lib/labels";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setResult(res.ok ? { ok: true, text: data.message } : { ok: false, text: data.error ?? "Something went wrong." });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 text-center">Reset your password</h1>
          <p className="text-sm text-gray-500 text-center mt-1">Enter your account email and we&apos;ll send you a reset link.</p>
        </div>
        {result?.ok ? (
          <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">{result.text}</p>
        ) : (
          <>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5" htmlFor="email">Email</label>
              <input id="email" type="email" required autoComplete="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {result && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{result.text}</p>}
            <button type="submit" disabled={busy}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}Send reset link
            </button>
          </>
        )}
        <p className="text-xs text-gray-400 text-center">
          No email arriving? Your admin can create a reset link for you in Settings → Team.
        </p>
        <p className="text-center"><Link href="/login" className="text-sm text-blue-600 hover:underline">Back to sign in</Link></p>
      </form>
    </div>
  );
}
