"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Play, Pause, ChevronRight, RefreshCw, Trash2, Phone, Mail } from "lucide-react";
import { VOICE_LABEL } from "@/lib/voices";
import { STATUS_COLOR } from "@/lib/labels";

type Campaign = {
  id: string;
  name: string;
  description: string;
  channel: "call" | "email";
  status: string;
  voiceId: string;
  maxPerDay: number;
  windowStart: string;
  windowEnd: string;
  ownerName: string;
  contactCount: number;
  remaining: number;
  callsMade: number;
  callsQueued: number;
  demosRequested: number;
  demosScheduled: number;
  emailsSent: number;
};

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/campaigns").catch(() => null);
    const data = res ? await res.json().catch(() => []) : [];
    setCampaigns(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setStatus = async (id: string, status: "active" | "paused") => {
    await fetch(`/api/campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  };

  const deleteCampaign = async (id: string) => {
    setConfirmDelete(null);
    await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    load();
  };

  const launch = async (id: string) => {
    const res = await fetch(`/api/campaigns/${id}/launch`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setMessage(res.ok
      ? { ok: true, text: `Launched — ${data.scheduled} scheduled today.${data.warnings?.length ? " " + data.warnings.join(" ") : ""}` }
      : { ok: false, text: data.error ?? "Launch failed." });
    load();
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-gray-500 text-sm mt-1">{campaigns.length} campaigns</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <Link href="/campaigns/new" className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" />New Campaign
          </Link>
        </div>
      </div>

      {message && (
        <div className={`text-sm rounded-lg px-4 py-2 border ${message.ok ? "bg-green-50 border-green-100 text-green-700" : "bg-red-50 border-red-100 text-red-700"}`}>
          {message.text}
        </div>
      )}

      {loading && campaigns.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin mr-2" />Loading...</div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-sm font-medium">No campaigns yet.</p>
          <p className="text-xs mt-1">Create one to start calling or emailing.</p>
          <Link href="/campaigns/new" className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" />New Campaign
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((c) => {
            const done = c.contactCount - c.remaining;
            const progress = c.contactCount > 0 ? (done / c.contactCount) * 100 : 0;
            const isCall = c.channel === "call";
            return (
              <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {isCall ? <Phone className="w-4 h-4 text-blue-500" /> : <Mail className="w-4 h-4 text-purple-500" />}
                      <h2 className="text-base font-semibold text-gray-900">{c.name}</h2>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[c.status] ?? "bg-gray-100 text-gray-600"}`}>{c.status}</span>
                      <span className="text-xs text-gray-400">· {c.ownerName}</span>
                    </div>
                    <p className="text-sm text-gray-500 mb-4">{c.description}</p>

                    <div className="grid grid-cols-4 gap-4 mb-4">
                      <div><p className="text-xs text-gray-400">Contacts</p><p className="text-lg font-bold text-gray-800">{c.contactCount}</p></div>
                      {isCall ? (
                        <div><p className="text-xs text-gray-400">Calls Made</p><p className="text-lg font-bold text-gray-800">{c.callsMade}{c.callsQueued > 0 && <span className="text-xs font-normal text-gray-400"> +{c.callsQueued} queued</span>}</p></div>
                      ) : (
                        <div><p className="text-xs text-gray-400">Emails Sent</p><p className="text-lg font-bold text-gray-800">{c.emailsSent}</p></div>
                      )}
                      <div><p className="text-xs text-gray-400">{isCall ? "Wants Demo" : "Not Started"}</p><p className="text-lg font-bold text-amber-600">{isCall ? c.demosRequested : c.remaining}</p></div>
                      <div><p className="text-xs text-gray-400">Demos Scheduled</p><p className="text-lg font-bold text-green-600">{c.demosScheduled}</p></div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>Progress</span>
                        <span>{done} / {c.contactCount} contacts finished</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(progress, 100)}%` }} />
                      </div>
                    </div>

                    <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                      <span>{c.windowStart}–{c.windowEnd} weekdays</span>
                      <span>Max {c.maxPerDay}/day</span>
                      {isCall && <span>Voice: {VOICE_LABEL[c.voiceId] ?? "Custom"}</span>}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 shrink-0">
                    {c.status === "active" && (
                      <button onClick={() => setStatus(c.id, "paused")} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border font-medium border-yellow-200 text-yellow-700 hover:bg-yellow-50">
                        <Pause className="w-4 h-4" />Pause
                      </button>
                    )}
                    {c.status === "paused" && (
                      <button onClick={() => setStatus(c.id, "active")} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border font-medium border-green-200 text-green-700 hover:bg-green-50">
                        <Play className="w-4 h-4" />Resume
                      </button>
                    )}
                    {c.status === "draft" && (
                      <button onClick={() => launch(c.id)} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 font-medium">
                        <Play className="w-4 h-4" />Launch
                      </button>
                    )}
                    <Link href={`/campaigns/${c.id}`} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium">
                      View <ChevronRight className="w-4 h-4" />
                    </Link>
                    {confirmDelete === c.id ? (
                      <div className="flex gap-1">
                        <button onClick={() => deleteCampaign(c.id)} className="flex-1 px-2 py-2 text-xs rounded-lg bg-red-600 text-white hover:bg-red-700 font-medium">Confirm</button>
                        <button onClick={() => setConfirmDelete(null)} className="flex-1 px-2 py-2 text-xs rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50">Cancel</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(c.id)} className="flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-lg border border-red-100 text-red-400 hover:bg-red-50 hover:text-red-600 font-medium">
                        <Trash2 className="w-4 h-4" />Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
