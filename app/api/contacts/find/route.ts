import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { db, contacts } from "@/lib/db";
import { authed } from "@/lib/auth";
import { inferState } from "@/lib/time";

export const maxDuration = 60;

const SERP_KEY = process.env.SERP_API_KEY ?? "";

const NOISE_DOMAINS = new Set([
  "example.com", "sentry.io", "google.com", "googleapis.com",
  "facebook.com", "twitter.com", "instagram.com", "youtube.com",
  "squarespace.com", "wix.com", "wordpress.com", "mailchimp.com",
  "constantcontact.com", "godaddy.com", "shopify.com", "amazonaws.com",
  "gravatar.com", "schema.org", "w3.org",
]);
const NOISE_PREFIXES = ["noreply", "no-reply", "donotreply", "mailer", "bounce", "webmaster"];
const GENERIC_PREFIXES = [
  "info", "contact", "admin", "office", "mail", "hello", "support",
  "team", "general", "inquiries", "inquiry", "help", "registration",
  "register", "sales", "marketing", "soccer", "club", "sports",
];
const ROLE_PREFIXES = [
  "director", "coach", "president", "manager", "coordinator", "head",
  "executive", "founder", "owner", "administrator", "secretary",
  "treasurer", "vp", "ceo", "coo",
];

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^1/, "");
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
}

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return ""; }
}

function emailScore(email: string): number {
  const local = email.split("@")[0].toLowerCase();
  if (GENERIC_PREFIXES.includes(local)) return 0;
  if (ROLE_PREFIXES.some((r) => local.startsWith(r))) return 1;
  return 2;
}

function parseEmails(text: string, preferDomain = ""): string[] {
  const decoded = text
    .replace(/&#64;/g, "@").replace(/&#46;/g, ".")
    .replace(/&#x40;/gi, "@").replace(/\[at\]/gi, "@")
    .replace(/\s*\(at\)\s*/gi, "@").replace(/&amp;/g, "&");

  const mailtoRe = /href=["']mailto:([^"'?\s]+)/gi;
  const mailtoEmails: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = mailtoRe.exec(decoded)) !== null) mailtoEmails.push(m[1].toLowerCase());

  const textRe = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const textEmails = (decoded.match(textRe) ?? []).map((e) => e.toLowerCase());

  const all = [...new Set([...mailtoEmails, ...textEmails])].filter((e) => {
    const domain = e.split("@")[1] ?? "";
    if (/\.(png|jpg|jpeg|gif|svg|css|js|woff|ttf)$/i.test(e)) return false;
    if (NOISE_DOMAINS.has(domain)) return false;
    if (NOISE_PREFIXES.some((p) => e.startsWith(p + "@"))) return false;
    return true;
  });

  return all.sort((a, b) => {
    const aOwn = preferDomain && a.endsWith(`@${preferDomain}`) ? 1 : 0;
    const bOwn = preferDomain && b.endsWith(`@${preferDomain}`) ? 1 : 0;
    if (aOwn !== bOwn) return bOwn - aOwn;
    return emailScore(b) - emailScore(a);
  });
}

// ─── SerpAPI Google Maps ────────────────────────────────────────────────────

async function fetchAllMapsResults(query: string, location: string): Promise<{ results: any[]; exhausted: boolean }> {
  if (!SERP_KEY) return { results: [], exhausted: false };

  let exhausted = false;

  async function fetchPage(searchQuery: string, start: number): Promise<any[]> {
    if (exhausted) return [];
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google_maps");
    url.searchParams.set("q", searchQuery);
    url.searchParams.set("type", "search");
    url.searchParams.set("start", String(start));
    url.searchParams.set("api_key", SERP_KEY);
    try {
      const res = await fetch(url.toString());
      const data = await res.json();
      if (typeof data.error === "string" && data.error.toLowerCase().includes("run out")) {
        exhausted = true;
        return [];
      }
      if (!res.ok) return [];
      return data.local_results ?? [];
    } catch { return []; }
  }

  const variants = [
    `${query} in ${location}`,
    `${query} near ${location}`,
    `${query} ${location}`,
    `${query} club ${location}`,
  ];
  const pages = [0, 20, 40, 60, 80, 100];

  const batches = await Promise.all(
    variants.flatMap((q) => pages.map((start) => fetchPage(q, start)))
  );

  const seenPhones = new Set<string>();
  const merged: any[] = [];
  for (const batch of batches) {
    for (const place of batch) {
      if (!place.phone) continue;
      const phone = normalizePhone(place.phone);
      if (seenPhones.has(phone)) continue;
      seenPhones.add(phone);
      merged.push(place);
    }
  }
  return { results: merged, exhausted };
}

async function findEmailViaSerpApi(clubName: string, website: string | null): Promise<string | null> {
  if (!SERP_KEY) return null;
  const domain = website ? extractDomain(website) : "";
  const query = domain ? `site:${domain} email contact` : `"${clubName}" email contact`;
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("num", "5");
  url.searchParams.set("api_key", SERP_KEY);
  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    if (data.knowledge_graph?.email) return data.knowledge_graph.email;
    const allText = (data.organic_results ?? [])
      .map((r: any) => [r.snippet ?? "", r.rich_snippet?.extensions?.join(" ") ?? ""].join(" "))
      .join(" ");
    const emails = parseEmails(allText, domain);
    if (emails.length > 0) return emails[0];
  } catch { /* best-effort */ }
  return null;
}

// ─── Overpass / OpenStreetMap ───────────────────────────────────────────────

async function geocodeToBBox(location: string): Promise<[number, number, number, number] | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Waresport-ColdCalling/1.0 (contact@waresport.com)" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data[0]?.boundingbox) return null;
    const [south, north, west, east] = data[0].boundingbox.map(Number);
    return [south, north, west, east];
  } catch { return null; }
}

async function fetchOverpassResults(bbox: [number, number, number, number]): Promise<any[]> {
  const [south, north, west, east] = bbox;
  const pad = 0.15; // ~15km padding around city boundary
  const b = `${south - pad},${west - pad},${north + pad},${east + pad}`;

  const q = `
[out:json][timeout:90];
(
  node["leisure"="sports_club"]["name"](${b});
  way["leisure"="sports_club"]["name"](${b});
  relation["leisure"="sports_club"]["name"](${b});
  node["leisure"="sports_centre"]["name"](${b});
  way["leisure"="sports_centre"]["name"](${b});
  relation["leisure"="sports_centre"]["name"](${b});
  node["leisure"="fitness_centre"]["name"](${b});
  way["leisure"="fitness_centre"]["name"](${b});
  node["amenity"="club"]["name"](${b});
  way["amenity"="club"]["name"](${b});
  node["office"~"^(club|association|ngo)$"]["name"](${b});
  node["sport"~".",i]["name"]["phone"](${b});
  way["sport"~".",i]["name"]["phone"](${b});
  node["sport"~".",i]["name"]["website"](${b});
  way["sport"~".",i]["name"]["website"](${b});
);
out body center qt;
`.trim();

  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      body: q,
      headers: { "Content-Type": "text/plain" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.elements ?? [];
  } catch { return []; }
}

function extractKeywords(userQuery: string): string[] {
  const stop = new Set([
    "clubs", "club", "teams", "team", "sports", "sport", "in", "near",
    "at", "the", "a", "and", "or", "for", "all", "local", "area",
    "league", "leagues", "association", "center", "centre",
  ]);
  return userQuery.toLowerCase().split(/\s+/).filter((w) => !stop.has(w) && w.length > 2);
}

function overpassElementMatches(el: any, keywords: string[]): boolean {
  if (!keywords.length) return true;
  const name = (el.tags?.name ?? "").toLowerCase();
  const sport = (el.tags?.sport ?? "").toLowerCase();
  const leisure = (el.tags?.leisure ?? "").toLowerCase();
  const desc = (el.tags?.description ?? "").toLowerCase();
  return keywords.some((kw) => name.includes(kw) || sport.includes(kw) || leisure.includes(kw) || desc.includes(kw));
}

function overpassToContact(el: any, city: string): Record<string, any> | null {
  const name = el.tags?.name;
  if (!name) return null;
  const rawPhone = el.tags?.phone ?? el.tags?.["contact:phone"] ?? null;
  const phone = rawPhone ? normalizePhone(rawPhone) : "";
  const website = el.tags?.website ?? el.tags?.["contact:website"] ?? el.tags?.url ?? null;
  const email = el.tags?.email ?? el.tags?.["contact:email"] ?? null;
  const street = el.tags?.["addr:street"];
  const housenum = el.tags?.["addr:housenumber"] ?? "";
  const address = street ? `${housenum} ${street}`.trim() : null;
  return {
    id: randomUUID(),
    clubName: name,
    phone,
    email,
    website,
    address,
    city,
    state: inferState({ state: el.tags?.["addr:state"], address, city }) ?? "",
    source: "openstreetmap",
    verified: false,
    notes: el.tags?.sport ?? el.tags?.leisure ?? "",
    rating: null,
    reviews: null,
  };
}

// ─── Shared dedup helper ────────────────────────────────────────────────────

function addIfNew(
  contact: Record<string, any>,
  existingPhones: Set<string>,
  existingNames: Set<string>,
  seenPhones: Set<string>,
  seenNames: Set<string>,
  out: any[]
) {
  if (contact.phone && existingPhones.has(contact.phone)) return false;
  if (existingNames.has(normalizeName(contact.clubName))) return false;
  if (contact.phone && seenPhones.has(contact.phone)) return false;
  const nameKey = normalizeName(contact.clubName);
  if (seenNames.has(nameKey)) return false;
  if (contact.phone) seenPhones.add(contact.phone);
  seenNames.add(nameKey);
  out.push(contact);
  return true;
}

// ─── Main handler ───────────────────────────────────────────────────────────

export const GET = authed(async (req, _ctx, user) => {
  const query = req.nextUrl.searchParams.get("query") ?? "";
  const location = req.nextUrl.searchParams.get("city") ?? "";

  if (!query || !location) {
    return NextResponse.json({ error: "query and city are required" }, { status: 400 });
  }

  const existingContacts = await db
    .select({ phone: contacts.phone, clubName: contacts.clubName })
    .from(contacts)
    .where(eq(contacts.ownerId, user.id));
  const existingPhones = new Set(existingContacts.map((c) => normalizePhone(c.phone)).filter(Boolean));
  const existingNames = new Set(existingContacts.map((c) => normalizeName(c.clubName)));

  const seenPhones = new Set<string>();
  const seenNames = new Set<string>();

  // ── Run SerpAPI + Overpass geocoding in parallel ─────────────────────────
  const [mapsData, bbox] = await Promise.all([
    fetchAllMapsResults(query, location),
    geocodeToBBox(location),
  ]);

  const { results: mapsResults, exhausted: serpExhausted } = mapsData;

  // ── Overpass (always runs) ───────────────────────────────────────────────
  const osmElements = bbox ? await fetchOverpassResults(bbox) : [];
  const keywords = extractKeywords(query);
  const filteredOsm = osmElements.filter((el) => overpassElementMatches(el, keywords));

  // ── Process SerpAPI results ──────────────────────────────────────────────
  const serpNew: any[] = [];
  let serpExistingCount = 0;

  for (const place of mapsResults) {
    const phone = normalizePhone(place.phone);
    if (!phone) continue;
    seenPhones.add(phone);
    seenNames.add(normalizeName(place.title ?? place.name ?? ""));
    if (existingPhones.has(phone)) { serpExistingCount++; continue; }
    serpNew.push(place);
  }

  // ── Process Overpass results ─────────────────────────────────────────────
  const osmContacts: any[] = [];
  for (const el of filteredOsm) {
    const contact = overpassToContact(el, location);
    if (contact) addIfNew(contact, existingPhones, existingNames, seenPhones, seenNames, osmContacts);
  }

  const totalFound = mapsResults.length + osmContacts.length + serpExistingCount;

  if (serpNew.length === 0 && osmContacts.length === 0) {
    const serpMsg = serpExhausted ? " Google Maps quota exhausted — only OpenStreetMap results available." : "";
    return NextResponse.json(
      { error: `No clubs found for "${query}" in ${location}.${serpMsg}` },
      { status: 404 }
    );
  }

  // ── Run email finder on SerpAPI results that have a website ──────────────
  const emailCandidates = serpNew.slice(0, 60);
  const emailResults = await Promise.allSettled(
    emailCandidates.map((p: any) => findEmailViaSerpApi(p.title ?? p.name ?? "", p.website ?? null))
  );

  const serpContacts = serpNew.map((p: any, i: number) => {
    const email = i < emailResults.length && emailResults[i].status === "fulfilled"
      ? (emailResults[i] as PromiseFulfilledResult<string | null>).value
      : null;
    return {
      id: randomUUID(),
      clubName: p.title ?? p.name ?? "",
      phone: normalizePhone(p.phone),
      email,
      website: p.website ?? null,
      address: p.address ?? null,
      city: location,
      state: inferState({ address: p.address, city: location }) ?? "",
      source: "google_places",
      verified: true,
      notes: p.type ?? "",
      rating: p.rating ?? null,
      reviews: p.reviews ?? null,
    };
  });

  // Order: Google Maps (best data) → OpenStreetMap
  const results = [...serpContacts, ...osmContacts];

  return NextResponse.json({
    results,
    total: totalFound,
    new_count: results.length,
    existing_count: serpExistingCount,
    serp_count: serpContacts.length,
    osm_count: osmContacts.length,
    serp_exhausted: serpExhausted,
  });
});
