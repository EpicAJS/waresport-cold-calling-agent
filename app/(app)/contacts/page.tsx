"use client";

import { useState, useEffect } from "react";
import { formatLocation, formatPhone } from "@/lib/utils";
import { STAGE_COLOR, STAGE_LABEL } from "@/lib/labels";
import ContactEditForm from "@/components/contact-edit-form";
import { Search, Upload, MapPin, CheckCircle, XCircle, Loader2, Globe, BookUser, Plus, Trash2, Pencil, ExternalLink, Mail, Star, Info } from "lucide-react";

type Contact = {
  id: string;
  clubName: string;
  contactName?: string | null;
  phone: string;
  altPhone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
  city: string;
  state: string;
  source: string;
  verified: boolean;
  notes?: string;
  rating?: number | null;
  reviews?: number | null;
  stage?: string;
  emailOptOut?: boolean;
  ownerName?: string;
};

type NewContact = Omit<Contact, "id">;

type SearchMeta = {
  total: number;
  new_count: number;
  existing_count: number;
  osm_count?: number;
  serp_count?: number;
  foursquare_count?: number;
  serp_exhausted?: boolean;
};

const sourceColors: Record<string, string> = {
  google_places: "bg-blue-100 text-blue-700",
  openstreetmap: "bg-green-100 text-green-700",
  foursquare: "bg-orange-100 text-orange-600",
  import: "bg-purple-100 text-purple-700",
  manual: "bg-gray-100 text-gray-600",
  booking: "bg-green-100 text-green-700",
};

const sourceLabel: Record<string, string> = {
  google_places: "Google Maps",
  openstreetmap: "OpenStreetMap",
  foursquare: "Foursquare",
  import: "Imported",
  manual: "Manual",
  booking: "Booking",
};

export default function ContactsPage() {
  const [activeTab, setActiveTab] = useState<"find" | "book">("find");

  // Find Contacts tab state
  const [findQuery, setFindQuery] = useState("");
  const [findCity, setFindCity] = useState("");
  const [finding, setFinding] = useState(false);
  const [findResults, setFindResults] = useState<Contact[]>([]);
  const [findMeta, setFindMeta] = useState<SearchMeta | null>(null);
  const [findError, setFindError] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [addingToBook, setAddingToBook] = useState(false);

  // Manual add state
  const [showManual, setShowManual] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualCity, setManualCity] = useState("");
  const [manualState, setManualState] = useState("");
  const [manualEmail, setManualEmail] = useState("");

  // Contact Book tab state
  const [savedContacts, setSavedContacts] = useState<Contact[]>([]);
  const [bookSearch, setBookSearch] = useState("");
  const [selectedBook, setSelectedBook] = useState<Set<string>>(new Set());
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string }>>([]);
  const [targetCampaign, setTargetCampaign] = useState("");
  const [addingToCampaign, setAddingToCampaign] = useState(false);
  const [showCampaignPicker, setShowCampaignPicker] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const loadSavedContacts = async () => {
    const res = await fetch("/api/contacts");
    const data = await res.json();
    setSavedContacts(Array.isArray(data) ? data : []);
  };

  const loadCampaigns = async () => {
    const res = await fetch("/api/campaigns");
    const data = await res.json();
    setCampaigns(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    loadSavedContacts();
    if (activeTab === "book") loadCampaigns();
  }, [activeTab]);

  const handleFind = async () => {
    if (!findQuery || !findCity) return;
    setFinding(true);
    setFindResults([]);
    setFindMeta(null);
    setFindError(null);
    try {
      const res = await fetch(
        `/api/contacts/find?query=${encodeURIComponent(findQuery)}&city=${encodeURIComponent(findCity)}`
      );
      const data = await res.json();
      if (!res.ok) {
        setFindError(data.error ?? "Search failed. Try a different city or club type.");
      } else if (data.all_saved) {
        setFindError(data.suggestion ?? `All clubs found in ${findCity} are already in your contacts.`);
      } else if (data.results.length === 0) {
        setFindError(`Found clubs in ${findCity} but none had phone numbers listed. Try a more specific city or import manually.`);
      } else {
        setFindResults(data.results);
        setFindMeta({ total: data.total, new_count: data.new_count, existing_count: data.existing_count, osm_count: data.osm_count, serp_count: data.serp_count, foursquare_count: data.foursquare_count, serp_exhausted: data.serp_exhausted });
      }
    } catch {
      setFindError("Network error — check your connection and try again.");
    } finally {
      setFinding(false);
    }
  };

  const persistContacts = async (contacts: NewContact[]) => {
    setAddingToBook(true);
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(contacts),
    });
    const data = await res.json().catch(() => ({}));
    setAddingToBook(false);
    setNotice(res.ok ? { ok: true, text: `Saved ${data.count} contact${data.count === 1 ? "" : "s"} to your contact book.` } : { ok: false, text: data.error ?? "Couldn't save contacts." });
    setTimeout(() => setNotice(null), 4000);
    loadSavedContacts();
    return res.ok;
  };

  const addFindResultsToBook = async () => {
    await persistContacts(findResults.map(({ id: _id, ...rest }) => rest));
    setFindResults([]);
    setFindMeta(null);
    setFindError(null);
  };

  const handleImport = async () => {
    const lines = importText.trim().split("\n").filter(Boolean);
    const newContacts: NewContact[] = lines
      .map((line) => {
        const parts = line.split(",").map((p) => p.trim());
        if (parts.length < 2 || !parts[0]) return null;
        return {
          clubName: parts[0],
          phone: parts[1].replace(/\D/g, ""),
          email: parts[2] || null,
          website: parts[3] || null,
          city: parts[4] || "",
          state: parts[5] || "",
          source: "import",
          verified: false,
          notes: "",
        };
      })
      .filter(Boolean) as NewContact[];

    await persistContacts(newContacts);
    setImportText("");
    setShowImport(false);
  };

  const handleManualAdd = async () => {
    if (!manualName || (!manualPhone && !manualEmail)) return;
    const contact: NewContact = {
      clubName: manualName,
      phone: manualPhone.replace(/\D/g, ""),
      email: manualEmail || null,
      city: manualCity,
      state: manualState,
      source: "manual",
      verified: false,
      notes: "",
    };
    if (!(await persistContacts([contact]))) return;
    setManualName("");
    setManualPhone("");
    setManualCity("");
    setManualState("");
    setManualEmail("");
    setShowManual(false);
  };

  const handleDeleteContact = async (id: string) => {
    setDeletingId(id);
    await fetch(`/api/contacts/${id}`, { method: "DELETE" });
    setSavedContacts((prev) => prev.filter((c) => c.id !== id));
    setDeletingId(null);
  };

  const handleAddToCampaign = async () => {
    if (!targetCampaign) return;
    setAddingToCampaign(true);
    const res = await fetch(`/api/campaigns/${targetCampaign}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: Array.from(selectedBook) }),
    });
    const data = await res.json().catch(() => ({}));
    setNotice(res.ok ? { ok: true, text: `Added ${data.added ?? 0} contact(s) to the campaign.` } : { ok: false, text: data.error ?? "Couldn't add contacts." });
    setAddingToCampaign(false);
    setShowCampaignPicker(false);
    setSelectedBook(new Set());
    setTargetCampaign("");
  };

  const toggleBookSelect = (id: string) => {
    const next = new Set(selectedBook);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedBook(next);
  };

  const filteredBook = savedContacts.filter(
    (c) =>
      c.clubName.toLowerCase().includes(bookSearch.toLowerCase()) ||
      c.city.toLowerCase().includes(bookSearch.toLowerCase()) ||
      (c.email ?? "").toLowerCase().includes(bookSearch.toLowerCase()) ||
      c.phone.includes(bookSearch)
  );

  const manualForm = showManual ? (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="font-semibold text-gray-800 mb-3">Add Contact Manually</h2>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <input
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Club / Company Name *"
          value={manualName}
          onChange={(e) => setManualName(e.target.value)}
        />
        <input
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Phone Number"
          value={manualPhone}
          onChange={(e) => setManualPhone(e.target.value)}
        />
        <input
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          placeholder="Email"
          value={manualEmail}
          onChange={(e) => setManualEmail(e.target.value)}
        />
        <div className="flex gap-2">
          <input
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="City"
            value={manualCity}
            onChange={(e) => setManualCity(e.target.value)}
          />
          <input
            className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="State"
            value={manualState}
            onChange={(e) => setManualState(e.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleManualAdd}
          disabled={!manualName || (!manualPhone && !manualEmail)}
          className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          Save to Contact Book
        </button>
        <button
          onClick={() => setShowManual(false)}
          className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-gray-500 text-sm mt-1">Find clubs and manage your contact book</p>
        </div>
        <button
          onClick={() => { setShowManual(true); setShowImport(false); }}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          <Plus className="w-4 h-4" />
          Add Contact
        </button>
      </div>

      {notice && (
        <div className={`text-sm rounded-lg px-4 py-2 border ${notice.ok ? "bg-green-50 border-green-100 text-green-700" : "bg-red-50 border-red-100 text-red-700"}`}>
          {notice.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("find")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "find"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Globe className="w-4 h-4" />
          Find Contacts
        </button>
        <button
          onClick={() => setActiveTab("book")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "book"
              ? "border-brand-600 text-brand-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <BookUser className="w-4 h-4" />
          Contact Book
          {savedContacts.length > 0 && (
            <span className="bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">{savedContacts.length}</span>
          )}
        </button>
      </div>

      {/* ── FIND CONTACTS TAB ── */}
      {activeTab === "find" && (
        <div className="space-y-4">
          {manualForm}

          {/* Search panel */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-4 h-4 text-brand-500" />
              <h2 className="font-semibold text-gray-800">Find Clubs</h2>
              <span className="text-xs text-gray-400 ml-1">— searches Google Maps + OpenStreetMap for comprehensive results</span>
            </div>
            <div className="flex gap-3 mb-4">
              <input
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="Club type (e.g. soccer clubs, basketball academies)"
                value={findQuery}
                onChange={(e) => setFindQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleFind()}
              />
              <input
                className="w-44 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder="City or State (e.g. Florida)"
                value={findCity}
                onChange={(e) => setFindCity(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleFind()}
              />
              <button
                onClick={handleFind}
                disabled={finding || !findQuery || !findCity}
                className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {finding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {finding ? "Searching..." : "Search"}
              </button>
            </div>

            {/* Results meta banner */}
            {findMeta && (
              <div className={`mb-4 flex items-start gap-2 p-3 rounded-lg text-sm border ${findMeta.serp_exhausted ? "bg-yellow-50 border-yellow-200 text-yellow-800" : "bg-brand-50 border-brand-100 text-brand-700"}`}>
                <Info className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  {findMeta.serp_exhausted && <><strong>Google Maps quota reached</strong> — using Foursquare + OpenStreetMap as backup. </>}
                  Found <strong>{findMeta.total}</strong> clubs total
                  {" ("}
                  {(findMeta.serp_count ?? 0) > 0 && `${findMeta.serp_count} Google Maps`}
                  {(findMeta.foursquare_count ?? 0) > 0 && `${(findMeta.serp_count ?? 0) > 0 ? ", " : ""}${findMeta.foursquare_count} Foursquare`}
                  {(findMeta.osm_count ?? 0) > 0 && `${((findMeta.serp_count ?? 0) + (findMeta.foursquare_count ?? 0)) > 0 ? ", " : ""}${findMeta.osm_count} OpenStreetMap`}
                  {")."}
                  {findMeta.existing_count > 0 && <> {findMeta.existing_count} already in contacts hidden.</>}
                  {" "}Showing <strong>{findMeta.new_count}</strong> new clubs.
                </span>
              </div>
            )}

            {findError && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                {findError}
              </div>
            )}

            {findResults.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-2">{findResults.length} new clubs found</p>
                <div className="space-y-2 mb-3">
                  {findResults.map((r) => (
                    <div key={r.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-gray-800">{r.clubName}</p>
                          {r.rating != null && (
                            <span className="flex items-center gap-0.5 text-xs text-amber-500">
                              <Star className="w-3 h-3 fill-amber-400 stroke-amber-400" />
                              {r.rating}
                              {r.reviews != null && <span className="text-gray-400 ml-0.5">({r.reviews})</span>}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                          <span className="text-xs text-gray-500">{formatPhone(r.phone)}</span>
                          {r.address && (
                            <span className="flex items-center gap-1 text-xs text-gray-400">
                              <MapPin className="w-3 h-3" />{r.address}
                            </span>
                          )}
                          {r.email && (
                            <a
                              href={`mailto:${r.email}`}
                              className="flex items-center gap-1 text-xs text-brand-500 hover:underline"
                            >
                              <Mail className="w-3 h-3" />{r.email}
                            </a>
                          )}
                          {r.website && (
                            <a
                              href={r.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs text-brand-500 hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              {(() => { try { return new URL(r.website).hostname.replace(/^www\./, ""); } catch { return r.website; } })()}
                            </a>
                          )}
                        </div>
                      </div>
                      {r.verified
                        ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                        : <XCircle className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={addFindResultsToBook}
                    disabled={addingToBook}
                    className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
                  >
                    {addingToBook ? "Saving..." : `Save ${findResults.length} contacts to Contact Book`}
                  </button>
                  <button
                    onClick={() => { setFindResults([]); setFindMeta(null); }}
                    className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50"
                  >
                    Discard
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* CSV Import */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold text-gray-800">Import from CSV</h2>
              <button
                onClick={() => setShowImport(!showImport)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                <Upload className="w-4 h-4" />
                {showImport ? "Hide" : "Import CSV"}
              </button>
            </div>
            {showImport && (
              <>
                <p className="text-xs text-gray-500 mb-3">
                  Paste CSV rows: <code className="bg-gray-100 px-1 rounded">Club Name, Phone, Email (opt), Website (opt), City (opt), State (opt)</code>
                </p>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 h-32 resize-none"
                  placeholder={"Austin FC, 5124751000, info@austinfc.com, austinfc.com, Austin, TX\nDallas Soccer Club, 2145550100"}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleImport}
                    disabled={!importText}
                    className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
                  >
                    Import to Contact Book
                  </button>
                  <button
                    onClick={() => setShowImport(false)}
                    className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── CONTACT BOOK TAB ── */}
      {activeTab === "book" && (
        <div className="space-y-4">
          {manualForm}

          {editing && (
            <ContactEditForm
              key={editing.id}
              contact={editing}
              onCancel={() => setEditing(null)}
              onSaved={(updated) => {
                setSavedContacts((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
                setEditing(null);
                setNotice({ ok: true, text: `Saved ${updated.clubName}.` });
                setTimeout(() => setNotice(null), 3000);
              }}
            />
          )}

          {/* Add to campaign picker */}
          {showCampaignPicker && selectedBook.size > 0 && (
            <div className="bg-white rounded-xl border border-brand-200 p-4">
              <p className="text-sm font-medium text-gray-800 mb-3">
                Add {selectedBook.size} contact{selectedBook.size > 1 ? "s" : ""} to a campaign:
              </p>
              <div className="flex gap-3">
                <select
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  value={targetCampaign}
                  onChange={(e) => setTargetCampaign(e.target.value)}
                >
                  <option value="">Select a campaign...</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleAddToCampaign}
                  disabled={!targetCampaign || addingToCampaign}
                  className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg hover:opacity-90 disabled:opacity-50"
                >
                  {addingToCampaign ? "Adding..." : "Add to Campaign"}
                </button>
                <button
                  onClick={() => { setShowCampaignPicker(false); setTargetCampaign(""); }}
                  className="px-4 py-2 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Contact Book table */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-4 border-b border-gray-100 flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Search contacts..."
                  value={bookSearch}
                  onChange={(e) => setBookSearch(e.target.value)}
                />
              </div>
              {selectedBook.size > 0 && (
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-sm text-brand-600 font-medium">{selectedBook.size} selected</span>
                  <button
                    onClick={() => { setShowCampaignPicker(true); loadCampaigns(); }}
                    className="px-3 py-1.5 bg-brand-600 text-white text-sm rounded-lg hover:opacity-90"
                  >
                    Add to Campaign
                  </button>
                  <button
                    onClick={() => setSelectedBook(new Set())}
                    className="px-3 py-1.5 border border-gray-200 text-gray-600 text-sm rounded-lg hover:bg-gray-50"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {filteredBook.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <BookUser className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No contacts in your book yet.</p>
                <p className="text-xs mt-1">Search for clubs in the &quot;Find Contacts&quot; tab or add them manually.</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-gray-400 text-left border-b border-gray-100">
                    <th className="px-4 py-3 font-medium">
                      <input
                        type="checkbox"
                        checked={selectedBook.size === filteredBook.length && filteredBook.length > 0}
                        onChange={() => {
                          if (selectedBook.size === filteredBook.length) setSelectedBook(new Set());
                          else setSelectedBook(new Set(filteredBook.map((c) => c.id)));
                        }}
                        className="rounded"
                      />
                    </th>
                    <th className="px-4 py-3 font-medium">Club Name</th>
                    <th className="px-4 py-3 font-medium">Phone</th>
                    <th className="px-4 py-3 font-medium">Location</th>
                    <th className="px-4 py-3 font-medium">Email</th>
                    <th className="px-4 py-3 font-medium">Website</th>
                    <th className="px-4 py-3 font-medium">Stage</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBook.map((c) => (
                    <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedBook.has(c.id)}
                          onChange={() => toggleBookSelect(c.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">
                        {c.clubName}
                        {(c.contactName || c.ownerName) && (
                          <span className="block text-xs font-normal text-gray-400">{[c.contactName, c.ownerName && `owner: ${c.ownerName}`].filter(Boolean).join(" · ")}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatPhone(c.phone)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatLocation(c.city, c.state)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {c.email
                          ? <a href={`mailto:${c.email}`} className={c.emailOptOut ? "text-gray-400 line-through" : "text-brand-500 hover:underline"} title={c.emailOptOut ? "Unsubscribed from emails" : undefined}>{c.email}</a>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {c.website
                          ? (
                            <a
                              href={c.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-brand-500 hover:underline"
                            >
                              <ExternalLink className="w-3 h-3" />
                              {(() => { try { return new URL(c.website).hostname.replace(/^www\./, ""); } catch { return c.website; } })()}
                            </a>
                          )
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STAGE_COLOR[c.stage ?? "new"] ?? ""}`}>
                          {STAGE_LABEL[c.stage ?? "new"] ?? c.stage}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sourceColors[c.source] ?? "bg-gray-100 text-gray-600"}`}>
                          {sourceLabel[c.source] ?? c.source}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button
                          onClick={() => { setEditing(c); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                          title="Edit contact"
                          className="p-1 text-gray-300 hover:text-brand-500 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          title="Delete contact"
                          onClick={() => handleDeleteContact(c.id)}
                          disabled={deletingId === c.id}
                          className="p-1 text-gray-300 hover:text-red-400 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
