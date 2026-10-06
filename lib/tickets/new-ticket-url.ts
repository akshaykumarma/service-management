/**
 * The New Ticket page with a fresh `n` each time, so opening it while already on it (e.g.
 * right after creating a ticket) remounts the form instead of keeping the "created"
 * screen — the page keys its form on this value.
 */
export function freshNewTicketUrl(): string {
  return `/tickets/new?n=${Date.now()}`;
}
