"use client";

import { useState } from "react";
import { Phone, Clock, ChevronDown, ChevronUp, FileText, Sparkles, Mic, AlertCircle } from "lucide-react";
import { formatDuration, formatPhone } from "@/lib/utils";
import { OUTCOME_COLOR, OUTCOME_LABEL, fmtDateTime } from "@/lib/labels";

export type CallRow = {
  id: string;
  campaignId: string;
  campaignName: string;
  contactId: string;
  clubName: string;
  phone: string;
  email: string | null;
  ownerName: string;
  attempt: number;
  status: string;
  outcome: string;
  duration: number;
  summary: string | null;
  transcript: string | null;
  recordingUrl: string | null;
  error: string | null;
  scheduledFor: string;
  endedAt: string | null;
};

const EDITABLE = ["demo-booked", "interested", "callback", "not-interested", "do-not-call", "voicemail", "no-answer", "wrong-number", "completed"];

export default function CallList({ calls, showCampaign = true, onChanged }: { calls: CallRow[]; showCampaign?: boolean; onChanged?: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<Record<string, "summary" | "transcript">>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const setOutcome = async (id: string, outcome: string) => {
    setSaving(id);
    const res = await fetch(`/api/calls/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(null);
    setNotice(data.emailQueued ? "Outcome updated — booking link email sent." : "Outcome updated.");
    setTimeout(() => setNotice(null), 3000);
    onChanged?.();
  };

  if (calls.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
        <Phone className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No calls yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {notice && <div className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-4 py-2">{notice}</div>}
      {calls.map((call) => {
        const isOpen = expanded === call.id;
        const t = tab[call.id] ?? "summary";
        const queued = call.status === "scheduled";
        const good = call.outcome === "demo-booked";
        const dim = ["no-answer", "not-interested", "voicemail", "failed"].includes(call.outcome);
        return (
          <div key={call.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <button className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50/50" onClick={() => setExpanded(isOpen ? null : call.id)}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${good ? "bg-green-100" : dim || queued ? "bg-gray-100" : "bg-blue-100"}`}>
                <Phone className={`w-4 h-4 ${good ? "text-green-600" : dim || queued ? "text-gray-400" : "text-blue-500"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-900">{call.clubName}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${OUTCOME_COLOR[call.outcome] ?? "bg-gray-100 text-gray-600"}`}>
                    {queued ? "Scheduled" : OUTCOME_LABEL[call.outcome] ?? call.outcome}
                  </span>
                  {call.attempt > 1 && <span className="text-xs text-gray-400">attempt {call.attempt}</span>}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatPhone(call.phone)}
                  {showCampaign && <> · {call.campaignName}</>}
                  {call.email && <> · {call.email}</>}
                </p>
              </div>
              <div className="text-right shrink-0 mr-2">
                <p className="text-xs text-gray-400 flex items-center gap-1 justify-end"><Clock className="w-3 h-3" />{formatDuration(call.duration)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{fmtDateTime(call.endedAt ?? call.scheduledFor)}</p>
              </div>
              {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            {isOpen && (
              <div className="border-t border-gray-100 px-5 pb-5">
                <div className="flex items-center justify-between mt-4 mb-4 gap-2 flex-wrap">
                  <div className="flex gap-1">
                    <button onClick={() => setTab((p) => ({ ...p, [call.id]: "summary" }))}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${t === "summary" ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}>
                      <Sparkles className="w-3.5 h-3.5" />AI Summary
                    </button>
                    <button onClick={() => setTab((p) => ({ ...p, [call.id]: "transcript" }))}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${t === "transcript" ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}>
                      <FileText className="w-3.5 h-3.5" />Transcript
                    </button>
                    {call.recordingUrl && (
                      <a href={call.recordingUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100">
                        <Mic className="w-3.5 h-3.5" />Recording
                      </a>
                    )}
                  </div>
                  {!queued && (
                    <label className="flex items-center gap-2 text-xs text-gray-500">
                      Outcome
                      <select value={call.outcome} disabled={saving === call.id} onChange={(e) => setOutcome(call.id, e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700">
                        {EDITABLE.map((o) => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}
                        {!EDITABLE.includes(call.outcome) && <option value={call.outcome}>{OUTCOME_LABEL[call.outcome] ?? call.outcome}</option>}
                      </select>
                    </label>
                  )}
                </div>
                {call.error && (
                  <p className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
                    <AlertCircle className="w-4 h-4 shrink-0" />{call.error}
                  </p>
                )}
                {t === "summary" ? (
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {call.summary ?? (queued ? `Scheduled for ${fmtDateTime(call.scheduledFor)}.` : "Summary not available yet.")}
                    </p>
                  </div>
                ) : (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 max-h-72 overflow-y-auto">
                    <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{call.transcript || "Transcript not available yet."}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
