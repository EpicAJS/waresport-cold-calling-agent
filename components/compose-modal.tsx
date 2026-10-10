"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { inputCls } from "@/lib/labels";

/** Follow-up composer for a contact: prefilled with an AI (or template) draft, sent from the rep's inbox. */
export default function ComposeModal({ contactId, onClose, onSent }: { contactId: string; onClose: () => void; onSent?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [to, setTo] = useState("");
  const [club, setClub] = useState("");
  const [text, setText] = useState("");
  const [source, setSource] = useState<"ai" | "template">("template");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/inbox/compose?contactId=${contactId}`).then((r) => r.json()).then((d) => {
      setTo(d.to ?? ""); setClub(d.clubName ?? ""); setText(d.text ?? ""); setSource(d.source ?? "template");
    }).finally(() => setLoading(false));
  }, [contactId]);

  const send = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/inbox/compose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contactId, text }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Couldn't send.");
    onSent?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white border border-gray-200 rounded-[14px] p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <p className="section-title">Follow up with {club || "contact"}</p>
            <p className="text-[11px] text-gray-500">{to ? `To ${to} · continues your last thread` : "No email on file"}</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700"><X className="w-4 h-4" /></button>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-gray-500 py-8 justify-center"><Loader2 className="w-4 h-4 animate-spin" />Drafting…</div>
        ) : (
          <>
            <p className="text-[10px] text-purple-700 flex items-center gap-1"><Sparkles className="w-3 h-3" />{source === "ai" ? "AI draft" : "Template draft (AI turns on when the OpenAI key is set)"}</p>
            <textarea className={`${inputCls} h-48 resize-y text-[13px]`} value={text} onChange={(e) => setText(e.target.value)} />
          </>
        )}
        {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="btn">Cancel</button>
          <button onClick={send} disabled={busy || loading || !to || !text.trim()} className="btn-primary">
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Send from my inbox
          </button>
        </div>
      </div>
    </div>
  );
}
