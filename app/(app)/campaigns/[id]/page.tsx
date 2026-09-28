"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Play, Pause, RefreshCw, Phone, Mail, Plus, Save, CheckSquare, Square } from "lucide-react";
import { formatLocation, formatPhone } from "@/lib/utils";
import { VOICES } from "@/lib/voices";
import { OUTCOME_LABEL, STAGE_COLOR, STAGE_LABEL, STATUS_COLOR, TIMEZONES, fmtDateTime, inputCls } from "@/lib/labels";
import type { EmailTemplates } from "@/lib/db/schema";
import CallList, { type CallRow } from "@/components/call-list";
import EmailList, { type EmailRow } from "@/components/email-list";
import ScriptEditor from "@/components/script-editor";
import EmailTemplatesEditor from "@/components/email-templates-editor";

type Member = {
  id: string; clubName: string; phone: string; email: string | null; city: string; state: string; stage: string;
  queueStatus: string; attempts: number; nextAttemptAt: string | null; lastOutcome: string | null;
};

type Campaign = {
  id: string; name: string; description: string; channel: "call" | "email"; status: string; script: string; voiceId: string;
  fromNumber: string | null; maxPerDay: number; windowStart: string; windowEnd: string; timezone: string; maxRetries: number;
  emailsEnabled: boolean; emailTemplates: EmailTemplates; ownerName: string;
  contactCount: number; remaining: number; callsMade: number; callsQueued: number; answered: number;
  demosRequested: number; demosScheduled: number; emailsSent: number; contacts: Member[];
};

type BookContact = { id: string; clubName: string; phone: string; email: string | null; city: string; state: string; stage: string; emailOptOut: boolean };

const QUEUE_LABEL: Record<string, string> = { pending: "Waiting", scheduled: "Scheduled", done: "Done", skipped: "Skipped" };

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<"contacts" | "calls" | "emails" | "settings">("contacts");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    search.get("launchError") ? { ok: false, text: search.get("launchError")! } : null
  );

  const [draft, setDraft] = useState<Partial<Campaign>>({});
  const [adding, setAdding] = useState(false);
  const [book, setBook] = useState<BookContact[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/campaigns/${id}`);
    if (!res.ok) { setNotFound(true); setLoading(false); return; }
    const c: Campaign = await res.json();
    setCampaign(c);
    setDraft({
      name: c.name, description: c.description, script: c.script, voiceId: c.voiceId, maxPerDay: c.maxPerDay,
      windowStart: c.windowStart, windowEnd: c.windowEnd, timezone: c.timezone, maxRetries: c.maxRetries,
      emailsEnabled: c.emailsEnabled, emailTemplates: c.emailTemplates,
    });
    const [callsRes, emailsRes] = await Promise.all([
      fetch(`/api/calls?campaign_id=${id}`), fetch(`/api/emails?campaign_id=${id}`),
    ]);
    setCalls(await callsRes.json().catch(() => []));
    setEmails(await emailsRes.json().catch(() => []));
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const patch = async (body: Record<string, unknown>, okText: string) => {
    setBusy(true);
    const res = await fetch(`/api/campaigns/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) setMessage({ ok: false, text: data.error ?? "Update failed." });
    else {
      let text = okText;
      if (data.cancelled?.notStopped) text += ` ${data.cancelled.notStopped} already-queued call(s) couldn't be cancelled at Bland and may still go out.`;
      setMessage({ ok: true, text });
    }
    await load();
    return res.ok;
  };

  const launch = async () => {
    setBusy(true);
    const res = await fetch(`/api/campaigns/${id}/launch`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMessage(res.ok
      ? { ok: true, text: `Launched — ${data.scheduled} scheduled for today; the rest follow your daily limit.${data.warnings?.length ? " " + data.warnings.join(" ") : ""}` }
      : { ok: false, text: data.error ?? "Launch failed." });
    load();
  };

  const sync = async () => {
    setBusy(true);
    const res = await fetch(`/api/calls/sync?campaign_id=${id}`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setMessage({ ok: res.ok, text: res.ok ? `Checked Bland for results: ${data.synced} call(s) updated.` : data.error ?? "Sync failed." });
    load();
  };

  const openAdd = async () => {
    setAdding(true);
    const res = await fetch("/api/contacts");
    setBook(await res.json().catch(() => []));
  };

  if (loading && !campaign) {
    return <div className="flex items-center justify-center p-20 text-gray-400"><RefreshCw className="w-5 h-5 animate-spin mr-2" />Loading...</div>;
  }
  if (notFound || !campaign) {
    return (
      <div className="p-6">
        <Link href="/campaigns" className="text-blue-600 hover:underline text-sm flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> Back</Link>
        <p className="mt-6 text-gray-500">Campaign not found.</p>
      </div>
    );
  }

  const isCall = campaign.channel === "call";
  const inCampaign = new Set(campaign.contacts.map((c) => c.id));
  const addable = book.filter((c) => !inCampaign.has(c.id) && !["do-not-call", "wrong-number"].includes(c.stage)
    && (isCall ? c.phone : c.email && !c.emailOptOut));

  const stats = isCall
    ? [
        { label: "Contacts", value: campaign.contactCount },
        { label: "Calls Made", value: campaign.callsMade, sub: campaign.callsQueued ? `${campaign.callsQueued} scheduled` : undefined },
        { label: "Answered", value: campaign.answered },
        { label: "Wants Demo", value: campaign.demosRequested, color: "text-amber-600" },
        { label: "Demos Scheduled", value: campaign.demosScheduled, color: "text-green-600" },
      ]
    : [
        { label: "Contacts", value: campaign.contactCount },
        { label: "Not Started", value: campaign.remaining },
        { label: "Emails Sent", value: campaign.emailsSent },
        { label: "Demos Scheduled", value: campaign.demosScheduled, color: "text-green-600" },
      ];

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href="/campaigns" className="text-gray-400 hover:text-gray-600"><ChevronLeft className="w-5 h-5" /></Link>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {isCall ? <Phone className="w-5 h-5 text-blue-500" /> : <Mail className="w-5 h-5 text-purple-500" />}
            <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[campaign.status] ?? ""}`}>{campaign.status}</span>
          </div>
          <p className="text-gray-500 text-sm mt-0.5">{campaign.description} <span className="text-gray-400">· {campaign.ownerName}</span></p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 border border-gray-200 rounded-lg text-gray-400 hover:bg-gray-50" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          {isCall && campaign.status !== "draft" && (
            <button onClick={sync} disabled={busy} className="flex items-center gap-2 px-3 py-2 text-sm border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50 font-medium">
              <RefreshCw className="w-4 h-4" />Check results
            </button>
          )}
          {campaign.status === "draft" && (
            <button onClick={launch} disabled={busy} className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 font-medium disabled:opacity-50">
              <Play className="w-4 h-4" />Launch
            </button>
          )}
          {campaign.status === "active" && (
            <button onClick={() => patch({ status: "paused" }, "Campaign paused. Future scheduled calls were cancelled.")} disabled={busy}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border font-medium border-yellow-200 text-yellow-700 hover:bg-yellow-50 disabled:opacity-50">
              <Pause className="w-4 h-4" />Pause
            </button>
          )}
          {campaign.status === "paused" && (
            <button onClick={() => patch({ status: "active" }, "Campaign resumed.")} disabled={busy}
              className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border font-medium border-green-200 text-green-700 hover:bg-green-50 disabled:opacity-50">
              <Play className="w-4 h-4" />Resume
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`text-sm rounded-lg px-4 py-2 border ${message.ok ? "bg-blue-50 border-blue-100 text-blue-700" : "bg-red-50 border-red-100 text-red-700"}`}>
          {message.text}
        </div>
      )}

      <div className={`grid gap-4 ${stats.length === 5 ? "grid-cols-5" : "grid-cols-4"}`}>
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-400 font-medium">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color ?? "text-gray-900"}`}>{s.value}</p>
            {"sub" in s && s.sub && <p className="text-xs text-gray-400">{s.sub}</p>}
          </div>
        ))}
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {([
          ["contacts", `Contacts (${campaign.contactCount})`],
          ...(isCall ? [["calls", `Calls (${calls.length})`]] : []),
          ["emails", `Emails (${emails.length})`],
          ["settings", "Script & Settings"],
        ] as Array<[typeof tab, string]>).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === k ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "contacts" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={openAdd} className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50">
              <Plus className="w-4 h-4" />Add contacts
            </button>
          </div>
          {adding && (
            <div className="bg-white rounded-xl border border-blue-200 p-4 space-y-3">
              <p className="text-sm font-medium text-gray-800">Add from your contact book ({addable.length} eligible)</p>
              <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-lg">
                {addable.map((c) => (
                  <div key={c.id} onClick={() => setPicked((p) => { const n = new Set(p); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}
                    className="flex items-center gap-3 px-3 py-2 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50">
                    {picked.has(c.id) ? <CheckSquare className="w-4 h-4 text-blue-500" /> : <Square className="w-4 h-4 text-gray-300" />}
                    <span className="text-sm text-gray-800">{c.clubName}</span>
                    <span className="text-xs text-gray-400">{isCall ? formatPhone(c.phone) : c.email}</span>
                  </div>
                ))}
                {addable.length === 0 && <p className="text-sm text-gray-400 p-4 text-center">No more eligible contacts.</p>}
              </div>
              <div className="flex gap-2">
                <button disabled={!picked.size || busy}
                  onClick={async () => { if (await patch({ contactIds: Array.from(picked) }, `Added ${picked.size} contact(s).`)) { setPicked(new Set()); setAdding(false); } }}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  Add {picked.size || ""}
                </button>
                <button onClick={() => { setAdding(false); setPicked(new Set()); }} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
              </div>
            </div>
          )}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-400 text-left border-b border-gray-100">
                  <th className="px-4 py-3 font-medium">Club</th>
                  <th className="px-4 py-3 font-medium">{isCall ? "Phone" : "Email"}</th>
                  <th className="px-4 py-3 font-medium">Queue</th>
                  {isCall && <th className="px-4 py-3 font-medium">Attempts</th>}
                  <th className="px-4 py-3 font-medium">Last result</th>
                  <th className="px-4 py-3 font-medium">Stage</th>
                </tr>
              </thead>
              <tbody>
                {campaign.contacts.map((m) => (
                  <tr key={m.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-2.5 text-sm font-medium text-gray-800">{m.clubName}<span className="block text-xs text-gray-400 font-normal">{formatLocation(m.city, m.state)}</span></td>
                    <td className="px-4 py-2.5 text-sm text-gray-600">{isCall ? formatPhone(m.phone) : m.email}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-600">
                      {QUEUE_LABEL[m.queueStatus] ?? m.queueStatus}
                      {m.queueStatus === "pending" && m.nextAttemptAt && <span className="block text-gray-400">retry {fmtDateTime(m.nextAttemptAt)}</span>}
                    </td>
                    {isCall && <td className="px-4 py-2.5 text-sm text-gray-600">{m.attempts} / {campaign.maxRetries + 1}</td>}
                    <td className="px-4 py-2.5 text-xs text-gray-600">{m.lastOutcome ? OUTCOME_LABEL[m.lastOutcome] ?? m.lastOutcome : "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STAGE_COLOR[m.stage] ?? ""}`}>{STAGE_LABEL[m.stage] ?? m.stage}</span>
                    </td>
                  </tr>
                ))}
                {campaign.contacts.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-sm text-gray-400 py-10">No contacts in this campaign yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "calls" && <CallList calls={calls} showCampaign={false} onChanged={load} />}
      {tab === "emails" && <EmailList emails={emails} showCampaign={false} onChanged={load} />}

      {tab === "settings" && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Name</label>
              <input className={inputCls} value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Per day</label>
              <input type="number" className={inputCls} value={draft.maxPerDay ?? 0} onChange={(e) => setDraft({ ...draft, maxPerDay: Number(e.target.value) })} />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Description</label>
              <input className={inputCls} value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Start</label>
                <input type="time" className={inputCls} value={draft.windowStart ?? ""} onChange={(e) => setDraft({ ...draft, windowStart: e.target.value })} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">End</label>
                <input type="time" className={inputCls} value={draft.windowEnd ?? ""} onChange={(e) => setDraft({ ...draft, windowEnd: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Default timezone</label>
              <select className={inputCls} value={draft.timezone} onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}>
                {TIMEZONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            {isCall && (
              <>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">Retries (no-answer / voicemail)</label>
                  <select className={inputCls} value={draft.maxRetries} onChange={(e) => setDraft({ ...draft, maxRetries: Number(e.target.value) })}>
                    {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">Voice</label>
                  <select className={inputCls} value={draft.voiceId} onChange={(e) => setDraft({ ...draft, voiceId: e.target.value })}>
                    {VOICES.map((v) => <option key={v.id} value={v.id}>{v.label} — {v.desc}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>

          {isCall && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Call script</h3>
              <ScriptEditor value={draft.script ?? ""} onChange={(v) => setDraft({ ...draft, script: v })} brief={campaign.description} />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-700">Automated emails</h3>
              {isCall && (
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" className="rounded" checked={draft.emailsEnabled ?? true} onChange={(e) => setDraft({ ...draft, emailsEnabled: e.target.checked })} />
                  Send follow-up emails
                </label>
              )}
            </div>
            {draft.emailTemplates && (
              <EmailTemplatesEditor value={draft.emailTemplates} onChange={(t) => setDraft({ ...draft, emailTemplates: t })} channel={campaign.channel} brief={campaign.description} />
            )}
            <p className="text-xs text-gray-400 mt-2">Template changes apply to emails queued from now on; already-queued emails keep their content.</p>
          </div>

          <button onClick={() => patch(draft, "Campaign saved.")} disabled={busy}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
            <Save className="w-4 h-4" />Save changes
          </button>
        </div>
      )}
    </div>
  );
}
