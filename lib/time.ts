export type ZonedParts = { y: number; m: number; d: number; hour: number; minute: number; weekday: number };

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function dtf(tz: string) {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", weekday: "short",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function zonedParts(date: Date, tz: string): ZonedParts & { second: number } {
  const p = Object.fromEntries(dtf(tz).formatToParts(date).map((x) => [x.type, x.value]));
  return {
    y: +p.year, m: +p.month, d: +p.day, hour: +p.hour, minute: +p.minute, second: +p.second,
    weekday: WEEKDAYS[p.weekday],
  };
}

function offsetMs(tz: string, date: Date) {
  const p = zonedParts(date, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Converts a wall-clock time in `tz` to a UTC instant. Day overflow (d = 32) is allowed. */
export function zonedToUtc(y: number, m: number, d: number, hour: number, minute: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const off1 = offsetMs(tz, new Date(guess));
  let ts = guess - off1;
  const off2 = offsetMs(tz, new Date(ts));
  if (off2 !== off1) ts = guess - off2;
  return new Date(ts);
}

export function parseHHMM(value: string): [number, number] {
  const [h, m] = value.split(":").map(Number);
  return [h || 0, m || 0];
}

export function isWeekday(date: Date, tz: string) {
  const w = zonedParts(date, tz).weekday;
  return w >= 1 && w <= 5;
}

/** Start and end of the local calling window on the same local day as `date`. */
export function windowOnDay(date: Date, tz: string, start: string, end: string) {
  const p = zonedParts(date, tz);
  const [sh, sm] = parseHHMM(start);
  const [eh, em] = parseHHMM(end);
  return { start: zonedToUtc(p.y, p.m, p.d, sh, sm, tz), end: zonedToUtc(p.y, p.m, p.d, eh, em, tz) };
}

export function localDayBounds(date: Date, tz: string) {
  const p = zonedParts(date, tz);
  return { start: zonedToUtc(p.y, p.m, p.d, 0, 0, tz), end: zonedToUtc(p.y, p.m, p.d + 1, 0, 0, tz) };
}

/** `time` (HH:MM, local to tz) on the Nth business day after `date`. */
export function businessDaysLater(date: Date, days: number, tz: string, time: string): Date {
  const p = zonedParts(date, tz);
  const [h, m] = parseHHMM(time);
  let offset = 0;
  let added = 0;
  let candidate = zonedToUtc(p.y, p.m, p.d, h, m, tz);
  while (added < days) {
    offset++;
    candidate = zonedToUtc(p.y, p.m, p.d + offset, h, m, tz);
    if (isWeekday(candidate, tz)) added++;
  }
  return candidate;
}

/** Keeps the time-of-day of `date` but moves it N business days later (N = 0 returns `date`). */
export function shiftBusinessDays(date: Date, days: number, tz: string): Date {
  if (days <= 0) return date;
  const p = zonedParts(date, tz);
  return businessDaysLater(date, days, tz, `${p.hour}:${p.minute}`);
}

export function formatInTz(date: Date, tz: string) {
  return {
    date: date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz }),
    time: date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: tz }),
  };
}

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const STATE_TZ: Record<string, string> = {
  AL: "America/Chicago", AK: "America/Anchorage", AZ: "America/Phoenix", AR: "America/Chicago",
  CA: "America/Los_Angeles", CO: "America/Denver", CT: "America/New_York", DE: "America/New_York",
  DC: "America/New_York", FL: "America/New_York", GA: "America/New_York", HI: "Pacific/Honolulu",
  ID: "America/Boise", IL: "America/Chicago", IN: "America/Indiana/Indianapolis", IA: "America/Chicago",
  KS: "America/Chicago", KY: "America/New_York", LA: "America/Chicago", ME: "America/New_York",
  MD: "America/New_York", MA: "America/New_York", MI: "America/Detroit", MN: "America/Chicago",
  MS: "America/Chicago", MO: "America/Chicago", MT: "America/Denver", NE: "America/Chicago",
  NV: "America/Los_Angeles", NH: "America/New_York", NJ: "America/New_York", NM: "America/Denver",
  NY: "America/New_York", NC: "America/New_York", ND: "America/Chicago", OH: "America/New_York",
  OK: "America/Chicago", OR: "America/Los_Angeles", PA: "America/New_York", RI: "America/New_York",
  SC: "America/New_York", SD: "America/Chicago", TN: "America/Chicago", TX: "America/Chicago",
  UT: "America/Denver", VT: "America/New_York", VA: "America/New_York", WA: "America/Los_Angeles",
  WV: "America/New_York", WI: "America/Chicago", WY: "America/Denver", PR: "America/Puerto_Rico",
};

const STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY",
  louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH",
  "new jersey": "NJ", "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND",
  ohio: "OH", oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "puerto rico": "PR",
};

export function normalizeState(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (/^[A-Za-z]{2}$/.test(t) && STATE_TZ[t.toUpperCase()]) return t.toUpperCase();
  return STATE_NAMES[t.toLowerCase()] ?? null;
}

/** Best-effort US state from a contact's state, address ("..., TX 78701") or city ("Austin, TX"). */
export function inferState(c: { state?: string | null; address?: string | null; city?: string | null }): string | null {
  const direct = normalizeState(c.state);
  if (direct) return direct;
  const fromAddress = c.address?.match(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/);
  if (fromAddress && STATE_TZ[fromAddress[1]]) return fromAddress[1];
  if (c.city) {
    const parts = c.city.split(",").map((s) => s.trim());
    for (const part of parts.reverse()) {
      const s = normalizeState(part);
      if (s) return s;
    }
  }
  return null;
}

export function contactTimeZone(
  c: { state?: string | null; address?: string | null; city?: string | null },
  fallback: string
): string {
  const s = inferState(c);
  return (s && STATE_TZ[s]) || fallback;
}
