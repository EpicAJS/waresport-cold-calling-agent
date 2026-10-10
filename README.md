# Waresport Outreach Platform

A centralized sales outreach workspace for the Waresport team:

- Every rep and intern connects their **Gmail or Outlook** inbox.
- Campaigns send from those inboxes, and every reply is tracked in **one shared dashboard**.
- An **AI layer** classifies each reply, routes it to the right rep, and drafts a response they can send in one click.
- **AI voice calling** (Bland.ai) is still available as a second channel.

## What it does

- **Sign in with Google or Microsoft.** This also connects that inbox. Email and password still work as a fallback.
  - The first user becomes admin. After that it's invite-only (roles: Admin, Sales, Intern).
  - Reps and interns see only their own work; admins see everything.
- **Campaigns you build and launch in the platform.**
  - Email sequences: initial email plus follow-ups, which stop as soon as someone replies.
  - Follow-ups thread under the first email in the rep's own Gmail or Outlook.
  - Daily send limits, sending hours in each contact's local timezone, and weekdays only.
  - AI-personalized opening lines written from each club's website.
  - AI phone-call campaigns are still available.
- **AI Inbox.** Every connected inbox is scanned about once a minute while the app is open, and every 5 minutes through the scheduler.
  - Replies are classified as **interested / needs more info / not interested / negative**. Out-of-office replies and bounces are detected separately.
  - Each reply is routed to the rep who sent the email, with a suggested reply they can edit and send in one click (it threads correctly).
  - Interested replies open a deal, and any reply stops the automated follow-ups.
  - "Remove me" requests unsubscribe the contact, and bounces mark the address as dead.
  - Only replies from people you emailed, or who are in your contacts, are stored. Personal mail is never saved.
- **Dashboard (Overview).**
  - Stat cards: positive, negative, bounced, no response, active campaigns.
  - Campaign open and reply rates, subject-line performance, and the outreach funnel.
  - AI reply monitor and rep activity.
  - **Hot lead signals**: repeated opens or link clicks.
  - **Revenue pipeline.**
  - **Dedup shield**: prospects a teammate already contacted are skipped automatically.
- **Admin analytics.**
  - Team-wide open and reply rates by **subject line**, by rep and by campaign, filterable by rep and period.
  - Daily activity chart and reply-intent breakdown.
- **Pipeline.** Positive reply → demo booked → demo held → proposal → closed, with deal values.
  - Deals advance automatically from replies, calls and bookings.
- Also included: contact finder (Google Maps and OpenStreetMap), CSV import, Cal.com and Calendly booking tracking, demo reminders and post-demo emails, unsubscribe handling, and password reset.

## Run it locally

Requirements: Node 20+ and Postgres (a free [Neon](https://neon.tech) database works).

```bash
cp .env.example .env.local      # fill in DATABASE_URL and AUTH_SECRET at minimum
npm install
npm run db:migrate
npm run dev                     # http://localhost:3000
```

**Just want to see the UI?** Point `DATABASE_URL` at an *empty* database, then:

```bash
npm run db:migrate
npm run db:seed-demo -- --confirm   # sign in as admin@demo.waresport.com / demo-password
```

The seed creates a demo team, campaigns, replies, hot leads, deals and dedup blocks. Its inboxes are placeholders, so nothing is actually sent or scanned. The seed refuses to run on a database that already has users.

## Connecting Gmail and Outlook (one-time admin setup)

Sign-in and inbox access need an OAuth app per provider. The redirect URIs are:

- Google: `https://YOUR-APP/api/oauth/google/callback`
- Microsoft: `https://YOUR-APP/api/oauth/microsoft/callback`

**Google (Gmail)**
1. In Google Cloud Console, create a project and enable the **Gmail API**.
2. Set up the **OAuth consent screen**:
   - If Waresport uses Google Workspace, choose **Internal**. Only `@waresport.com` accounts can connect, and Google requires no app verification.
   - With **External**, the Gmail scopes need Google's verification before people outside the test-user list can connect.
3. Under **Credentials**, create an **OAuth client ID** of type Web application and add the redirect URI above.
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

Scopes requested: `openid email profile gmail.send gmail.readonly`.

**Microsoft (Outlook / Microsoft 365)**
1. In the Azure portal, go to **App registrations → New registration**.
   - Supported accounts: your organization only, or any organization.
   - Add the redirect URI above as type **Web**.
2. Under **Certificates & secrets**, create a client secret.
3. Under **API permissions**, add Microsoft Graph delegated permissions: `Mail.ReadWrite`, `Mail.Send`, `User.Read`, `offline_access`.
4. Set `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and `MICROSOFT_TENANT_ID` (your tenant ID, or `common`).

Each rep then clicks **Continue with Google / Microsoft** on the login page, or **Settings → Connected inboxes → Connect**.

## AI (OpenAI)

Set `OPENAI_API_KEY` (and optionally `OPENAI_MODEL`, default `gpt-4.1-mini`). Until it's set:
- replies are classified by built-in rules
- suggested replies come from templates
- the AI writer and personalized openers are turned off

Everything else works, and the AI takes over automatically once the key is added.

## Deploying to Vercel

1. Import the repo into Vercel and add a Postgres database (**Storage → Neon**). This sets `DATABASE_URL`.
2. Add the environment variables from `.env.example`. Set `APP_URL` to your production URL; it must be public for open tracking and webhooks to work.
3. Deploy. Database migrations run automatically (`vercel-build`).
4. **Turn on the scheduler.** It sends follow-ups at their due time, scans inboxes and paces calls.
   - On **Vercel Hobby**, Vercel's own cron runs only once a day, so use the included GitHub Action (`.github/workflows/outreach-cron.yml`), which runs every 5 minutes.
   - Add two repository secrets: `APP_URL` and `CRON_SECRET`. The Action only runs from the default branch, so merge to `main`.
   - On **Vercel Pro**, you can instead change `vercel.json` to `*/5 * * * *`.
   - While anyone has the app open, it also scans inboxes and sends due emails about once a minute.

## Hosting on AWS (or any server)

**[deploy/AWS.md](deploy/AWS.md)** walks through going live step by step:
- an EC2 server running Docker, with automatic HTTPS and the built-in 5-minute scheduler
- an RDS Postgres database
- your own domain

The same `docker compose up -d --build` setup works on any Linux server. To update after a change, run `bash deploy/update.sh` on the server.

## Integrations at a glance

| Service | Purpose | Config |
|---|---|---|
| Google / Microsoft | Sign-in, sending from reps' inboxes, reply scanning | `GOOGLE_*`, `MICROSOFT_*` |
| OpenAI | Reply classification, suggested replies, personalized openers, script/email writer | `OPENAI_API_KEY` |
| Bland.ai | AI phone calls | `BLAND_AI_API_KEY`, caller IDs in Settings |
| Resend | System emails (invites, password resets); fallback sender for reps without a connected inbox | Settings → Company, or `RESEND_API_KEY` |
| Cal.com / Calendly | Track booked demos | Settings → My demo booking link |
| SerpAPI | Club search | `SERP_API_KEY` |

Admins can see what's configured under **Settings → Integration status**.

## Notes and limits

- **Opens.** Open rates rely on a tracking pixel. Apple Mail Privacy Protection and some corporate filters inflate or hide opens, so treat open rate as a trend and reply rate as the truth. Open tracking can be turned off under Settings → Outreach rules.
- **Sending limits.** Each inbox is capped at a configurable number of emails per day (default 150) to protect deliverability.
- **Pausing call campaigns.** Pausing asks Bland to stop calls already queued for later that day. If Bland refuses a call, the app tells you it may still go out.
