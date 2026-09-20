# Quickstart: Validating the Kanban Board, Ticket Detail View & Reporting

Validation guide — see `data-model.md` and `contracts/board-reporting-api.md` for exact
shapes. Assumes `002`-`005` and `007` are running with seeded tickets across multiple
stores and statuses.

## Scenario 1 — Board scoping and auto-refresh (User Story 1)

```bash
curl -b sm-store-a-cookies.txt http://localhost:3000/api/tickets
# Expect: only Store A's tickets

curl -b admin-cookies.txt http://localhost:3000/api/tickets
# Expect: tickets from all of that Admin's assigned stores
```

Open the board UI in two browser sessions; change a ticket's status in one, and confirm
the other reflects it within 30 seconds without a manual refresh (SC-002).

## Scenario 2 — Drag-and-drop, including keyboard (User Story 2)

Drag a card to a valid next-status column via mouse — confirm the status updates and
matches `003-ticket-lifecycle`'s transition rules exactly (invalid transitions are
rejected, e.g., dragging an "Open" card straight to "Delivered").

**Accessibility check**: using keyboard only (Tab to the card, then `@dnd-kit`'s documented
keyboard drag activation), move a card to a different column — confirm it works
identically to the pointer path. This is worth its own Playwright test
(`tests/integration/drag-and-drop.test.ts`) given the constitution's WCAG 2.1 AA
requirement.

Attempt a drag that requires a mandatory comment (e.g., a backward transition) — confirm a
comment prompt appears as part of the drag interaction, not a silent failure.

## Scenario 3 — Filters (User Story 3)

```bash
curl -b sm-cookies.txt "http://localhost:3000/api/tickets?customerName=Sharma"
# Expect: matches tickets whose OWN historical name field contains "Sharma"
```

Correct that customer's name via a new ticket for the same phone number (per `003`'s
Customer entity), then repeat the search for the OLD name — expect the older ticket still
matches (SC-008 — filter uses per-ticket historical name, not the corrected canonical name).

Apply store + status + date-range filters together — confirm only tickets matching *all*
of them appear (FR-009). Apply a filter combination matching nothing — confirm a clear
empty state, not a broken/loading-forever appearance (FR-016).

## Scenario 4 — Ticket detail with consolidated audit trail (User Story 4)

Open a ticket that has been through intake, a status change, a part applied, a completion
notification, and OTP delivery. Confirm `GET /api/tickets/:id/audit-trail` shows all of
it — one entry per status change, one per line-item addition, one per notification/OTP
event — in chronological order, each attributed to an actor and timestamp (SC-005).

## Scenario 5 — Summary report and export (User Story 5)

```bash
curl -b admin-cookies.txt "http://localhost:3000/api/reports/summary?storeId=<id>&dateFrom=2026-09-01&dateTo=2026-09-30"
# Expect: totalTickets counts only tickets whose FIRST Completed timestamp falls in September
# (not tickets merely created in September but completed in October — SC-006)
```

Create a ticket in September, complete it in October — confirm it appears in October's
report, not September's.

```bash
curl -b admin-cookies.txt "http://localhost:3000/api/reports/export?format=csv&storeId=<id>&dateFrom=...&dateTo=..." -o report.csv
curl -b admin-cookies.txt "http://localhost:3000/api/reports/export?format=pdf&storeId=<id>&dateFrom=...&dateTo=..." -o report.pdf
```

Confirm both files' contents match the on-screen filtered list/summary exactly.

**RBAC**: repeat both `GET /api/reports/*` calls as a Store Service Manager — expect `403`.

## Success criteria checklist (from spec.md)

- [ ] SC-001: Scenario 3's filters locate a specific ticket in well under 30 seconds
- [ ] SC-002: Scenario 1's auto-refresh check passes
- [ ] SC-003: Scenario 2's invalid-transition drag is rejected 100% of the time
- [ ] SC-004: Scenario 5's export requires no manual spreadsheet work
- [ ] SC-005: Scenario 4's audit trail has zero gaps against what `003`-`005` recorded
- [ ] SC-006: Scenario 5's September/October attribution check passes
- [ ] SC-007: the reported `avgResolutionTimeHours` excludes post-Completed pickup wait
- [ ] SC-008: Scenario 3's name-correction check passes
