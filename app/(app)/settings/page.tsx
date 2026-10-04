"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Phone, Plus, Trash2, Settings, Mail, CheckCircle, AlertCircle, Send, User, CalendarDays, Users, Building2, Copy, KeyRound,
} from "lucide-react";
import { formatPhone } from "@/lib/utils";
import { inputCls } from "@/lib/labels";

type Me = {
  id: string; name: string; email: string; role: string; bookingProvider: "link" | "calcom" | "calendly";
  bookingUrl: string; calendlyConnected: boolean; calcomWebhookUrl: string; calcomSecret: string;
};
type Org = {
  companyName: string; fromEmail: string; mailingAddress: string; resendKeySet: boolean; resendKeySource: string;
  integrations: Record<string, boolean>; appUrl: string; isAdmin: boolean;
};
type Member = { id: string; name: string; email: string; role: string; disabled: boolean };
type Invite = { id: string; email: string; role: string; expiresAt: string };
type PhoneNumber = { id: string; label: string; number: string };
type Status = { ok: boolean; msg: string } | null;

function StatusLine({ s }: { s: Status }) {
  if (!s) return null;
  return (
    <div className={`flex items-center gap-2 text-sm rounded-lg p-3 ${s.ok ? "bg-green-50 text-green-700 border border-green-100" : "bg-red-50 text-red-700 border border-red-100"}`}>
      {s.ok ? <CheckCircle className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
      <span className="break-all">{s.msg}</span>
    </div>
  );
}

function Card({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Icon className="w-4 h-4 text-blue-500" />{title}</h2>
      {children}
    </div>
  );
}

function Copyable({ value }: { value: string }) {
  return (
    <div className="flex gap-2">
      <input readOnly className={`${inputCls} font-mono text-xs bg-gray-50`} value={value} />
      <button type="button" onClick={() => navigator.clipboard.writeText(value)} className="px-3 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50" title="Copy">
        <Copy className="w-4 h-4" />
      </button>
    </div>
  );
}

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export default function SettingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [org, setOrg] = useState<Org | null>(null);
  const [team, setTeam] = useState<{ members: Member[]; invites: Invite[] }>({ members: [], invites: [] });
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);

  const [profile, setProfile] = useState({ name: "", currentPassword: "", newPassword: "" });
  const [profileStatus, setProfileStatus] = useState<Status>(null);

  const [booking, setBooking] = useState<{ provider: Me["bookingProvider"]; url: string; token: string }>({ provider: "link", url: "", token: "" });
  const [bookingStatus, setBookingStatus] = useState<Status>(null);

  const [company, setCompany] = useState({ companyName: "", fromEmail: "", mailingAddress: "", resendApiKey: "" });
  const [companyStatus, setCompanyStatus] = useState<Status>(null);
  const [testTo, setTestTo] = useState("");

  const [invite, setInvite] = useState({ email: "", role: "rep" });
  const [inviteStatus, setInviteStatus] = useState<Status>(null);

  const [pn, setPn] = useState({ label: "", number: "" });
  const [pnStatus, setPnStatus] = useState<Status>(null);

  const load = useCallback(async () => {
    const [meRes, orgRes, pnRes] = await Promise.all([fetch("/api/me"), fetch("/api/settings/org"), fetch("/api/settings/phone-numbers")]);
    const m: Me = await meRes.json();
    const o: Org = await orgRes.json();
    setMe(m);
    setOrg(o);
    setPhoneNumbers(await pnRes.json().catch(() => []));
    setProfile((p) => ({ ...p, name: m.name }));
    setBooking((b) => ({ ...b, provider: m.bookingProvider, url: m.bookingUrl }));
    setCompany((c) => ({ ...c, companyName: o.companyName, fromEmail: o.fromEmail, mailingAddress: o.mailingAddress }));
    if (m.role === "admin") {
      const t = await fetch("/api/team");
      if (t.ok) setTeam(await t.json());
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!me || !org) return <div className="p-6 text-gray-400 text-sm">Loading...</div>;
  const isAdmin = me.role === "admin";

  const saveProfile = async () => {
    const body: Record<string, string> = { name: profile.name };
    if (profile.newPassword) Object.assign(body, { currentPassword: profile.currentPassword, newPassword: profile.newPassword });
    const r = await send("/api/me", "PATCH", body);
    setProfileStatus(r.ok ? { ok: true, msg: "Profile saved." } : { ok: false, msg: r.data.error ?? "Save failed." });
    if (r.ok) setProfile((p) => ({ ...p, currentPassword: "", newPassword: "" }));
  };

  const saveBooking = async (provider = booking.provider) => {
    const r = await send("/api/me", "PATCH", { bookingProvider: provider, bookingUrl: booking.url });
    setBookingStatus(r.ok ? { ok: true, msg: "Booking settings saved." } : { ok: false, msg: r.data.error ?? "Save failed." });
    load();
  };

  const connectCalendly = async () => {
    const r = await send("/api/me/calendly", "POST", { token: booking.token });
    setBookingStatus(r.ok ? { ok: true, msg: "Calendly connected — new bookings will appear under Demos automatically." } : { ok: false, msg: r.data.error ?? "Connection failed." });
    setBooking((b) => ({ ...b, token: "" }));
    load();
  };

  const saveCompany = async () => {
    const r = await send("/api/settings/org", "PUT", company);
    setCompanyStatus(r.ok ? { ok: true, msg: "Company settings saved." } : { ok: false, msg: r.data.error ?? "Save failed." });
    setCompany((c) => ({ ...c, resendApiKey: "" }));
    load();
  };

  const testEmail = async () => {
    const r = await send("/api/settings/org/test", "POST", { to: testTo || me.email });
    setCompanyStatus(r.ok ? { ok: true, msg: `Test email sent to ${testTo || me.email}.` } : { ok: false, msg: r.data.error ?? "Test failed." });
  };

  const sendInvite = async () => {
    const r = await send("/api/team", "POST", invite);
    setInviteStatus(r.ok
      ? { ok: true, msg: r.data.emailed ? `Invite emailed to ${invite.email}. Link: ${r.data.link}` : `Email isn't configured, so share this link with them: ${r.data.link}` }
      : { ok: false, msg: r.data.error ?? "Invite failed." });
    if (r.ok) setInvite({ email: "", role: "rep" });
    load();
  };

  const updateMember = async (id: string, patch: Partial<Member>) => {
    const r = await send(`/api/team/${id}`, "PATCH", patch);
    if (!r.ok) setInviteStatus({ ok: false, msg: r.data.error ?? "Update failed." });
    load();
  };

  const resetPassword = async (m: Member) => {
    const r = await send(`/api/team/${m.id}/reset`, "POST");
    setInviteStatus(r.ok
      ? { ok: true, msg: `${r.data.emailed ? `Reset link emailed to ${m.email}.` : "Email isn't configured, so send them this link yourself."} Link (valid 24 hours): ${r.data.link}` }
      : { ok: false, msg: r.data.error ?? "Couldn't create a reset link." });
  };

  const addNumber = async () => {
    const r = await send("/api/settings/phone-numbers", "POST", pn);
    setPnStatus(r.ok ? null : { ok: false, msg: r.data.error ?? "Couldn't add number." });
    if (r.ok) setPn({ label: "", number: "" });
    load();
  };

  const integrationRows: Array<[string, boolean, string]> = [
    ["Bland.ai (calls)", org.integrations.bland, "BLAND_AI_API_KEY"],
    ["SerpAPI (club search)", org.integrations.serpapi, "SERP_API_KEY"],
    ["OpenAI (AI writer)", org.integrations.openai, "OPENAI_API_KEY"],
    ["Email (Resend)", org.integrations.email, "Company settings below"],
    ["Scheduled jobs", org.integrations.cron, "CRON_SECRET"],
    ["Public URL for webhooks", org.integrations.publicUrl, `APP_URL (now ${org.appUrl})`],
  ];

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-gray-400" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-500 text-sm mt-0.5">{isAdmin ? "Your profile, team, and company configuration" : "Your profile and booking link"}</p>
        </div>
      </div>

      <Card icon={User} title="My profile">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
            <input className={inputCls} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input className={`${inputCls} bg-gray-50`} value={me.email} readOnly />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Current password</label>
            <input type="password" autoComplete="current-password" className={inputCls} value={profile.currentPassword} onChange={(e) => setProfile({ ...profile, currentPassword: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">New password</label>
            <input type="password" autoComplete="new-password" className={inputCls} value={profile.newPassword} onChange={(e) => setProfile({ ...profile, newPassword: e.target.value })} />
          </div>
        </div>
        <p className="text-xs text-gray-400">Your name appears in the &quot;from&quot; line of your emails, and replies go to {me.email}.</p>
        <button onClick={saveProfile} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium">Save profile</button>
        <StatusLine s={profileStatus} />
      </Card>

      <Card icon={CalendarDays} title="My demo booking link">
        <p className="text-sm text-gray-500">When a prospect agrees to a demo, they get an email with this link. Reminders and post-demo follow-ups are timed from the real booking when Cal.com or Calendly is connected.</p>
        <div className="grid grid-cols-3 gap-2">
          {([["link", "Just a link"], ["calcom", "Cal.com"], ["calendly", "Calendly"]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setBooking({ ...booking, provider: k })}
              className={`px-3 py-2 text-sm rounded-lg border ${booking.provider === k ? "border-blue-500 bg-blue-50 text-blue-700 font-medium" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
              {label}
            </button>
          ))}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Booking page URL</label>
          <input className={inputCls} placeholder={booking.provider === "calcom" ? "https://cal.com/your-name/demo" : "https://calendly.com/your-name/15min"}
            value={booking.url} onChange={(e) => setBooking({ ...booking, url: e.target.value })} />
        </div>
        {booking.provider === "link" && (
          <p className="text-xs text-gray-400">Bookings aren&apos;t tracked automatically. Log demos by hand on the Demos page so reminders still go out.</p>
        )}
        {booking.provider === "calcom" && me.bookingProvider === "calcom" && (
          <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
            <p className="font-medium text-gray-700">Connect Cal.com (free)</p>
            <ol className="list-decimal list-inside text-xs text-gray-600 space-y-1">
              <li>In Cal.com go to <strong>Settings → Developer → Webhooks → New</strong>.</li>
              <li>Subscriber URL:</li>
            </ol>
            <Copyable value={me.calcomWebhookUrl} />
            <ol start={3} className="list-decimal list-inside text-xs text-gray-600 space-y-1">
              <li>Secret:</li>
            </ol>
            <Copyable value={me.calcomSecret} />
            <ol start={4} className="list-decimal list-inside text-xs text-gray-600 space-y-1">
              <li>Enable <strong>Booking Created, Rescheduled, Cancelled</strong>, then save.</li>
            </ol>
            <button onClick={() => send("/api/me", "PATCH", { regenerateCalcomSecret: true }).then(load)} className="text-xs text-gray-500 hover:underline">Regenerate secret</button>
          </div>
        )}
        {booking.provider === "calendly" && (
          <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
            {me.calendlyConnected ? (
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-green-700"><CheckCircle className="w-4 h-4" />Calendly connected</span>
                <button onClick={() => send("/api/me/calendly", "DELETE").then(load)} className="text-xs text-red-500 hover:underline">Disconnect</button>
              </div>
            ) : (
              <>
                <p className="font-medium text-gray-700">Connect Calendly (paid plan required for webhooks)</p>
                <p className="text-xs text-gray-600">In Calendly open <strong>Integrations → API & Webhooks</strong>, create a personal access token, and paste it here.</p>
                <div className="flex gap-2">
                  <input type="password" className={inputCls} placeholder="Personal access token" value={booking.token} onChange={(e) => setBooking({ ...booking, token: e.target.value })} />
                  <button onClick={connectCalendly} disabled={!booking.token} className="flex items-center gap-1.5 px-3 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-900 disabled:opacity-50">
                    <KeyRound className="w-4 h-4" />Connect
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        <button onClick={() => saveBooking()} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium">Save booking settings</button>
        {booking.provider === "calcom" && me.bookingProvider !== "calcom" && <p className="text-xs text-gray-400">Save to see your Cal.com webhook details.</p>}
        <StatusLine s={bookingStatus} />
      </Card>

      {isAdmin && (
        <Card icon={Users} title="Team">
          <div className="space-y-2">
            {team.members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${m.disabled ? "text-gray-400 line-through" : "text-gray-800"}`}>{m.name}{m.id === me.id && " (you)"}</p>
                  <p className="text-xs text-gray-500">{m.email}</p>
                </div>
                <select className="border border-gray-200 rounded-lg px-2 py-1 text-xs" value={m.role} onChange={(e) => updateMember(m.id, { role: e.target.value })}>
                  <option value="rep">Sales rep</option>
                  <option value="admin">Admin</option>
                </select>
                {m.id !== me.id && !m.disabled && (
                  <button onClick={() => resetPassword(m)} className="text-xs text-blue-600 hover:underline">Reset password</button>
                )}
                {m.id !== me.id && (
                  <button onClick={() => updateMember(m.id, { disabled: !m.disabled })} className="text-xs text-gray-500 hover:underline w-14 text-right">
                    {m.disabled ? "Enable" : "Disable"}
                  </button>
                )}
              </div>
            ))}
            {team.invites.map((i) => (
              <div key={i.id} className="flex items-center gap-3 p-3 border border-dashed border-gray-200 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-600">{i.email}</p>
                  <p className="text-xs text-gray-400">Invited as {i.role} · expires {new Date(i.expiresAt).toLocaleDateString()}</p>
                </div>
                <button onClick={() => send(`/api/team/invites/${i.id}`, "DELETE").then(load)} className="text-xs text-red-500 hover:underline">Revoke</button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input className={inputCls} type="email" placeholder="rep@yourcompany.com" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
            <select className="border border-gray-200 rounded-lg px-2 text-sm" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })}>
              <option value="rep">Sales rep</option>
              <option value="admin">Admin</option>
            </select>
            <button onClick={sendInvite} disabled={!invite.email} className="flex items-center gap-1.5 px-4 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
              <Plus className="w-4 h-4" />Invite
            </button>
          </div>
          <p className="text-xs text-gray-400">Reps see only their own contacts, campaigns, calls, and emails. Admins see everyone&apos;s.</p>
          <StatusLine s={inviteStatus} />
        </Card>
      )}

      {isAdmin && (
        <Card icon={Building2} title="Company & email sending">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Company name</label>
              <input className={inputCls} value={company.companyName} onChange={(e) => setCompany({ ...company, companyName: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">From address (verified in Resend)</label>
              <input className={inputCls} type="email" placeholder="team@yourcompany.com" value={company.fromEmail} onChange={(e) => setCompany({ ...company, fromEmail: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Mailing address (required in cold email footers by CAN-SPAM)</label>
              <input className={inputCls} placeholder="123 Main St, Austin, TX 78701" value={company.mailingAddress} onChange={(e) => setCompany({ ...company, mailingAddress: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Resend API key {org.resendKeySet && <span className="text-green-600 font-normal">· set ({org.resendKeySource === "env" ? "from RESEND_API_KEY" : "saved here"})</span>}
              </label>
              <input type="password" className={`${inputCls} font-mono`} placeholder={org.resendKeySet ? "Leave blank to keep the current key" : "re_xxxxxxxxxxxxxxxx"}
                value={company.resendApiKey} onChange={(e) => setCompany({ ...company, resendApiKey: e.target.value })} />
            </div>
          </div>
          <button onClick={saveCompany} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium">Save company settings</button>
          <div className="border-t border-gray-100 pt-4 flex gap-2">
            <input type="email" className={inputCls} placeholder={me.email} value={testTo} onChange={(e) => setTestTo(e.target.value)} />
            <button onClick={testEmail} className="flex items-center gap-2 px-4 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-900 font-medium whitespace-nowrap">
              <Send className="w-3.5 h-3.5" />Send test
            </button>
          </div>
          <StatusLine s={companyStatus} />
        </Card>
      )}

      <Card icon={Phone} title="Company phone numbers">
        <p className="text-sm text-gray-500">Outbound caller IDs registered with Bland.ai. Reps pick one per campaign.</p>
        {isAdmin && (
          <div className="flex gap-3">
            <input className={inputCls} placeholder="Label (e.g. Sales Line)" value={pn.label} onChange={(e) => setPn({ ...pn, label: e.target.value })} />
            <input className={`${inputCls} w-48`} placeholder="Phone number" value={pn.number} onChange={(e) => setPn({ ...pn, number: e.target.value })} />
            <button onClick={addNumber} disabled={!pn.label || !pn.number} className="flex items-center gap-2 px-4 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
              <Plus className="w-4 h-4" />Add
            </button>
          </div>
        )}
        <StatusLine s={pnStatus} />
        {phoneNumbers.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6 border border-dashed border-gray-200 rounded-lg">No phone numbers yet — Bland.ai&apos;s default number is used.</p>
        ) : (
          <div className="space-y-2">
            {phoneNumbers.map((p) => (
              <div key={p.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                <Phone className="w-4 h-4 text-blue-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">{p.label}</p>
                  <p className="text-xs text-gray-500 font-mono">{formatPhone(p.number.replace(/^\+1/, ""))}</p>
                </div>
                {isAdmin && (
                  <button onClick={() => send(`/api/settings/phone-numbers/${p.id}`, "DELETE").then(load)} className="p-1.5 text-gray-400 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {isAdmin && (
        <Card icon={Mail} title="Integration status">
          <div className="space-y-1.5">
            {integrationRows.map(([label, ok, hint]) => (
              <div key={label} className="flex items-center gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full ${ok ? "bg-green-500" : "bg-gray-300"}`} />
                <span className="text-gray-700">{label}</span>
                <span className="text-xs text-gray-400 ml-auto">{ok ? "configured" : `set ${hint}`}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
