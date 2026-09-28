import { sql } from "drizzle-orm";
import {
  pgTable, uuid, text, timestamp, boolean, integer, real, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";

export type Role = "admin" | "rep";
export type BookingProvider = "link" | "calcom" | "calendly";
export type CampaignChannel = "call" | "email";
export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export type EmailTemplate = { subject: string; body: string };
export type DelayedTemplate = EmailTemplate & { delay_days: number };
export type PostDemoTemplate = EmailTemplate & { delay_hours: number };
export type EmailTemplates = {
  booking_link: EmailTemplate;
  reminder_24h: EmailTemplate;
  reminder_1h: EmailTemplate;
  post_demo: PostDemoTemplate[];
  post_call: DelayedTemplate[];
  cold: DelayedTemplate[];
};

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<Role>().notNull().default("rep"),
  disabled: boolean("disabled").notNull().default(false),
  bookingProvider: text("booking_provider").$type<BookingProvider>().notNull().default("link"),
  bookingUrl: text("booking_url"),
  calendlyTokenEnc: text("calendly_token_enc"),
  calendlyWebhookUri: text("calendly_webhook_uri"),
  calendlySigningKey: text("calendly_signing_key"),
  calcomWebhookSecret: text("calcom_webhook_secret"),
  createdAt: createdAt(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  email: text("email").notNull(),
  role: text("role").$type<Role>().notNull().default("rep"),
  invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const orgSettings = pgTable("org_settings", {
  id: integer("id").primaryKey().default(1),
  companyName: text("company_name").notNull().default("Waresport"),
  fromEmail: text("from_email"),
  resendApiKeyEnc: text("resend_api_key_enc"),
  mailingAddress: text("mailing_address"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const phoneNumbers = pgTable("phone_numbers", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  number: text("number").notNull(),
  createdAt: createdAt(),
});

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  clubName: text("club_name").notNull(),
  contactName: text("contact_name"),
  phone: text("phone").notNull().default(""),
  altPhone: text("alt_phone"),
  email: text("email"),
  website: text("website"),
  address: text("address"),
  city: text("city").notNull().default(""),
  state: text("state").notNull().default(""),
  source: text("source").notNull().default("manual"),
  verified: boolean("verified").notNull().default(false),
  notes: text("notes").notNull().default(""),
  rating: real("rating"),
  reviews: integer("reviews"),
  stage: text("stage").notNull().default("new"),
  emailOptOut: boolean("email_opt_out").notNull().default(false),
  needsFollowUp: text("needs_follow_up"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("contacts_owner_phone_uq").on(t.ownerId, t.phone).where(sql`${t.phone} <> ''`),
  index("contacts_owner_idx").on(t.ownerId),
  index("contacts_email_idx").on(t.email),
]);

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  channel: text("channel").$type<CampaignChannel>().notNull().default("call"),
  script: text("script").notNull().default(""),
  voiceId: text("voice_id").notNull().default(""),
  fromNumber: text("from_number"),
  maxPerDay: integer("max_per_day").notNull().default(30),
  windowStart: text("window_start").notNull().default("09:00"),
  windowEnd: text("window_end").notNull().default("17:00"),
  timezone: text("timezone").notNull().default("America/Chicago"),
  maxRetries: integer("max_retries").notNull().default(2),
  emailsEnabled: boolean("emails_enabled").notNull().default(true),
  emailTemplates: jsonb("email_templates").$type<EmailTemplates>().notNull(),
  status: text("status").$type<CampaignStatus>().notNull().default("draft"),
  launchedAt: timestamp("launched_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index("campaigns_owner_idx").on(t.ownerId)]);

export const campaignContacts = pgTable("campaign_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  status: text("status").$type<"pending" | "scheduled" | "done" | "skipped">().notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
  lastOutcome: text("last_outcome"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("campaign_contacts_uq").on(t.campaignId, t.contactId),
  index("campaign_contacts_status_idx").on(t.campaignId, t.status),
]);

export const calls = pgTable("calls", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  blandCallId: text("bland_call_id").unique(),
  attempt: integer("attempt").notNull().default(1),
  status: text("status").$type<"scheduled" | "completed" | "failed" | "cancelled">().notNull().default("scheduled"),
  outcome: text("outcome").notNull().default("pending"),
  outcomeOverride: text("outcome_override"),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
  durationSec: integer("duration_sec").notNull().default(0),
  summary: text("summary"),
  transcript: text("transcript"),
  recordingUrl: text("recording_url"),
  analysis: jsonb("analysis").$type<Record<string, unknown>>(),
  error: text("error"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  index("calls_campaign_idx").on(t.campaignId),
  index("calls_owner_idx").on(t.ownerId),
  index("calls_scheduled_idx").on(t.campaignId, t.scheduledFor),
]);

export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  provider: text("provider").$type<"calcom" | "calendly" | "manual">().notNull(),
  externalId: text("external_id").notNull(),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  timezone: text("timezone"),
  inviteeEmail: text("invitee_email"),
  inviteeName: text("invitee_name"),
  status: text("status").$type<"scheduled" | "canceled">().notNull().default("scheduled"),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("bookings_provider_ext_uq").on(t.provider, t.externalId),
  index("bookings_owner_idx").on(t.ownerId),
]);

export const emails = pgTable("emails", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
  bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  dedupeKey: text("dedupe_key").notNull().unique(),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  html: text("html").notNull(),
  text: text("text").notNull(),
  sendAt: timestamp("send_at", { withTimezone: true }).notNull(),
  status: text("status").$type<"pending" | "scheduled" | "sent" | "failed" | "cancelled">().notNull().default("pending"),
  resendId: text("resend_id"),
  error: text("error"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  index("emails_status_send_idx").on(t.status, t.sendAt),
  index("emails_contact_idx").on(t.contactId),
]);

export type User = typeof users.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type CampaignContact = typeof campaignContacts.$inferSelect;
export type Call = typeof calls.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Email = typeof emails.$inferSelect;
