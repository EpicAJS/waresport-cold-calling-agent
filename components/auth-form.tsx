"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

type Field = { name: string; label: string; type?: string; autoComplete?: string };

type Props = {
  title: string;
  subtitle?: string;
  fields: Field[];
  endpoint: string;
  submitLabel: string;
  footer?: React.ReactNode;
  header?: React.ReactNode;
};

export default function AuthForm({ title, subtitle, fields, endpoint, submitLabel, footer, header }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(search.get("error"));
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Something went wrong.");
      setBusy(false);
      return;
    }
    const next = search.get("next");
    router.push(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-base px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="text-center">
          <p className="text-[15px] font-semibold text-gray-900 tracking-tight">Waresport</p>
          <p className="text-[11px] font-medium text-blue-500">Outreach platform</p>
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 text-center">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 text-center mt-1">{subtitle}</p>}
        </div>
        {header}
        {fields.map((f) => (
          <div key={f.name}>
            <label className="text-sm font-medium text-gray-700 block mb-1.5" htmlFor={f.name}>{f.label}</label>
            <input
              id={f.name}
              type={f.type ?? "text"}
              autoComplete={f.autoComplete}
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={values[f.name] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
            />
          </div>
        ))}
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitLabel}
        </button>
        {footer}
      </form>
    </div>
  );
}
