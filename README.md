# Waresport Cold Calling Agent

An AI outbound sales workspace for sports clubs. Reps find clubs, run AI voice-call or cold-email campaigns,
and the app handles the follow-up: booking-link emails, demo reminders, post-call and post-demo nurture emails,
and retries for calls nobody picked up.

## What it does

- **Find contacts**: search Google Maps (SerpAPI) and OpenStreetMap for clubs, or import a CSV or add contacts by hand.
- **Call campaigns**: a Bland.ai voice agent calls each contact using your script.
  - Calls respect a **daily limit**, **calling hours in each contact's local timezone** (inferred from their state), and **weekdays only**.
  - No-answer or voicemail calls are **retried on the next business day** (2 retries by default, configurable per campaign).
  - On every call the agent asks for the prospect's **email and best phone number**. Both are stored, and email is the primary follow-up channel.
  - Do-not-call requests are honored automatically.
- **Email campaigns**: cold email sequences to contacts that have an email address. They include an unsubscribe link and your mailing address.
- **Automated follow-up emails**. Every template is editable per campaign:
  - booking link, sent right after a prospect says yes to a demo
  - post-call follow-ups for interested, callback, or never-reached contacts
  - reminders 24 hours and 1 hour before the demo
  - post-demo follow-ups
- **Demo booking**:
  - each rep has their own booking link
  - **Cal.com** or **Calendly** webhooks record the real booked time, handle reschedules and cancellations, and stop nurture emails
  - a plain link works too, with demos logged by hand on the Demos page
- **AI writer** (OpenAI): drafts or improves call scripts and email sequences.
- **Team**:
  - email + password accounts; the first user becomes admin, and admins invite reps
  - reps see only their own data; admins see everyone's
  - API keys and phone numbers are shared and admin-managed

## Local development

Requirements: Node 20+ and a Postgres database.

```bash
cp .env.example .env.local      # fill in DATABASE_URL and AUTH_SECRET at minimum
npm install
npm run db:migrate              # creates the tables
npm run dev                     # http://localhost:3000 → create the admin account
```

Webhooks can't reach `localhost`. While developing, use **Check results** on the Calls page or a campaign page to pull call outcomes from Bland.

After changing `lib/db/schema.ts`, run `npm run db:generate` to create a new migration, then `npm run db:migrate`.

## Deploying to Vercel (Hobby works)

1. Import the repo into Vercel.
2. Add a Postgres database: **Storage → Neon (Marketplace)**. This sets `DATABASE_URL` for you.
3. Add the other environment variables from `.env.example` (`AUTH_SECRET`, `CRON_SECRET`, `APP_URL`, `BLAND_AI_API_KEY`, `WEBHOOK_SECRET`, `SERP_API_KEY`, `OPENAI_API_KEY`).
4. Deploy. The `vercel-build` script runs database migrations before building.
5. Open the site and create the admin account. Then set up Settings → Company (Resend key, from address, mailing address) and Settings → My demo booking link.

`vercel.json` schedules `/api/cron/dispatch` **once a day at 11:00 UTC** (Hobby only allows daily crons). Each run does four things:

- pre-schedules that day's calls through Bland's `start_time`, spread across each contact's calling window
- starts cold-email sequences, up to each campaign's daily limit
- hands emails due in the next ~2 days to Resend's scheduled sending
- picks up any call results whose webhook was missed

Launching or resuming a campaign also dispatches immediately. On the Pro plan you can make the cron more frequent.

## Hosting on your own server later

Nothing in the app is Vercel-specific:

```bash
npm ci && npm run db:migrate && npm run build && npm start      # behind nginx/Caddy with HTTPS
```

Then have any scheduler call the dispatcher. It's safe to run as often as you like, and every 5 minutes works well:

```cron
*/5 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/dispatch > /dev/null
```

Point `DATABASE_URL` at your Postgres and set `APP_URL` to your domain. If you moved the database, re-connect Calendly and update the Cal.com webhook URL.

## Integrations

| Service | What for | Where to configure |
|---|---|---|
| Bland.ai | AI phone calls | `BLAND_AI_API_KEY`. Caller IDs go in Settings → Phone numbers |
| Resend | All email | Settings → Company (or `RESEND_API_KEY` / `EMAIL_FROM`); verify your sending domain in Resend |
| Cal.com | Demo bookings (free webhooks) | Settings → My demo booking link → Cal.com: copy the webhook URL + secret into Cal.com → Settings → Developer → Webhooks |
| Calendly | Demo bookings (paid plan for webhooks) | Settings → My demo booking link → Calendly: paste a personal access token |
| OpenAI | AI script/email writer | `OPENAI_API_KEY` (optional `OPENAI_MODEL`) |
| SerpAPI | Club search | `SERP_API_KEY` |

Admins can see which integrations are configured under Settings → Integration status.

## How the automation flows

1. A campaign launches, and contacts join its queue.
2. The dispatcher schedules calls (or cold emails) within the daily limit and calling hours.
3. When a call ends, Bland sends a webhook (`/api/webhooks/bland`). Each call is processed **exactly once**:
   - **Wants a demo** → the booking-link email is sent. If no email was captured, the contact appears under Demos → Needs follow-up.
   - **Interested / callback** → the post-call email sequence starts. Callbacks are also flagged for the rep.
   - **No answer / voicemail** → a retry is scheduled for the next business day. Once retries run out, the post-call sequence starts.
   - **Not interested / do not call / wrong number** → the contact is closed out and skipped in future campaigns.
4. The prospect books through Cal.com or Calendly, and the booking webhook fires:
   - the demo is recorded
   - pending calls and nurture emails are cancelled
   - 24-hour and 1-hour reminders and the post-demo follow-ups are queued
   - reschedules and cancellations update everything automatically

## Notes and limits

- Pausing a campaign asks Bland to stop calls already scheduled for later that day. If Bland refuses for a particular call, the app tells you it may still go out.
- Emails more than ~2 days out stay queued in the app and are handed to Resend by the daily job. That keeps them inside Resend's scheduling window.
- Every email includes an unsubscribe link, and one-click unsubscribe is supported. Unsubscribed contacts are never emailed again.
