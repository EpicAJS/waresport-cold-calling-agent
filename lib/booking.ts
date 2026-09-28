import type { BookingProvider } from "@/lib/db/schema";

/** Adds prefill + tracking params so the booking webhook can be matched back to the contact. */
export function personalizedBookingLink(
  baseUrl: string | null | undefined,
  provider: BookingProvider,
  contact: { id: string; email?: string | null; contactName?: string | null; clubName: string },
  campaignId?: string | null
): string {
  if (!baseUrl) return "";
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    return baseUrl;
  }
  const host = url.hostname;
  const kind = provider !== "link" ? provider : host.endsWith("calendly.com") ? "calendly" : host.includes("cal.com") ? "calcom" : "link";
  const name = contact.contactName || "";

  if (kind === "calcom") {
    if (contact.email) url.searchParams.set("email", contact.email);
    if (name) url.searchParams.set("name", name);
    url.searchParams.set("metadata[contactId]", contact.id);
    if (campaignId) url.searchParams.set("metadata[campaignId]", campaignId);
  } else if (kind === "calendly") {
    if (contact.email) url.searchParams.set("email", contact.email);
    if (name) url.searchParams.set("name", name);
    url.searchParams.set("utm_source", "waresport-agent");
    url.searchParams.set("utm_content", contact.id);
    if (campaignId) url.searchParams.set("utm_campaign", campaignId);
  }
  return url.toString();
}
