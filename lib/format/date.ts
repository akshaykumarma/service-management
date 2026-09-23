/** dd/mm/yyyy — this app's one date format, everywhere, regardless of browser/OS locale. */
export function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/** dd/mm/yyyy, HH:mm — same date format, plus a 24-hour time. */
export function formatDateTime(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(d)}, ${hh}:${min}`;
}
