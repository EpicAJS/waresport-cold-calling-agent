"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, CheckCircle, AlertCircle } from "lucide-react";
import { Card, SectionHeader, Empty } from "@/components/kit";
import { avatarStyle, initials, pct, ROLE_LABEL } from "@/lib/ui";
import { inputCls } from "@/lib/labels";
import { cn } from "@/lib/utils";

type Member = {
  id: string; name: string; email: string; role: string; disabled: boolean;
  stats: { sent: number; opened: number; replied: number; positive: number; calls: number } | null;
  mailboxes: Array<{ email: string; provider: string; status: string }>;
};
type Invite = { id: string; email: string; role: string; expiresAt: string };

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [invite, setInvite] = useState({ email: "", role: "rep" });
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    const [t, me] = await Promise.all([fetch("/api/team"), fetch("/api/me")]);
    if (t.ok) { const d = await t.json(); setMembers(d.members); setInvites(d.invites); }
    if (me.ok) setMeId((await me.json()).id);
  }, []);
  useEffect(() => { load(); }, [load]);

  const call = async (url: string, method: string, body?: unknown) => {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  };

  const sendInvite = async () => {
    const r = await call("/api/team", "POST", invite);
    setStatus(r.ok
      ? { ok: true, msg: r.data.emailed ? `Invite emailed to ${invite.email}. They can sign in with Google/Microsoft or set a password. Link: ${r.data.link}` : `Share this invite link with them: ${r.data.link}` }
      : { ok: false, msg: r.data.error ?? "Invite failed." });
    if (r.ok) setInvite({ email: "", role: "rep" });
    load();
  };
  const update = async (id: string, patch: Record<string, unknown>) => {
    const r = await call(`/api/team/${id}`, "PATCH", patch);
    if (!r.ok) setStatus({ ok: false, msg: r.data.error ?? "Update failed." });
    load();
  };
  const reset = async (m: Member) => {
    const r = await call(`/api/team/${m.id}/reset`, "POST");
    setStatus(r.ok ? { ok: true, msg: `${r.data.emailed ? `Reset link emailed to ${m.email}.` : "Send them this reset link."} Valid 24 hours: ${r.data.link}` } : { ok: false, msg: r.data.error ?? "Couldn't create a reset link." });
  };

  return (
    <div className="p-6 flex flex-col gap-5 max-w-5xl">
      <div>
        <h1 className="text-[15px] font-semibold text-gray-900">Team</h1>
        <p className="text-xs text-gray-500 mt-0.5">Everyone who sends outreach. Reps and interns see only their own work; admins see the whole team.</p>
      </div>

      <Card className="p-4 space-y-3">
        <SectionHeader title="Invite a teammate" />
        <div className="flex gap-2">
          <input className={inputCls} type="email" placeholder="name@waresport.com" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          <select className="border border-gray-200 rounded-lg px-2 text-sm" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
            <option value="rep">Sales</option>
            <option value="intern">Intern</option>
            <option value="admin">Admin</option>
          </select>
          <button onClick={sendInvite} disabled={!invite.email} className="btn-primary whitespace-nowrap"><Plus className="w-3.5 h-3.5" />Invite</button>
        </div>
        {status && (
          <div className={cn("flex items-start gap-2 text-xs rounded-md p-3 border break-all", status.ok ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200")}>
            {status.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}{status.msg}
          </div>
        )}
      </Card>

      <div>
        <SectionHeader title="Members" tag={members.filter((m) => !m.disabled).length} />
        <Card>
          <table className="w-full">
            <thead><tr className="bg-gray-50 border-b border-gray-200">
              {["Member", "Connected inbox", "Sent (30d)", "Reply rate", "Positive", "Role", ""].map((h) => <th key={h} className="eyebrow text-left px-4 py-2.5">{h}</th>)}
            </tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className={cn("border-b border-gray-200 last:border-0", m.disabled && "opacity-50")}>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={cn("w-7 h-7 rounded-full text-[10px] font-semibold flex items-center justify-center", avatarStyle(m.email))}>{initials(m.name)}</span>
                      <div><p className="text-xs font-medium text-gray-900">{m.name}{m.id === meId && " (you)"}</p><p className="text-[11px] text-gray-400">{m.email}</p></div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-[11px]">
                    {m.mailboxes.length === 0 ? <span className="chip chip-warn">Not connected</span> : m.mailboxes.map((b) => (
                      <span key={b.email} className="flex items-center gap-1.5 text-gray-500">
                        <span className={cn("w-1.5 h-1.5 rounded-full", b.status === "active" ? "bg-green-500" : "bg-amber-500")} />{b.email}
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-2.5 text-xs tnum text-gray-700">{m.stats?.sent ?? 0}</td>
                  <td className="px-4 py-2.5 text-xs tnum text-gray-700">{pct(m.stats?.replied ?? 0, m.stats?.sent ?? 0)}%</td>
                  <td className="px-4 py-2.5 text-xs tnum text-green-700">{m.stats?.positive ?? 0}</td>
                  <td className="px-4 py-2.5">
                    <select value={m.role} onChange={(e) => update(m.id, { role: e.target.value })} className="border border-gray-200 rounded px-1.5 py-0.5 text-[11px]">
                      {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {m.id !== meId && !m.disabled && <button onClick={() => reset(m)} className="text-[11px] text-blue-500 hover:underline mr-3">Reset password</button>}
                    {m.id !== meId && <button onClick={() => update(m.id, { disabled: !m.disabled })} className="text-[11px] text-gray-500 hover:underline">{m.disabled ? "Enable" : "Disable"}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div>
        <SectionHeader title="Pending invites" tag={invites.length} />
        <Card>
          {invites.length === 0 ? <Empty>No pending invites.</Empty> : invites.map((i) => (
            <div key={i.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 last:border-0">
              <div className="flex-1"><p className="text-xs text-gray-700">{i.email}</p><p className="text-[11px] text-gray-400">{ROLE_LABEL[i.role]} · expires {new Date(i.expiresAt).toLocaleDateString()}</p></div>
              <button onClick={() => call(`/api/team/invites/${i.id}`, "DELETE").then(load)} className="text-[11px] text-red-500 hover:underline">Revoke</button>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
