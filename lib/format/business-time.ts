// The stores' own calendar (India, UTC+5:30) — what "this month" means for the boards.
const BUSINESS_TIME_ZONE = "Asia/Kolkata";
const yearMonthFormat = new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit" });

export function isCurrentBusinessMonth(date: Date, now: Date = new Date()): boolean {
  return yearMonthFormat.format(date) === yearMonthFormat.format(now);
}
