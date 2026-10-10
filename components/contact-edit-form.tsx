"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { STAGE_LABEL, inputCls } from "@/lib/labels";

export type EditableContact = {
  id: string;
  clubName: string;
  contactName?: string | null;
  phone: string;
  altPhone?: string | null;
  email?: string | null;
  city: string;
  state: string;
  notes?: string;
  stage?: string;
  emailOptOut?: boolean;
};

export default function ContactEditForm({ contact, onSaved, onCancel }: {
  contact: EditableContact;
  onSaved: (updated: EditableContact) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    clubName: contact.clubName,
    contactName: contact.contactName ?? "",
    phone: contact.phone,
    altPhone: contact.altPhone ?? "",
    email: contact.email ?? "",
    city: contact.city,
    state: contact.state,
    notes: contact.notes ?? "",
    stage: contact.stage ?? "new",
    emailOptOut: Boolean(contact.emailOptOut),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Couldn't save the contact.");
    onSaved(data);
  };

  const field = (k: keyof typeof form, label: string, placeholder = "") => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input className={inputCls} placeholder={placeholder} value={form[k] as string} onChange={(e) => set(k, e.target.value)} />
    </div>
  );

  return (
    <div className="bg-white rounded-xl border border-blue-200 p-5 space-y-4">
      <h2 className="font-semibold text-gray-800">Edit {contact.clubName}</h2>
      <div className="grid grid-cols-2 gap-3">
        {field("clubName", "Club / company name *")}
        {field("contactName", "Contact person")}
        {field("phone", "Phone (used for calls)")}
        {field("altPhone", "Alternate phone")}
        {field("email", "Email")}
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          {field("city", "City")}
          {field("state", "State", "TX")}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Stage</label>
          <select className={inputCls} value={form.stage} onChange={(e) => set("stage", e.target.value)}>
            {Object.entries(STAGE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 mt-5">
          <input type="checkbox" className="rounded" checked={form.emailOptOut} onChange={(e) => set("emailOptOut", e.target.checked)} />
          Unsubscribed from emails
        </label>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
          <textarea className={`${inputCls} h-20 resize-none`} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-gray-400">
        Changing the state also changes which timezone&apos;s calling hours apply. Setting the stage to Do Not Call, Not Interested, or Wrong Number keeps them out of future calls.
      </p>
      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={busy || !form.clubName.trim() || (!form.phone.trim() && !form.email.trim())}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}Save changes
        </button>
        <button onClick={onCancel} className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
      </div>
    </div>
  );
}
