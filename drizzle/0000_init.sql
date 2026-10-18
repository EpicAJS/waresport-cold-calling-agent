CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"contact_id" uuid,
	"campaign_id" uuid,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"timezone" text,
	"invitee_email" text,
	"invitee_name" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"bland_call_id" text,
	"attempt" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"outcome_override" text,
	"scheduled_for" timestamp with time zone NOT NULL,
	"duration_sec" integer DEFAULT 0 NOT NULL,
	"summary" text,
	"transcript" text,
	"recording_url" text,
	"analysis" jsonb,
	"error" text,
	"processed_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calls_bland_call_id_unique" UNIQUE("bland_call_id")
);
--> statement-breakpoint
CREATE TABLE "campaign_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone,
	"last_outcome" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"channel" text DEFAULT 'call' NOT NULL,
	"script" text DEFAULT '' NOT NULL,
	"voice_id" text DEFAULT '' NOT NULL,
	"from_number" text,
	"max_per_day" integer DEFAULT 30 NOT NULL,
	"window_start" text DEFAULT '09:00' NOT NULL,
	"window_end" text DEFAULT '17:00' NOT NULL,
	"timezone" text DEFAULT 'America/Chicago' NOT NULL,
	"max_retries" integer DEFAULT 2 NOT NULL,
	"emails_enabled" boolean DEFAULT true NOT NULL,
	"email_templates" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"launched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"club_name" text NOT NULL,
	"contact_name" text,
	"phone" text DEFAULT '' NOT NULL,
	"alt_phone" text,
	"email" text,
	"website" text,
	"address" text,
	"city" text DEFAULT '' NOT NULL,
	"state" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"rating" real,
	"reviews" integer,
	"stage" text DEFAULT 'new' NOT NULL,
	"email_opt_out" boolean DEFAULT false NOT NULL,
	"needs_follow_up" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"campaign_id" uuid,
	"booking_id" uuid,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"text" text NOT NULL,
	"send_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"resend_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "emails_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'rep' NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "org_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"company_name" text DEFAULT 'Waresport' NOT NULL,
	"from_email" text,
	"resend_api_key_enc" text,
	"mailing_address" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phone_numbers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"number" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'rep' NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"booking_provider" text DEFAULT 'link' NOT NULL,
	"booking_url" text,
	"calendly_token_enc" text,
	"calendly_webhook_uri" text,
	"calendly_signing_key" text,
	"calcom_webhook_secret" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_contacts" ADD CONSTRAINT "campaign_contacts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_contacts" ADD CONSTRAINT "campaign_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_provider_ext_uq" ON "bookings" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "bookings_owner_idx" ON "bookings" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "calls_campaign_idx" ON "calls" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "calls_owner_idx" ON "calls" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "calls_scheduled_idx" ON "calls" USING btree ("campaign_id","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_contacts_uq" ON "campaign_contacts" USING btree ("campaign_id","contact_id");--> statement-breakpoint
CREATE INDEX "campaign_contacts_status_idx" ON "campaign_contacts" USING btree ("campaign_id","status");--> statement-breakpoint
CREATE INDEX "campaigns_owner_idx" ON "campaigns" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_owner_phone_uq" ON "contacts" USING btree ("owner_id","phone") WHERE "contacts"."phone" <> '';--> statement-breakpoint
CREATE INDEX "contacts_owner_idx" ON "contacts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "contacts_email_idx" ON "contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "emails_status_send_idx" ON "emails" USING btree ("status","send_at");--> statement-breakpoint
CREATE INDEX "emails_contact_idx" ON "emails" USING btree ("contact_id");