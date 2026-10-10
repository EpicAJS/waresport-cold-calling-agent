// Fills an EMPTY database with a realistic demo workspace so the dashboard can be previewed
// before real inboxes are connected. Never run this against production data.
//   npm run db:seed-demo -- --confirm
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import bcrypt from "bcryptjs";

for (const f of [".env.local", ".env"]) if (fs.existsSync(f)) process.loadEnvFile(f);
if (!process.argv.includes("--confirm")) {
  console.error("This inserts demo users, campaigns, emails and replies. Re-run with --confirm on an empty database.");
  process.exit(1);
}
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
const [{ n }] = await sql`select count(*)::int as n from users`;
if (n > 0) {
  console.error("Refusing to seed: the database already has users. Use a fresh database for the demo.");
  process.exit(1);
}

let seed = 42;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rand() * a.length)];
const chance = (p) => rand() < p;
const ago = (hours) => new Date(Date.now() - hours * 3600e3);

const password = await bcrypt.hash("demo-password", 10);
const team = [
  { name: "Demo Admin", email: "admin@demo.waresport.com", role: "admin" },
  { name: "Gaurav K.", email: "gaurav@demo.waresport.com", role: "rep" },
  { name: "Vidyut D.", email: "vidyut@demo.waresport.com", role: "rep" },
  { name: "Intern 1", email: "intern1@demo.waresport.com", role: "intern" },
  { name: "Intern 2", email: "intern2@demo.waresport.com", role: "intern" },
].map((u) => ({ ...u, id: randomUUID() }));
await sql`insert into users ${sql(team.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, password_hash: password, booking_url: "https://cal.com/waresport/demo" })))}`;
await sql`insert into org_settings (id, company_name, mailing_address) values (1, 'Waresport', '1 Main St, Austin, TX 78701') on conflict (id) do nothing`;

// Placeholder inboxes: no tokens, and a far-future scan time so the scheduler leaves them alone.
const boxes = team.slice(1).map((u) => ({
  id: randomUUID(), user_id: u.id, provider: "google", email: u.email, display_name: u.name, status: "active",
  last_sync_at: new Date("2099-01-01"), sync_cursor: new Date(), sent_cursor: new Date(),
}));
await sql`insert into mailboxes ${sql(boxes)}`;

const FIRST = ["Dan", "Trevor", "Charisse", "Wesam", "Maria", "Kevin", "Priya", "Jordan", "Alex", "Sam", "Taylor", "Chris", "Morgan", "Jamie", "Riley", "Casey", "Drew", "Avery"];
const LAST = ["Edwards", "DiMauro", "Mapp", "Abdallah", "Lopez", "Nguyen", "Patel", "Brooks", "Kim", "Rivera", "Carter", "Hughes", "Price", "Bennett"];
const CITIES = [["Austin", "TX"], ["Dallas", "TX"], ["Phoenix", "AZ"], ["Denver", "CO"], ["Atlanta", "GA"], ["Tampa", "FL"], ["San Diego", "CA"], ["Raleigh", "NC"], ["Nashville", "TN"]];
const SUBJECTS = [
  "Quick question about {{club_name}}'s registration process",
  "Saving {{club_name}} 15+ hours a week on admin",
  "{{club_name}} + Waresport?",
  "Idea for your {{club_name}} season signups",
];
const campaignsDef = [
  { name: "Volleyball clubs — Q4", sport: "Volleyball", owner: 1, size: 64, open: 0.64, reply: 0.18, status: "active", subj: [0, 1] },
  { name: "Pickleball orgs — West", sport: "Pickleball", owner: 3, size: 40, open: 0.51, reply: 0.12, status: "active", subj: [2, 0] },
  { name: "Soccer clubs — SE", sport: "Soccer", owner: 2, size: 52, open: 0.43, reply: 0.09, status: "paused", subj: [1, 3] },
  { name: "Basketball coaches", sport: "Basketball", owner: 4, size: 72, open: 0.38, reply: 0.07, status: "active", subj: [3, 2] },
];
const REPLIES = {
  positive: ["Yes, this sounds great — can we set up a demo next week?", "Interested! Send me a link to book a time.", "Would love to see how this works for our tryouts."],
  "needs-info": ["What does pricing look like for about 300 players?", "Does this integrate with QuickBooks? Need to know before a call.", "Can you send more info on the scheduling features?"],
  "not-interested": ["No thanks, we're all set with our current system.", "Not right now — maybe reach out next season.", "We just signed a 2-year contract with another provider."],
  negative: ["Please remove me from your list.", "Stop emailing me."],
  "out-of-office": ["I'm out of the office until Monday with limited access to email."],
};
const TEMPLATE_REPLY = {
  positive: (f, r) => `Hi ${f},\n\nGreat to hear from you! Here's a link to grab a 15-minute slot that works for you:\n\nhttps://cal.com/waresport/demo\n\nLooking forward to it,\n${r}`,
  "needs-info": (f, r) => `Hi ${f},\n\nThanks for the question! Waresport brings registrations, scheduling, and payments into one platform. The easiest way to see if it fits is a quick walkthrough:\n\nhttps://cal.com/waresport/demo\n\n${r}`,
  "not-interested": (f, r) => `Hi ${f},\n\nThanks for letting me know — I'll close the loop on my end. If anything changes, I'm always happy to help.\n\nBest,\n${r}`,
};

const contacts = [], ccs = [], emails = [], events = [], inbound = [], deals = [];
for (const def of campaignsDef) {
  const owner = team[def.owner];
  const box = boxes.find((b) => b.user_id === owner.id);
  const campaignId = randomUUID();
  def.id = campaignId;
  await sql`insert into campaigns ${sql({
    id: campaignId, owner_id: owner.id, name: def.name, description: `${def.sport} programs`, channel: "email", status: def.status,
    max_per_day: 40, ai_personalize: true, mailbox_id: box.id, launched_at: ago(24 * 9),
    email_templates: sql.json({
      booking_link: { subject: "Pick a time", body: "{{booking_link}}" }, reminder_24h: { subject: "Reminder", body: "Tomorrow" }, reminder_1h: { subject: "Soon", body: "1h" },
      post_demo: [], post_call: [],
      cold: [
        { delay_days: 0, subject: SUBJECTS[def.subj[0]], body: "Hi {{contact_name}},\n\n{{ai_opener}}\n\n..." },
        { delay_days: 3, subject: `Re: ${SUBJECTS[def.subj[0]]}`, body: "..." },
        { delay_days: 5, subject: SUBJECTS[def.subj[1]], body: "..." },
        { delay_days: 7, subject: "Should I close the loop?", body: "..." },
      ],
    }),
  })}`;

  for (let i = 0; i < def.size; i++) {
    const [city, state] = pick(CITIES);
    const first = pick(FIRST), last = pick(LAST);
    const club = `${city} ${pick(["Elite", "United", "Storm", "Rush", "Academy", "Juniors", "Select", "FC", "Club"])} ${def.sport}${i % 7 === 0 ? " " + (i + 1) : ""}`;
    const id = randomUUID();
    const email = `${first.toLowerCase()}.${last.toLowerCase()}${i}@${club.toLowerCase().replace(/[^a-z]/g, "").slice(0, 14)}.org`;
    contacts.push({ id, owner_id: owner.id, club_name: club, contact_name: `${first} ${last}`, email, phone: chance(0.6) ? `512555${String(1000 + contacts.length).slice(-4)}` : "", city, state, source: "google_places", stage: "contacted", notes: def.sport });

    const sentHours = 6 + rand() * 24 * 8;
    const bounced = chance(0.03);
    const opened = !bounced && chance(def.open);
    const replied = opened && chance(def.reply / def.open);
    const subjectIdx = def.subj[i % 2 === 0 ? 0 : 1];
    const e1 = {
      id: randomUUID(), owner_id: owner.id, contact_id: id, campaign_id: campaignId, kind: "cold_1", dedupe_key: `demo:${id}:1`,
      to_email: email, subject: SUBJECTS[subjectIdx].replace("{{club_name}}", club), subject_template: SUBJECTS[subjectIdx],
      html: "", text: `Hi ${first},\n\nI'm ${owner.name} with Waresport...`, send_at: ago(sentHours), sent_at: ago(sentHours), status: "sent",
      mailbox_id: box.id, thread_id: `demo-${id}`, open_count: opened ? 1 + Math.floor(rand() * 3) : 0,
      first_opened_at: opened ? ago(sentHours - 1) : null, last_opened_at: opened ? ago(Math.max(0.1, sentHours - 3)) : null,
      bounced_at: bounced ? ago(sentHours - 0.2) : null, replied_at: replied ? ago(sentHours - 4) : null,
    };
    emails.push(e1);
    if (opened) for (let k = 0; k < e1.open_count; k++) events.push({ id: randomUUID(), email_id: e1.id, contact_id: id, type: "open", created_at: ago(Math.max(0.1, sentHours - 1 - k)) });
    if (!replied && !bounced && sentHours > 72) {
      emails.push({ ...e1, id: randomUUID(), kind: "cold_2", dedupe_key: `demo:${id}:2`, subject: `Re: ${e1.subject}`, subject_template: `Re: ${SUBJECTS[subjectIdx]}`,
        send_at: ago(sentHours - 72), sent_at: ago(sentHours - 72), open_count: chance(0.3) ? 1 : 0, first_opened_at: null, last_opened_at: null, replied_at: null });
    }
    ccs.push({ id: randomUUID(), campaign_id: campaignId, contact_id: id, status: "done", attempts: 1, last_outcome: replied ? "replied" : "emailed" });

    if (bounced) {
      contacts.at(-1).email_bounced = true;
      inbound.push({ id: randomUUID(), mailbox_id: box.id, owner_id: owner.id, contact_id: id, email_id: e1.id, campaign_id: campaignId, provider_message_id: `demo-b-${id}`,
        from_email: "mailer-daemon@googlemail.com", subject: "Delivery Status Notification (Failure)", snippet: "Address not found", body_text: "Address not found",
        received_at: ago(sentHours - 0.2), intent: "bounce", intent_source: "rules", confidence: 0.95, status: "archived" });
    } else if (replied) {
      const r = rand();
      const intent = r < 0.38 ? "positive" : r < 0.58 ? "needs-info" : r < 0.85 ? "not-interested" : r < 0.95 ? "negative" : "out-of-office";
      const recent = rand() < 0.35;
      const received = recent ? ago(rand() * 6) : ago(sentHours - 4);
      const status = intent === "out-of-office" || intent === "negative" ? "archived" : recent ? "new" : pick(["replied", "replied", "archived", "new"]);
      const reply = TEMPLATE_REPLY[intent]?.(first, owner.name) ?? null;
      inbound.push({
        id: randomUUID(), mailbox_id: box.id, owner_id: owner.id, contact_id: id, email_id: e1.id, campaign_id: campaignId, provider_message_id: `demo-r-${id}`,
        thread_id: e1.thread_id, from_email: email, from_name: `${first} ${last}`, subject: `Re: ${e1.subject}`, snippet: pick(REPLIES[intent]),
        body_text: pick(REPLIES[intent]), received_at: received, intent, intent_source: "rules", confidence: 0.7,
        ai_summary: null, suggested_reply: reply, suggested_reply_source: reply ? "template" : null, status,
      });
      contacts.at(-1).stage = intent === "positive" || intent === "needs-info" ? "interested" : intent === "out-of-office" ? "contacted" : "not-interested";
      if (intent === "negative") contacts.at(-1).email_opt_out = true;
      if (intent === "positive") {
        const s = rand();
        const stage = s < 0.45 ? "positive" : s < 0.7 ? "demo-booked" : s < 0.85 ? "demo-held" : s < 0.95 ? "proposal" : "won";
        deals.push({ id: randomUUID(), owner_id: owner.id, contact_id: id, campaign_id: campaignId, stage, source: "reply",
          amount: stage === "proposal" ? 2199 : stage === "won" ? 1399 : null, recurring: stage === "won", stage_changed_at: ago(rand() * 48) });
        if (stage !== "positive") contacts.at(-1).stage = stage === "demo-booked" || stage === "demo-held" ? "demo-scheduled" : "interested";
      }
    } else if (opened && i % 9 === 0) {
      // Hot lead: several opens in the last few hours, no reply yet.
      for (let k = 0; k < 4; k++) events.push({ id: randomUUID(), email_id: e1.id, contact_id: id, type: "open", created_at: ago(rand() * 5) });
      e1.open_count += 4;
      e1.last_opened_at = ago(0.1);
    }
  }
}

const chunks = (a, size = 500) => Array.from({ length: Math.ceil(a.length / size) }, (_, i) => a.slice(i * size, i * size + size));
const norm = (rows) => {
  const keys = [...new Set(rows.flatMap(Object.keys))];
  return rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k] ?? null])));
};
const fill = (rows, defaults) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v ?? defaults[k] ?? null])));
for (const c of chunks(fill(norm(contacts), { email_bounced: false, email_opt_out: false }))) await sql`insert into contacts ${sql(c)}`;
for (const c of chunks(ccs)) await sql`insert into campaign_contacts ${sql(c)}`;
for (const c of chunks(norm(emails))) await sql`insert into emails ${sql(c)}`;
for (const c of chunks(events)) await sql`insert into email_events ${sql(c)}`;
for (const c of chunks(norm(inbound))) await sql`insert into inbound_messages ${sql(c)}`;
if (deals.length) await sql`insert into deals ${sql(deals)}`;

// A few dedup blocks: interns' campaigns skipping prospects the sales reps already emailed.
const blocks = contacts.filter((c) => c.owner_id === team[3].id || c.owner_id === team[4].id).slice(0, 3).map((c, i) => ({
  id: randomUUID(), contact_id: c.id, campaign_id: campaignsDef[i % 2 ? 3 : 1].id, blocked_user_id: c.owner_id,
  prior_user_id: team[1 + (i % 2)].id, prior_contact_at: ago(24 * (2 + i * 3)), channel: "email",
}));
await sql`insert into dedup_blocks ${sql(blocks)}`;

console.log(`Demo workspace created: ${team.length} users, ${contacts.length} contacts, ${emails.length} emails, ${inbound.length} replies, ${deals.length} deals.`);
console.log("Sign in as admin@demo.waresport.com / demo-password (or any teammate's demo email with the same password).");
await sql.end();
