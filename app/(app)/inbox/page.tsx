"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Send, RefreshCw, Archive, Clock, Sparkles, Loader2, Inbox as InboxIcon, Phone, Undo2 } from "lucide-react";
import { useShell } from "@/components/shell-context";
import { Empty } from "@/components/kit";
import { initials, timeAgo, INTENT_LABEL, INTENT_CHIP } from "@/lib/ui";
import { formatPhone } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Item = {
  id: string; fromName: string | null; fromEmail: string; subject: string; snippet: string; receivedAt: string;
  intent: string | null; intentSource: string | null; confidence: number | null; aiSummary: string | null;
  suggestedReply: string | null; suggestedReplySource: string | null; status: string; snoozedUntil: string | null;
  contactId: string | null; clubName: string | null; contactName: string | null; phone: string | null;
  ownerName: string; campaignName: string | null; mailboxEmail: string;
};
type Detail = Item & { bodyText: string; thread: Array<{ id: string; at: string; subject: string; text: string; kind: string; direction: "in" | "out" }> };

const FILTERS = [
  { key: "new", label: "Needs action", q: "status=new" },
  { key: "positive", label: "Interested", q: "status=all&intent=positive" },
  { key: "needs-info", label: "Needs info", q: "status=all&intent=needs-info" },
  { key: "not-interested", label: "Not interested", q: "status=all&intent=not-interested" },
  { key: "negative", label: "Negative", q: "status=all&intent=negative" },
  { key: "snoozed", label: "Snoozed", q: "status=snoozed" },
  { key: "all", label: "All", q: "status=all" },
];

const RECLASSIFY = ["positive", "needs-info", "not-interested", "negative", "out-of-office", "other"];

function InboxView() {
  const router = useRouter();
  const search = useSearchParams();
  const { refresh: refreshShell, data: shell } = useShell();
  const [filter, setFilter] = useState(search.get("intent") ?? "new");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(search.get("id"));
  const [detail, setDetail] = useState<Detail | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const f = FILTERS.find((x) => x.key === filter) ?? FILTERS[0];
    const res = await fetch(`/api/inbox?${f.q}${q ? `&q=${encodeURIComponent(q)}` : ""}`, { cache: "no-store" });
    const rows: Item[] = res.ok ? await res.json() : [];
    setItems(rows);
    setLoading(false);
    setSelectedId((cur) => cur ?? rows[0]?.id ?? null);
  }, [filter, q]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    fetch(`/api/inbox/${selectedId}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d: Detail | null) => {
      setDetail(d);
      setDraft(d?.suggestedReply ?? "");
    });
    router.replace(`/inbox?id=${selectedId}${filter !== "new" ? `&intent=${filter}` : ""}`, { scroll: false });
  }, [selectedId, filter, router]);

  const act = async (label: string, fn: () => Promise<Response>, ok: string, advance = true) => {
    setBusy(label);
    setNotice(null);
    const res = await fn();
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setNotice({ ok: false, text: data.error ?? "Something went wrong." });
    setNotice({ ok: true, text: ok });
    refreshShell();
    if (advance) {
      const idx = items.findIndex((i) => i.id === selectedId);
      const next = items[idx + 1] ?? items[idx - 1];
      setSelectedId(next && next.id !== selectedId ? next.id : null);
    }
    load();
  };

  const patch = (body: Record<string, unknown>) => fetch(`/api/inbox/${selectedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  const regenerate = async () => {
    setBusy("draft");
    const res = await fetch(`/api/inbox/${selectedId}/draft`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok) setDraft(data.suggestedReply ?? "");
  };

  return (
    <div className="h-[calc(100vh-52px)] flex">
      {/* List */}
      <div className="w-[380px] shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-3 border-b border-gray-200 space-y-2">
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-semibold text-gray-900">AI Inbox</h1>
            {shell.unread > 0 && <span className="text-[10px] font-semibold bg-red-500 text-white rounded-full px-1.5">{shell.unread}</span>}
            <button onClick={load} className="ml-auto p-1 text-gray-400 hover:text-gray-700" title="Refresh"><RefreshCw className="w-3.5 h-3.5" /></button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search replies…"
              className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => { setFilter(f.key); setSelectedId(null); setLoading(true); }}
                className={cn("text-[11px] px-2 py-0.5 rounded-full border", filter === f.key ? "border-brand-500 text-brand-500 bg-brand-50" : "border-gray-200 text-gray-500 hover:text-gray-900")}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? <Empty>Loading…</Empty> : items.length === 0 ? (
            <Empty>{filter === "new" ? "You're all caught up. New replies are classified and routed here automatically." : "Nothing here."}</Empty>
          ) : items.map((m) => (
            <button key={m.id} onClick={() => setSelectedId(m.id)}
              className={cn("w-full text-left px-3 py-2.5 border-b border-gray-200 border-l-2", selectedId === m.id ? "bg-brand-50 border-l-brand-500" : "border-l-transparent hover:bg-gray-50")}>
              <div className="flex items-center gap-2">
                {m.status === "new" && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />}
                <span className="text-xs font-medium text-gray-900 truncate">{m.fromName || m.fromEmail}</span>
                <span className="text-[10px] text-gray-400 ml-auto shrink-0">{timeAgo(m.receivedAt)}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {m.intent && <span className={INTENT_CHIP[m.intent]}>{INTENT_LABEL[m.intent]}</span>}
                <span className="text-[11px] text-gray-500 truncate">{m.clubName}</span>
              </div>
              <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{m.snippet}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">→ {m.ownerName}{m.status !== "new" ? ` · ${m.status}` : ""}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {!detail ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
            <InboxIcon className="w-8 h-8 opacity-40" />
            <p className="text-xs">Select a reply</p>
          </div>
        ) : (
          <div className="p-6 max-w-3xl space-y-4">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-full bg-gray-100 border border-gray-200 text-xs font-semibold flex items-center justify-center text-gray-500 shrink-0">
                {initials(detail.fromName || detail.fromEmail)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{detail.fromName || detail.fromEmail} <span className="font-normal text-gray-400 text-xs">&lt;{detail.fromEmail}&gt;</span></p>
                <p className="text-xs text-gray-500">
                  {detail.clubName}{detail.campaignName ? ` · ${detail.campaignName}` : ""} · to {detail.mailboxEmail} ({detail.ownerName}) · {timeAgo(detail.receivedAt)}
                </p>
              </div>
              {detail.phone && (
                <a href={`tel:${detail.phone}`} className="btn"><Phone className="w-3.5 h-3.5" />{formatPhone(detail.phone)}</a>
              )}
            </div>

            <div className="card p-4 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Sparkles className="w-3.5 h-3.5 text-brand-500" />
                <span className="text-[11px] font-semibold text-brand-500 uppercase tracking-wide">
                  {detail.intentSource === "ai" ? "AI classification" : detail.intentSource === "manual" ? "Set manually" : "Rule-based classification"}
                </span>
                {detail.intent && <span className={INTENT_CHIP[detail.intent]}>{INTENT_LABEL[detail.intent]}</span>}
                {detail.confidence != null && detail.intentSource !== "manual" && <span className="text-[10px] text-gray-400">{Math.round(detail.confidence * 100)}% confident</span>}
                <label className="ml-auto text-[11px] text-gray-500 flex items-center gap-1.5">
                  Reclassify
                  <select value={detail.intent ?? "other"} onChange={(e) => act("intent", () => patch({ intent: e.target.value }), "Reclassified — follow-up actions updated.", false).then(() => setSelectedId(detail.id))}
                    className="border border-gray-200 rounded px-1.5 py-0.5 text-[11px]">
                    {RECLASSIFY.map((i) => <option key={i} value={i}>{INTENT_LABEL[i]}</option>)}
                  </select>
                </label>
              </div>
              {detail.aiSummary && <p className="text-xs text-gray-700">{detail.aiSummary}</p>}
              {!shell.aiEnabled && <p className="text-[11px] text-gray-400">AI classification and drafting turn on automatically when the OpenAI key is added.</p>}
            </div>

            <div className="space-y-2">
              <p className="eyebrow">Conversation</p>
              {detail.thread.map((t) => (
                <div key={`${t.direction}-${t.id}`} className={cn("rounded-[10px] border px-3.5 py-2.5 max-w-[90%]", t.direction === "out" ? "ml-auto bg-brand-50 border-brand-200" : "bg-white border-gray-200")}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-semibold text-gray-500">{t.direction === "out" ? "You" : detail.fromName || "Them"}</span>
                    <span className="text-[10px] text-gray-400">{t.at ? new Date(t.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}</span>
                    <span className="text-[10px] text-gray-400 truncate">{t.subject}</span>
                  </div>
                  <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{(t.text || "").replace(/\n--\n[\s\S]*$/, "").slice(0, 3000)}</pre>
                </div>
              ))}
            </div>

            <div className="card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <p className="eyebrow">Suggested reply</p>
                <span className="text-[10px] text-purple-700">{detail.suggestedReplySource === "ai" ? "AI draft" : detail.suggestedReplySource === "template" ? "Template" : ""}</span>
                <button onClick={regenerate} disabled={busy !== null} className="ml-auto text-[11px] text-brand-500 hover:underline flex items-center gap-1 disabled:opacity-50">
                  {busy === "draft" ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}Regenerate
                </button>
              </div>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Write a reply…"
                className="w-full h-44 resize-y border border-gray-200 rounded-md px-3 py-2 text-[13px] leading-relaxed focus:outline-none focus:ring-1 focus:ring-brand-500" />
              {notice && <p className={cn("text-xs rounded-md px-3 py-2 border", notice.ok ? "text-green-700 bg-green-50 border-green-200" : "text-red-700 bg-red-50 border-red-200")}>{notice.text}</p>}
              <div className="flex items-center gap-2 flex-wrap">
                <button disabled={busy !== null || !draft.trim()} className="btn-primary"
                  onClick={() => act("send", () => fetch(`/api/inbox/${detail.id}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: draft }) }), `Reply sent from ${detail.mailboxEmail}.`)}>
                  {busy === "send" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}Send reply
                </button>
                {detail.status !== "archived" ? (
                  <button disabled={busy !== null} className="btn" onClick={() => act("archive", () => patch({ status: "archived" }), "Archived.")}>
                    <Archive className="w-3.5 h-3.5" />Archive
                  </button>
                ) : (
                  <button disabled={busy !== null} className="btn" onClick={() => act("unarchive", () => patch({ status: "new" }), "Moved back to Needs action.", false)}>
                    <Undo2 className="w-3.5 h-3.5" />Unarchive
                  </button>
                )}
                {[7, 30, 60].map((n) => (
                  <button key={n} disabled={busy !== null} className="btn" onClick={() => act("snooze", () => patch({ status: "snoozed", snoozeDays: n }), `Snoozed — it'll come back in ${n} days.`)}>
                    <Clock className="w-3.5 h-3.5" />Follow up in {n}d
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InboxPage() {
  return <Suspense><InboxView /></Suspense>;
}
