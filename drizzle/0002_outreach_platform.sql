CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"campaign_id" uuid,
	"stage" text DEFAULT 'positive' NOT NULL,
	"amount" integer,
	"recurring" boolean DEFAULT false NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dedup_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contact_id" uuid NOT NULL,
	"campaign_id" uuid,
	"blocked_user_id" uuid NOT NULL,
	"prior_user_id" uuid,
	"prior_contact_at" timestamp with time zone,
	"channel" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_id" uuid NOT NULL,
	"contact_id" uuid,
	"type" text NOT NULL,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mailbox_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"contact_id" uuid,
	"email_id" uuid,
	"campaign_id" uuid,
	"provider_message_id" text NOT NULL,
	"thread_id" text,
	"message_id_header" text,
	"from_email" text NOT NULL,
	"from_name" text,
	"subject" text DEFAULT '' NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"intent" text,
	"intent_source" text,
	"confidence" real,
	"ai_summary" text,
	"suggested_reply" text,
	"suggested_reply_source" text,
	"status" text DEFAULT 'new' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mailboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"access_token_enc" text,
	"refresh_token_enc" text,
	"token_expires_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"last_error" text,
	"last_sync_at" timestamp with time zone,
	"sync_cursor" timestamp with time zone,
	"sent_cursor" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "mailbox_id" uuid;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "ai_personalize" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "email_bounced" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "mailbox_id" uuid;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "provider_message_id" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "thread_id" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "message_id_header" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "subject_template" text;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "open_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "first_opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "last_opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "click_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "bounced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "emails" ADD COLUMN "replied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "dedup_window_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "mailbox_daily_limit" integer DEFAULT 150 NOT NULL;--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "track_opens" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dedup_blocks" ADD CONSTRAINT "dedup_blocks_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dedup_blocks" ADD CONSTRAINT "dedup_blocks_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dedup_blocks" ADD CONSTRAINT "dedup_blocks_blocked_user_id_users_id_fk" FOREIGN KEY ("blocked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dedup_blocks" ADD CONSTRAINT "dedup_blocks_prior_user_id_users_id_fk" FOREIGN KEY ("prior_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_events" ADD CONSTRAINT "email_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_email_id_emails_id_fk" FOREIGN KEY ("email_id") REFERENCES "public"."emails"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailboxes" ADD CONSTRAINT "mailboxes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deals_contact_uq" ON "deals" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "deals_owner_idx" ON "deals" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dedup_campaign_contact_uq" ON "dedup_blocks" USING btree ("campaign_id","contact_id");--> statement-breakpoint
CREATE INDEX "email_events_contact_idx" ON "email_events" USING btree ("contact_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_mailbox_msg_uq" ON "inbound_messages" USING btree ("mailbox_id","provider_message_id");--> statement-breakpoint
CREATE INDEX "inbound_owner_status_idx" ON "inbound_messages" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "inbound_received_idx" ON "inbound_messages" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mailboxes_provider_email_uq" ON "mailboxes" USING btree ("provider","email");--> statement-breakpoint
CREATE INDEX "mailboxes_user_idx" ON "mailboxes" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_mailbox_id_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."mailboxes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emails_thread_idx" ON "emails" USING btree ("mailbox_id","thread_id");--> statement-breakpoint
CREATE INDEX "emails_to_idx" ON "emails" USING btree ("to_email");