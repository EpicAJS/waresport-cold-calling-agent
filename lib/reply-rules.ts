import type { ReplyIntent } from "@/lib/db/schema";

const BOUNCE_FROM = /^(mailer-daemon|postmaster|mail-daemon|bounce[s]?)@/i;
const BOUNCE_SUBJECT = /undeliverable|delivery status notification|mail delivery (failed|subsystem)|returned mail|delivery (has )?failed|delivery failure|address not found|couldn'?t be delivered/i;
const OOO = /out of (the )?office|automatic reply|auto[- ]?reply|autoreply|on vacation|on leave|away from (the |my )?(office|desk)|limited access to (my )?email|currently out/i;
const NEGATIVE = /unsubscribe|remove me|take me off|stop (emailing|contacting|sending)|do not (contact|email)|don'?t (contact|email)|this is spam|reported as spam|leave us alone/i;
const NOT_INTERESTED = /not interested|no thanks|no thank you|not (a )?(good )?fit|we('re| are) (all )?set|already (use|have|using|working with)|not at this time|not right now|not now|maybe (later|next (season|year))|pass on this|no need|happy with (our|what)/i;
const POSITIVE = /\binterested\b|sounds (good|great|interesting)|let'?s (talk|chat|connect|set (something|it) up|schedule|do it)|happy to (chat|talk|connect|learn)|would love|book(ed)? a (time|call|demo)|schedule (a )?(call|demo|time)|set up a (call|demo)|send (me )?(a|the) (link|invite)|\bdemo\b|call me|i'?m available|works for me|tell me more/i;
const NEEDS_INFO = /\?|more (info|information|details)|pricing|price|cost|how much|how does|what does|send (me|over|us)|can you (explain|share)|brochure|case stud/i;

export function isBounce(fromEmail: string, subject: string) {
  return BOUNCE_FROM.test(fromEmail) || BOUNCE_SUBJECT.test(subject);
}

/** Pulls the failed recipient out of a bounce notice. */
export function bouncedRecipient(text: string, headers: Record<string, string>) {
  const h = headers["x-failed-recipients"];
  if (h) return h.split(",")[0].trim().toLowerCase();
  const m = text.match(/(?:final-recipient:\s*rfc822;\s*|delivered to\s+|wasn'?t delivered to\s+|to these recipients[^:]*:\s*)<?([^\s<>;]+@[^\s<>;]+)>?/i)
    ?? text.match(/<?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>?\s*(?:\(|:)?\s*(?:address not found|user unknown|does not exist|mailbox unavailable)/i);
  return m ? m[1].replace(/[.,]$/, "").toLowerCase() : null;
}

export function classifyByRules(fromEmail: string, subject: string, body: string): { intent: ReplyIntent; confidence: number } {
  if (isBounce(fromEmail, subject)) return { intent: "bounce", confidence: 0.95 };
  const text = `${subject}\n${body}`;
  if (OOO.test(text)) return { intent: "out-of-office", confidence: 0.85 };
  if (NEGATIVE.test(body)) return { intent: "negative", confidence: 0.8 };
  if (NOT_INTERESTED.test(body)) return { intent: "not-interested", confidence: 0.7 };
  if (POSITIVE.test(body)) return { intent: "positive", confidence: 0.6 };
  if (NEEDS_INFO.test(body)) return { intent: "needs-info", confidence: 0.55 };
  return { intent: "other", confidence: 0.3 };
}

export function templateReply(intent: ReplyIntent, v: { firstName: string; repName: string; bookingLink: string; companyName: string }) {
  const link = v.bookingLink ? `\n\n${v.bookingLink}` : "";
  switch (intent) {
    case "positive":
      return `Hi ${v.firstName},\n\nGreat to hear from you! Here's a link to grab a 15-minute slot that works for you:${link || "\n\n(Reply with a couple of times that work and I'll send an invite.)"}\n\nLooking forward to it,\n${v.repName}`;
    case "needs-info":
      return `Hi ${v.firstName},\n\nThanks for the question! ${v.companyName} brings registrations, scheduling, and payments into one platform — most clubs save 15–20 hours a week on admin. The easiest way to see if it fits is a quick walkthrough:${link || " just reply with a time that works."}\n\nHappy to answer anything else here too.\n\n${v.repName}`;
    case "not-interested":
      return `Hi ${v.firstName},\n\nThanks for letting me know — I'll close the loop on my end. If anything changes down the road, I'm always happy to help.\n\nBest,\n${v.repName}`;
    default:
      return "";
  }
}
