import type { EmailTemplate, EmailTemplates } from "@/lib/db/schema";

export const TEMPLATE_VARIABLES = [
  "club_name", "contact_name", "rep_name", "rep_email", "company_name",
  "booking_link", "demo_date", "demo_time",
] as const;

export type TemplateVars = Partial<Record<(typeof TEMPLATE_VARIABLES)[number], string>>;

export const DEFAULT_TEMPLATES: EmailTemplates = {
  booking_link: {
    subject: "Pick a time for your {{company_name}} demo",
    body: `Hi {{contact_name}},

Thanks for taking the call today! As promised, here's the link to book a quick 15-minute demo at a time that works for you:

{{booking_link}}

We'll show you how {{company_name}} helps clubs like {{club_name}} save 15–20 hours a week on registrations, scheduling, and payments — all in one platform.

Looking forward to it,
{{rep_name}}`,
  },
  reminder_24h: {
    subject: "Reminder: your {{company_name}} demo is tomorrow",
    body: `Hi {{contact_name}},

Just a reminder that your {{company_name}} demo is tomorrow, {{demo_date}} at {{demo_time}}.

If you need to move it, just reply to this email.

See you then,
{{rep_name}}`,
  },
  reminder_1h: {
    subject: "Starting in 1 hour: your {{company_name}} demo",
    body: `Hi {{contact_name}},

Your {{company_name}} demo starts in about an hour, at {{demo_time}}. Talk soon!

{{rep_name}}`,
  },
  post_demo: [
    {
      delay_hours: 24,
      subject: "Thanks for your time — next steps with {{company_name}}",
      body: `Hi {{contact_name}},

Thanks again for joining the demo yesterday. Do you have any questions, or would you like us to set up a free trial so your team can explore {{company_name}} at your own pace?

Just reply here and I'll get back to you quickly.

Best,
{{rep_name}}`,
    },
    {
      delay_hours: 72,
      subject: "Any questions after your {{company_name}} demo?",
      body: `Hi {{contact_name}},

I wanted to circle back in case any questions came up. Many club directors find the biggest wins come from automating registration renewals and payment reminders — tasks that often eat 5–10 hours a week.

Happy to show you exactly how this would look for {{club_name}}. Just reply when you're ready.

Best,
{{rep_name}}`,
    },
  ],
  post_call: [
    {
      delay_days: 0,
      subject: "Following up from {{company_name}}",
      body: `Hi {{contact_name}},

We tried to reach {{club_name}} by phone today. {{company_name}} helps sports clubs manage registrations, scheduling, and payments in one place — saving 15–20 hours a week on admin.

If it's worth a quick look, you can grab a 15-minute slot here:
{{booking_link}}

Best,
{{rep_name}}`,
    },
    {
      delay_days: 3,
      subject: "Quick question for {{club_name}}",
      body: `Hi {{contact_name}},

How is {{club_name}} handling registrations and payments today? If it's spreadsheets and email chains, we can probably save your team a lot of time.

Here's my calendar if you'd like a quick demo:
{{booking_link}}

{{rep_name}}`,
    },
    {
      delay_days: 7,
      subject: "Last note from {{company_name}}",
      body: `Hi {{contact_name}},

I don't want to crowd your inbox, so this is my last note. If simplifying club admin becomes a priority, you can book a time with me anytime:
{{booking_link}}

All the best,
{{rep_name}}`,
    },
  ],
  cold: [
    {
      delay_days: 0,
      subject: "Saving {{club_name}} 15+ hours a week on admin",
      body: `Hi {{contact_name}},

I'm {{rep_name}} with {{company_name}}. We help sports clubs run registrations, scheduling, and payments from one platform — most clubs save 15–20 hours a week.

Would a 15-minute demo be worthwhile? You can pick a time here:
{{booking_link}}

Best,
{{rep_name}}`,
    },
    {
      delay_days: 3,
      subject: "Re: Saving {{club_name}} 15+ hours a week on admin",
      body: `Hi {{contact_name}},

Just bumping this up in case it got buried. Happy to show you how {{company_name}} would work for {{club_name}} in a quick call:
{{booking_link}}

{{rep_name}}`,
    },
    {
      delay_days: 7,
      subject: "Should I close the loop?",
      body: `Hi {{contact_name}},

I haven't heard back, so I'll assume the timing isn't right. If that changes, my calendar is always open:
{{booking_link}}

Thanks,
{{rep_name}}`,
    },
  ],
};

export function withDefaults(t: Partial<EmailTemplates> | null | undefined): EmailTemplates {
  return { ...DEFAULT_TEMPLATES, ...(t ?? {}) };
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fill(text: string, vars: TemplateVars, transform: (s: string) => string = (s) => s) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => transform(vars[key as keyof TemplateVars] ?? ""));
}

function linkify(escaped: string) {
  return escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
}

export function renderEmail(
  tpl: EmailTemplate,
  vars: TemplateVars,
  footer: { companyName: string; mailingAddress: string; unsubscribeUrl: string }
) {
  const subject = fill(tpl.subject, vars).replace(/\s+/g, " ").trim();
  const text = fill(tpl.body, vars).trim();
  const paragraphs = fill(tpl.body, vars, escapeHtml)
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${linkify(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");

  const footerLines = [footer.companyName, footer.mailingAddress].filter(Boolean).map(escapeHtml).join(" · ");
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111827">${paragraphs}<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px"/><p style="font-size:12px;color:#6b7280;margin:0">${footerLines}<br/>Don't want these emails? <a href="${footer.unsubscribeUrl}" style="color:#6b7280">Unsubscribe</a>.</p></div>`;
  const textFooter = `\n\n--\n${[footer.companyName, footer.mailingAddress].filter(Boolean).join(" · ")}\nUnsubscribe: ${footer.unsubscribeUrl}`;

  return { subject, html, text: text + textFooter };
}
