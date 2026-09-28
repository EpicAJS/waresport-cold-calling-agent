"use client";

import { useState } from "react";
import { Mail, ChevronDown, ChevronUp, X } from "lucide-react";
import { EMAIL_KIND_LABEL, fmtDateTime } from "@/lib/labels";

export type EmailRow = {
  id: string;
  kind: string;
  toEmail: string;
  subject: string;
  text: string;
  sendAt: string;
  status: string;
  error: string | null;
  clubName: string;
  campaignName: string | null;
  ownerName: string;
};

export function emailDisplayStatus(e: Pick<EmailRow, "status" | "sendAt">) {
  if (e.status === "scheduled" && new Date(e.sendAt) <= new Date()) return "sent";
  return e.status;
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  scheduled: "bg-blue-100 text-blue-700",
  sent: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-400",
};

export default function EmailList({ emails, onChanged, showCampaign = true }: { emails: EmailRow[]; onChanged?: () => void; showCampaign?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cancel = async (id: string) => {
    const res = await fetch(`/api/emails/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setError(res.ok ? null : data.error ?? "Couldn't cancel.");
    onChanged?.();
  };

  if (emails.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
        <Mail className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No emails yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
      {error && <p className="text-sm text-red-700 bg-red-50 px-4 py-2">{error}</p>}
      {emails.map((e) => {
        const status = emailDisplayStatus(e);
        const cancellable = status === "pending" || status === "scheduled";
        return (
          <div key={e.id}>
            <div className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => setOpen(open === e.id ? null : e.id)} className="flex-1 min-w-0 flex items-center gap-3 text-left">
                {open === e.id ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{e.subject}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {EMAIL_KIND_LABEL(e.kind)} · {e.clubName} &lt;{e.toEmail}&gt;{showCampaign && e.campaignName ? ` · ${e.campaignName}` : ""}
                  </p>
                </div>
              </button>
              <span className="text-xs text-gray-400 shrink-0">{fmtDateTime(e.sendAt)}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_STYLE[status] ?? ""}`}>{status}</span>
              {cancellable && (
                <button onClick={() => cancel(e.id)} title="Cancel this email" className="p-1 text-gray-300 hover:text-red-500">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {open === e.id && (
              <div className="px-11 pb-4">
                {e.error && <p className="text-xs text-red-600 mb-2">{e.error}</p>}
                <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans bg-gray-50 rounded-lg p-3">{e.text}</pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
