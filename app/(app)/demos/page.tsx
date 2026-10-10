"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, CalendarPlus, RefreshCw, Phone, Mail, CheckCircle, X } from "lucide-react";
import { formatPhone } from "@/lib/utils";
import { STAGE_COLOR, STAGE_LABEL, fmtDateTime, inputCls } from "@/lib/labels";

type Demo = {
  id: string; provider: string; status: string; startAt: string; endAt: string; timezone: string | null;
  inviteeEmail: string | null; inviteeName: string | null; contactId: string | null; clubName: string | null;
  phone: string | null; campaignName: string | null; ownerName: string;
};
type FollowUp = {
  id: string; clubName: string; contactName: string | null; phone: string; altPhone: string | null; email: string | null;
  stage: string; needsFollowUp: string | null; updatedAt: string; ownerName: string;
};

const PROVIDER: Record<string, string> = { calcom: "Cal.com", calendly: "Calendly", manual: "Manual" };

export default function DemosPage() {
  const [demos, setDemos] = useState<Demo[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [scheduling, setScheduling] = useState<FollowUp | null>(null);
  const [when, setWhen] = useState("");
  const [duration, setDuration] = useState("30");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/demos").catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setDemos(data.demos ?? []);
    setFollowUps(data.followUps ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const schedule = async () => {
    if (!scheduling || !when) return;
    setError(null);
    const res = await fetch("/api/demos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contactId: scheduling.id,
        startAt: new Date(when).toISOString(),
        durationMin: Number(duration),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? "Couldn't save the demo.");
    setScheduling(null);
    setWhen("");
    load();
  };

  const cancel = async (id: string) => {
    await fetch(`/api/demos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "canceled" }) });
    load();
  };

  const resolve = async (id: string) => {
    await fetch(`/api/contacts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clearFollowUp: true, stage: "interested" }) });
    load();
  };

  const now = Date.now();
  const upcoming = demos.filter((d) => d.status === "scheduled" && new Date(d.endAt).getTime() >= now).reverse();
  const past = demos.filter((d) => d.status !== "scheduled" || new Date(d.endAt).getTime() < now);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Demos</h1>
          <p className="text-gray-500 text-sm mt-1">Booked demos and prospects who still need a follow-up</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />Refresh
        </button>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Needs follow-up ({followUps.length})</h2>
        {scheduling && (
          <div className="bg-white rounded-xl border border-brand-200 p-4 space-y-3">
            <p className="text-sm font-medium text-gray-800">Log a demo with {scheduling.clubName}</p>
            <div className="flex gap-3">
              <input type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} />
              <select className={`${inputCls} w-40`} value={duration} onChange={(e) => setDuration(e.target.value)}>
                {[15, 30, 45, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}
              </select>
            </div>
            <p className="text-xs text-gray-400">Reminders go out 24h and 1h before, and follow-ups after the demo{scheduling.email ? ` to ${scheduling.email}` : " (no email on file, so no emails will be sent)"}.</p>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button onClick={schedule} disabled={!when} className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50">Save demo</button>
              <button onClick={() => setScheduling(null)} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        )}
        {followUps.length === 0 ? (
          <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-200 p-6 text-center">Nothing to follow up on.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {followUps.map((f) => (
              <div key={f.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-gray-800">{f.clubName}</p>
                    {f.contactName && <span className="text-xs text-gray-500">{f.contactName}</span>}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STAGE_COLOR[f.stage] ?? ""}`}>{STAGE_LABEL[f.stage] ?? f.stage}</span>
                    <span className="text-xs text-gray-400">· {f.ownerName}</span>
                  </div>
                  {f.needsFollowUp && <p className="text-xs text-amber-700 mt-0.5">{f.needsFollowUp}</p>}
                  <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-3">
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{formatPhone(f.altPhone || f.phone) || "—"}</span>
                    <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{f.email ?? "no email"}</span>
                  </p>
                </div>
                <button onClick={() => { setScheduling(f); setError(null); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-brand-200 text-brand-700 rounded-lg hover:bg-brand-50">
                  <CalendarPlus className="w-3.5 h-3.5" />Log demo
                </button>
                <button onClick={() => resolve(f.id)} title="Mark handled" className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
                  <CheckCircle className="w-3.5 h-3.5" />Done
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {[["Upcoming demos", upcoming], ["Past & canceled", past]].map(([title, list]) => (
        <section key={title as string} className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">{title as string} ({(list as Demo[]).length})</h2>
          {(list as Demo[]).length === 0 ? (
            <p className="text-sm text-gray-400 bg-white rounded-xl border border-gray-200 p-6 text-center">None.</p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {(list as Demo[]).map((d) => (
                <div key={d.id} className="flex items-center gap-4 px-4 py-3">
                  <CalendarCheck className={`w-5 h-5 shrink-0 ${d.status === "canceled" ? "text-gray-300" : "text-green-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${d.status === "canceled" ? "text-gray-400 line-through" : "text-gray-800"}`}>
                      {d.clubName ?? d.inviteeName ?? d.inviteeEmail}
                    </p>
                    <p className="text-xs text-gray-400">
                      {fmtDateTime(d.startAt)} · {PROVIDER[d.provider] ?? d.provider}
                      {d.inviteeEmail && <> · {d.inviteeEmail}</>}
                      {d.campaignName && <> · {d.campaignName}</>} · {d.ownerName}
                    </p>
                  </div>
                  {d.status === "scheduled" && new Date(d.startAt).getTime() > now && (
                    <button onClick={() => cancel(d.id)} title={d.provider === "manual" ? "Cancel demo" : "Mark canceled here (also cancel it in your calendar)"}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-red-500">
                      <X className="w-3.5 h-3.5" />Cancel
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
