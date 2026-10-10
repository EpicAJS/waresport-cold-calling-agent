"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Inbox, RefreshCw, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useShell } from "@/components/shell-context";
import { timeAgo } from "@/lib/ui";
import { cn } from "@/lib/utils";

type Box = { id: string; provider: "google" | "microsoft"; email: string; status: string; lastError: string | null; lastSyncAt: string | null; userId: string; ownerName: string };

/** Connect Gmail/Outlook, see sync status, sync now, disconnect. Shows only the viewer's own inboxes. */
export default function InboxesCard({ meId }: { meId: string }) {
  const search = useSearchParams();
  const { refresh } = useShell();
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [providers, setProviders] = useState({ google: false, microsoft: false });
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(
    search.get("connected") ? { ok: true, msg: `Connected ${search.get("connected")}. Replies will be scanned automatically.` }
      : search.get("error") ? { ok: false, msg: search.get("error")! } : null
  );

  const load = useCallback(async () => {
    const res = await fetch("/api/mailboxes", { cache: "no-store" });
    if (!res.ok) return;
    const d = await res.json();
    setBoxes(d.mailboxes.filter((b: Box) => b.userId === meId && b.status !== "disconnected"));
    setProviders(d.providers);
  }, [meId]);
  useEffect(() => { load(); }, [load]);

  const sync = async (id: string) => {
    setBusy(id);
    const res = await fetch(`/api/mailboxes/${id}/sync`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBusy(null);
    setStatus(d.ok ? { ok: true, msg: `Scanned: ${d.replies} new repl${d.replies === 1 ? "y" : "ies"}, ${d.manualSent} hand-sent email${d.manualSent === 1 ? "" : "s"} logged.` } : { ok: false, msg: d.error ?? "Sync failed." });
    load();
    refresh();
  };
  const disconnect = async (id: string) => {
    await fetch(`/api/mailboxes/${id}`, { method: "DELETE" });
    load();
    refresh();
  };

  const btn = "inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white text-gray-800 hover:bg-gray-50";

  return (
    <div id="inboxes" className="bg-white rounded-xl border border-gray-200 p-5 space-y-4 scroll-mt-20">
      <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Inbox className="w-4 h-4 text-blue-500" />Connected inboxes</h2>
      <p className="text-sm text-gray-500">
        Campaign emails send from your own inbox, and replies are scanned and sorted in the AI Inbox. Only replies from people
        you&apos;ve emailed (or who are in your contacts) are read — the rest of your mail is ignored.
      </p>

      {boxes.length > 0 && (
        <div className="space-y-2">
          {boxes.map((b) => (
            <div key={b.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <span className={cn("w-2 h-2 rounded-full shrink-0", b.status === "active" && !b.lastError ? "bg-green-500" : "bg-amber-500")} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{b.email} <span className="text-xs font-normal text-gray-400">{b.provider === "google" ? "Gmail" : "Outlook"}</span></p>
                <p className={cn("text-xs", b.lastError || b.status === "error" ? "text-amber-700" : "text-gray-500")}>
                  {b.status === "error" ? `Needs reconnecting: ${b.lastError ?? ""}` : b.lastError ? `Last scan failed: ${b.lastError}` : `Last scanned ${timeAgo(b.lastSyncAt)}`}
                </p>
              </div>
              {b.status === "error" ? (
                <a href={`/api/oauth/${b.provider}/start?mode=connect`} className="text-xs text-blue-600 hover:underline">Reconnect</a>
              ) : (
                <button onClick={() => sync(b.id)} disabled={busy === b.id} className="text-xs text-blue-600 hover:underline flex items-center gap-1 disabled:opacity-50">
                  {busy === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}Scan now
                </button>
              )}
              <button onClick={() => disconnect(b.id)} className="text-xs text-gray-500 hover:text-red-600">Disconnect</button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        {providers.google && <a href="/api/oauth/google/start?mode=connect" className={btn}>Connect Gmail</a>}
        {providers.microsoft && <a href="/api/oauth/microsoft/start?mode=connect" className={btn}>Connect Outlook</a>}
        {!providers.google && !providers.microsoft && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Gmail/Outlook connections aren&apos;t set up yet. An admin needs to add GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET and/or
            MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET (see the README).
          </p>
        )}
      </div>

      {status && (
        <div className={cn("flex items-center gap-2 text-sm rounded-lg p-3 border", status.ok ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200")}>
          {status.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}{status.msg}
        </div>
      )}
    </div>
  );
}
