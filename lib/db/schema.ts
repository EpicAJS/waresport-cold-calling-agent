import { sql } from "drizzle-orm";
import {
  pgTable, uuid, text, timestamp, boolean, integer, real, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";

export type Role = "admin" | "rep" | "intern";
export type MailProvider = "google" | "microsoft";
export type ReplyIntent = "positive" | "needs-info" | "not-interested" | "negative" | "out-of-office" | "bounce" | "other";
export type DealStage = "positive" | "demo-booked" | "demo-held" | "proposal" | "won" | "lost";
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

export const passwordResets = pgTable("password_resets", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const orgSettings = pgTable("org_settings", {
  id: integer("id").primaryKey().default(1),
  companyName: text("company_name").notNull().default("Waresport"),
  fromEmail: text("from_email"),
  resendApiKeyEnc: text("resend_api_key_enc"),
  mailingAddress: text("mailing_address"),
  dedupWindowDays: integer("dedup_window_days").notNull().default(30),
  mailboxDailyLimit: integer("mailbox_daily_limit").notNull().default(150),
  trackOpens: boolean("track_opens").notNull().default(true),
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
  emailBounced: boolean("email_bounced").notNull().default(false),
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
  mailboxId: uuid("mailbox_id").references(() => mailboxes.id, { onDelete: "set null" }),
  aiPersonalize: boolean("ai_personalize").notNull().default(false),
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
  mailboxId: uuid("mailbox_id").references(() => mailboxes.id, { onDelete: "set null" }),
  providerMessageId: text("provider_message_id"),
  threadId: text("thread_id"),
  messageIdHeader: text("message_id_header"),
  subjectTemplate: text("subject_template"),
  openCount: integer("open_count").notNull().default(0),
  firstOpenedAt: timestamp("first_opened_at", { withTimezone: true }),
  lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
  clickCount: integer("click_count").notNull().default(0),
  bouncedAt: timestamp("bounced_at", { withTimezone: true }),
  repliedAt: timestamp("replied_at", { withTimezone: true }),
  error: text("error"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  index("emails_status_send_idx").on(t.status, t.sendAt),
  index("emails_contact_idx").on(t.contactId),
  index("emails_thread_idx").on(t.mailboxId, t.threadId),
  index("emails_to_idx").on(t.toEmail),
]);

export const mailboxes = pgTable("mailboxes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").$type<MailProvider>().notNull(),
  email: text("email").notNull(),
  displayName: text("display_name"),
  accessTokenEnc: text("access_token_enc"),
  refreshTokenEnc: text("refresh_token_enc"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  status: text("status").$type<"active" | "error" | "disconnected">().notNull().default("active"),
  lastError: text("last_error"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  syncCursor: timestamp("sync_cursor", { withTimezone: true }),
  sentCursor: timestamp("sent_cursor", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("mailboxes_provider_email_uq").on(t.provider, t.email),
  index("mailboxes_user_idx").on(t.userId),
]);

export const inboundMessages = pgTable("inbound_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  mailboxId: uuid("mailbox_id").notNull().references(() => mailboxes.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  emailId: uuid("email_id").references(() => emails.id, { onDelete: "set null" }),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  providerMessageId: text("provider_message_id").notNull(),
  threadId: text("thread_id"),
  messageIdHeader: text("message_id_header"),
  fromEmail: text("from_email").notNull(),
  fromName: text("from_name"),
  subject: text("subject").notNull().default(""),
  snippet: text("snippet").notNull().default(""),
  bodyText: text("body_text").notNull().default(""),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  intent: text("intent").$type<ReplyIntent>(),
  intentSource: text("intent_source").$type<"ai" | "rules" | "manual">(),
  confidence: real("confidence"),
  aiSummary: text("ai_summary"),
  suggestedReply: text("suggested_reply"),
  suggestedReplySource: text("suggested_reply_source").$type<"ai" | "template">(),
  status: text("status").$type<"new" | "replied" | "archived" | "snoozed">().notNull().default("new"),
  snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
  handledAt: timestamp("handled_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("inbound_mailbox_msg_uq").on(t.mailboxId, t.providerMessageId),
  index("inbound_owner_status_idx").on(t.ownerId, t.status),
  index("inbound_received_idx").on(t.receivedAt),
]);

export const emailEvents = pgTable("email_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  emailId: uuid("email_id").notNull().references(() => emails.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
  type: text("type").$type<"open" | "click">().notNull(),
  url: text("url"),
  createdAt: createdAt(),
}, (t) => [index("email_events_contact_idx").on(t.contactId, t.createdAt)]);

export const deals = pgTable("deals", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  stage: text("stage").$type<DealStage>().notNull().default("positive"),
  amount: integer("amount"),
  recurring: boolean("recurring").notNull().default(false),
  source: text("source").$type<"reply" | "call" | "booking" | "manual">().notNull().default("manual"),
  notes: text("notes").notNull().default(""),
  stageChangedAt: timestamp("stage_changed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex("deals_contact_uq").on(t.contactId),
  index("deals_owner_idx").on(t.ownerId),
]);

export const dedupBlocks = pgTable("dedup_blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  contactId: uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "cascade" }),
  blockedUserId: uuid("blocked_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  priorUserId: uuid("prior_user_id").references(() => users.id, { onDelete: "set null" }),
  priorContactAt: timestamp("prior_contact_at", { withTimezone: true }),
  channel: text("channel").$type<"email" | "call">().notNull(),
  createdAt: createdAt(),
}, (t) => [uniqueIndex("dedup_campaign_contact_uq").on(t.campaignId, t.contactId)]);

export type User = typeof users.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type CampaignContact = typeof campaignContacts.$inferSelect;
export type Call = typeof calls.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Email = typeof emails.$inferSelect;
export type Mailbox = typeof mailboxes.$inferSelect;
export type InboundMessage = typeof inboundMessages.$inferSelect;
export type Deal = typeof deals.$inferSelect;
