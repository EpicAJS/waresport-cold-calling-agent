"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, CheckSquare, Square, Mic, Phone, Mail } from "lucide-react";
import { formatLocation, formatPhone } from "@/lib/utils";
import { VOICES } from "@/lib/voices";
import { DEFAULT_TEMPLATES } from "@/lib/templates";
import { STAGE_COLOR, STAGE_LABEL, TIMEZONES, inputCls } from "@/lib/labels";
import type { EmailTemplates } from "@/lib/db/schema";
import ScriptEditor, { DEFAULT_SCRIPT } from "@/components/script-editor";
import EmailTemplatesEditor from "@/components/email-templates-editor";
import SenderSettings from "@/components/sender-settings";

type Contact = { id: string; clubName: string; phone: string; email: string | null; city: string; state: string; stage: string; emailOptOut: boolean };
type PhoneNumber = { id: string; label: string; number: string };

const BLOCKED = ["do-not-call", "wrong-number"];

export default function NewCampaignPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [channel, setChannel] = useState<"call" | "email">("call");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [voice, setVoice] = useState(VOICES[0].id);
  const [maxPerDay, setMaxPerDay] = useState("30");
  const [maxRetries, setMaxRetries] = useState("2");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [timezone, setTimezone] = useState("America/Chicago");
  const [fromNumber, setFromNumber] = useState("");
  const [emailsEnabled, setEmailsEnabled] = useState(true);
  const [templates, setTemplates] = useState<EmailTemplates>(DEFAULT_TEMPLATES);
  const [mailboxId, setMailboxId] = useState<string | null>(null);
  const [aiPersonalize, setAiPersonalize] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [contactSearch, setContactSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);

  useEffect(() => {
    fetch("/api/contacts").then((r) => r.json()).then((d) => setAllContacts(Array.isArray(d) ? d : [])).catch(() => {});
    fetch("/api/settings/phone-numbers").then((r) => r.json()).then((d) => setPhoneNumbers(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  const eligible = allContacts.filter((c) =>
    !BLOCKED.includes(c.stage) && (channel === "email" ? Boolean(c.email) && !c.emailOptOut : Boolean(c.phone))
  );
  const visible = eligible.filter((c) =>
    `${c.clubName} ${c.city} ${c.state} ${c.email ?? ""}`.toLowerCase().includes(contactSearch.toLowerCase())
  );
  const selectedEligible = eligible.filter((c) => selected.has(c.id));

  const steps = channel === "call" ? ["Details", "Script & Voice", "Emails", "Contacts", "Review"] : ["Details", "Emails", "Contacts", "Review"];
  const current = steps[step - 1];

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleSave = async (launch: boolean) => {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, description, channel,
        script: channel === "call" ? script : "",
        voiceId: voice,
        maxPerDay: Number(maxPerDay),
        maxRetries: channel === "call" ? Number(maxRetries) : 0,
        windowStart: startTime,
        windowEnd: endTime,
        timezone,
        fromNumber: fromNumber || null,
        emailsEnabled: channel === "email" ? true : emailsEnabled,
        emailTemplates: templates,
        mailboxId,
        aiPersonalize,
        contactIds: selectedEligible.map((c) => c.id),
      }),
    });
    const campaign = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(campaign.error ?? "Couldn't save the campaign.");
      setSaving(false);
      return;
    }
    if (launch) {
      const l = await fetch(`/api/campaigns/${campaign.id}/launch`, { method: "POST" });
      if (!l.ok) {
        const d = await l.json().catch(() => ({}));
        router.push(`/campaigns/${campaign.id}?launchError=${encodeURIComponent(d.error ?? "Launch failed")}`);
        return;
      }
    }
    router.push(`/campaigns/${campaign.id}`);
  };

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/campaigns" className="text-gray-400 hover:text-gray-600"><ChevronLeft className="w-5 h-5" /></Link>
        <h1 className="text-2xl font-bold text-gray-900">New Campaign</h1>
      </div>

      <div className="flex items-center gap-2 mb-8 flex-wrap">
        {steps.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <button
              onClick={() => (i === 0 || name) && setStep(i + 1)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                step === i + 1 ? "bg-brand-600 text-white" : step > i + 1 ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-gray-500"
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                step === i + 1 ? "bg-white text-brand-600" : step > i + 1 ? "bg-brand-500 text-white" : "bg-gray-300 text-gray-600"
              }`}>{i + 1}</span>
              {label}
            </button>
            {i < steps.length - 1 && <div className="w-4 h-px bg-gray-200" />}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        {current === "Details" && (
          <div className="space-y-5">
            <h2 className="font-semibold text-gray-800">Campaign Details</h2>
            <div className="grid grid-cols-2 gap-3">
              {([
                { id: "call", icon: Phone, title: "AI calls + follow-up emails", desc: "The voice agent calls; emails go out based on the outcome." },
                { id: "email", icon: Mail, title: "Email only", desc: "A cold email sequence to contacts that have an email address." },
              ] as const).map((o) => (
                <button key={o.id} type="button" onClick={() => { setChannel(o.id); setSelected(new Set()); }}
                  className={`text-left p-4 border rounded-lg transition-colors ${channel === o.id ? "border-brand-500 bg-brand-50" : "border-gray-200 hover:bg-gray-50"}`}>
                  <o.icon className={`w-5 h-5 mb-2 ${channel === o.id ? "text-brand-600" : "text-gray-400"}`} />
                  <p className="text-sm font-medium text-gray-800">{o.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{o.desc}</p>
                </button>
              ))}
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Campaign Name *</label>
              <input className={inputCls} placeholder="e.g. Texas Soccer Clubs Q1" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Description</label>
              <textarea className={`${inputCls} h-20 resize-none`} placeholder="Who are you targeting and what are you offering? (Also used by the AI writer.)"
                value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">{channel === "call" ? "Calls" : "New contacts emailed"} per day</label>
                <input type="number" className={inputCls} value={maxPerDay} onChange={(e) => setMaxPerDay(e.target.value)} min={1} max={1000} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">{channel === "call" ? "Calling" : "Sending"} hours start</label>
                <input type="time" className={inputCls} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">End</label>
                <input type="time" className={inputCls} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Default timezone</label>
                <select className={inputCls} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                  {TIMEZONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">Hours apply in each contact&apos;s local timezone when their state is known. Weekdays only.</p>
              </div>
              {channel === "call" && (
                <div>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">Retries for no-answer / voicemail</label>
                  <select className={inputCls} value={maxRetries} onChange={(e) => setMaxRetries(e.target.value)}>
                    {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n === 0 ? "No retries" : `${n} (next business day)`}</option>)}
                  </select>
                </div>
              )}
            </div>
            {channel === "call" && (
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Outbound phone number <span className="text-gray-400 font-normal">(optional)</span></label>
                {phoneNumbers.length === 0 ? (
                  <p className="text-xs text-gray-400">No company phone numbers yet — an admin can add them in <Link href="/settings" className="text-brand-500 hover:underline">Settings</Link>. Bland.ai&apos;s default number will be used.</p>
                ) : (
                  <select className={inputCls} value={fromNumber} onChange={(e) => setFromNumber(e.target.value)}>
                    <option value="">Use Bland.ai default</option>
                    {phoneNumbers.map((p) => <option key={p.id} value={p.number}>{p.label} ({p.number})</option>)}
                  </select>
                )}
              </div>
            )}
          </div>
        )}

        {current === "Script & Voice" && (
          <div className="space-y-5">
            <h2 className="font-semibold text-gray-800">AI Script & Voice</h2>
            <ScriptEditor value={script} onChange={setScript} brief={description} />
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-3">Voice</label>
              <div className="grid grid-cols-2 gap-3">
                {VOICES.map((v) => (
                  <button key={v.id} onClick={() => setVoice(v.id)}
                    className={`flex items-center gap-3 p-3 border rounded-lg text-left transition-colors ${voice === v.id ? "border-brand-500 bg-brand-50" : "border-gray-200 hover:bg-gray-50"}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${voice === v.id ? "bg-brand-500" : "bg-gray-200"}`}>
                      <Mic className={`w-4 h-4 ${voice === v.id ? "text-white" : "text-gray-500"}`} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{v.label}</p>
                      <p className="text-xs text-gray-500">{v.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {current === "Emails" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Automated Emails</h2>
              {channel === "call" && (
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={emailsEnabled} onChange={(e) => setEmailsEnabled(e.target.checked)} className="rounded" />
                  Send follow-up emails
                </label>
              )}
            </div>
            {(channel === "email" || emailsEnabled) && (
              <SenderSettings mailboxId={mailboxId} onMailbox={setMailboxId} aiPersonalize={aiPersonalize} onAiPersonalize={setAiPersonalize} channel={channel} />
            )}
            {(channel === "email" || emailsEnabled) && (
              <EmailTemplatesEditor value={templates} onChange={setTemplates} channel={channel} brief={description} />
            )}
          </div>
        )}

        {current === "Contacts" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Select Contacts</h2>
              <button onClick={() => setSelected(selectedEligible.length === eligible.length ? new Set() : new Set(eligible.map((c) => c.id)))}
                className="text-sm text-brand-600 hover:underline">
                {selectedEligible.length === eligible.length && eligible.length > 0 ? "Deselect All" : "Select All"}
              </button>
            </div>
            <input className={inputCls} placeholder="Filter by name, city, state, email..." value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} />
            <p className="text-sm text-gray-500">
              {selectedEligible.length} of {eligible.length} eligible contacts selected
              {allContacts.length > eligible.length && (
                <span className="text-gray-400"> · {allContacts.length - eligible.length} hidden ({channel === "email" ? "no email, unsubscribed," : "no phone,"} or do-not-call)</span>
              )}
            </p>
            {eligible.length === 0 ? (
              <div className="text-center py-10 text-gray-400 border border-dashed border-gray-200 rounded-lg">
                <p className="text-sm">No eligible contacts yet.</p>
                <p className="text-xs mt-1"><Link href="/contacts" className="text-brand-500 hover:underline">Add contacts</Link> first.</p>
              </div>
            ) : (
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                {visible.map((c) => (
                  <div key={c.id} onClick={() => toggle(c.id)} className="flex items-center gap-3 p-3 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50">
                    {selected.has(c.id) ? <CheckSquare className="w-4 h-4 text-brand-500 shrink-0" /> : <Square className="w-4 h-4 text-gray-300 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{c.clubName}</p>
                      <p className="text-xs text-gray-500">
                        {channel === "email" ? c.email : formatPhone(c.phone)} · {formatLocation(c.city, c.state)}
                      </p>
                    </div>
                    {c.stage !== "new" && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STAGE_COLOR[c.stage] ?? ""}`}>{STAGE_LABEL[c.stage] ?? c.stage}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {current === "Review" && (
          <div className="space-y-4">
            <h2 className="font-semibold text-gray-800">Review Campaign</h2>
            <div className="space-y-3">
              {[
                ["Name", name || "—"],
                ["Type", channel === "call" ? "AI calls + follow-up emails" : "Email only"],
                ["Contacts", `${selectedEligible.length} selected`],
                [channel === "call" ? "Calls per day" : "New contacts emailed per day", maxPerDay],
                ["Hours", `${startTime}–${endTime} weekdays (${TIMEZONES.find((t) => t.value === timezone)?.label})`],
                ...(channel === "call"
                  ? [
                      ["Retries", maxRetries === "0" ? "None" : `${maxRetries}, next business day`],
                      ["Voice", VOICES.find((v) => v.id === voice)?.label ?? ""],
                      ["Outbound number", fromNumber || "Bland.ai default"],
                      ["Follow-up emails", emailsEnabled ? "On" : "Off"],
                    ]
                  : [["Emails in sequence", String(templates.cold.length)]]),
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between text-sm">
                  <span className="text-gray-500">{k}</span>
                  <span className="font-medium text-gray-800">{v}</span>
                </div>
              ))}
            </div>
            {channel === "call" && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 font-medium mb-1">Script preview</p>
                <p className="text-sm text-gray-700 whitespace-pre-line line-clamp-4">{script}</p>
              </div>
            )}
            {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
          </div>
        )}
      </div>

      <div className="flex justify-between mt-5">
        <button onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}
          className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-40">
          Back
        </button>
        <div className="flex gap-2">
          {step < steps.length ? (
            <button onClick={() => setStep((s) => s + 1)} disabled={step === 1 && !name.trim()}
              className="px-5 py-2 bg-brand-600 text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50">
              Continue
            </button>
          ) : (
            <>
              <button onClick={() => handleSave(false)} disabled={saving}
                className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50">
                Save as Draft
              </button>
              <button onClick={() => handleSave(true)} disabled={saving || selectedEligible.length === 0}
                className="px-5 py-2 bg-green-600 text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50">
                {saving ? "Saving..." : "Launch Campaign"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
