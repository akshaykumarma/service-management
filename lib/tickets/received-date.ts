// The stores' own calendar (India, UTC+5:30) decides what "today" and "the future" mean.
const BUSINESS_TIME_ZONE = "Asia/Kolkata";
const isoDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type ReceivedAtResult = { ok: true; receivedAt: Date } | { ok: false; error: "invalid_received_date" | "received_date_in_future" };

/**
 * Resolves the optional back-dated "received on" date entered at intake (post-v1 product
 * feedback: a machine dropped off earlier can be logged later). Input is a plain
 * YYYY-MM-DD calendar date in the stores' time zone. Today (or no date at all) means
 * "now", keeping the real time of day; an earlier date is stored at midday IST that day,
 * since only the date was given. A future date is rejected.
 */
export function resolveReceivedAt(input: unknown, now: Date = new Date()): ReceivedAtResult {
  if (input === undefined || input === null || input === "") return { ok: true, receivedAt: now };
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return { ok: false, error: "invalid_received_date" };
  }

  const receivedAt = new Date(`${input}T12:00:00+05:30`);
  // Rejects impossible dates like 2026-02-31, which Date would otherwise roll forward.
  if (Number.isNaN(receivedAt.getTime()) || isoDateFormat.format(receivedAt) !== input) {
    return { ok: false, error: "invalid_received_date" };
  }

  const today = isoDateFormat.format(now);
  if (input > today) return { ok: false, error: "received_date_in_future" };
  if (input === today) return { ok: true, receivedAt: now };
  return { ok: true, receivedAt };
}

/** Today's date (YYYY-MM-DD) in the stores' time zone, e.g. for a date picker's max. */
export function todayInBusinessTimeZone(now: Date = new Date()): string {
  return isoDateFormat.format(now);
}
