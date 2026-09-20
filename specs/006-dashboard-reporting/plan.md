# Implementation Plan: Kanban Board, Ticket Detail View & Reporting

**Branch**: `006-dashboard-reporting` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-dashboard-reporting/spec.md`

## Summary

Build the kanban board (with drag-and-drop status changes), filtered ticket search, a
consolidated ticket detail/audit view, and CSV/PDF summary reporting — entirely as a
**read/interaction layer over data `002`-`005` already capture**. This spec's Key Entities
(Board View, Ticket Card, Filter Selection, Summary Report, Export) are all derived/view
concepts; this feature introduces **zero new persisted tables**, only queries, aggregation,
and UI.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS (unchanged)

**Primary Dependencies**: Next.js 14+ (App Router) · Drizzle ORM (read queries only from
this feature's own code — writes go through `003`'s existing status-transition function,
never a duplicate write path) · **`@dnd-kit/core`** for drag-and-drop (chosen specifically
for its built-in keyboard-accessible drag interaction, relevant to the constitution's WCAG
2.1 AA requirement — unlike raw HTML5 drag-and-drop or the unmaintained
`react-beautiful-dnd`) · **`pdfkit`** for PDF report generation (lightweight, no headless
browser needed — appropriate for the constitution's small self-hosted VPS target, unlike
Puppeteer) · **`csv-stringify`** for CSV export (same maintainer family as `csv-parse`,
already a dependency via `004`/`007`'s bulk import) · client-side polling (`setInterval` /
a data-fetching library's `refetchInterval`) for the 30-second auto-refresh — no
websockets/SSE, per `005-customer-notifications`'s own research (§7), which this feature is
the one that actually implements

**Storage**: PostgreSQL 15+ — **no new tables**. All queries against `002`'s
`users`/`user_stores`, `003`'s `tickets`/`status_history`/`customers`, `004`'s
`ticket_line_items`, and `005`'s `notifications`/`otp_verifications`/`delivery_overrides`

**Testing**: Vitest + Playwright, consistent with prior features; Playwright specifically
covers the drag-and-drop interaction (both pointer and keyboard) per the accessibility
requirement above

**Target Platform**: Same Docker Compose deployment; no new services

**Project Type**: Same single Next.js project; adds `lib/board/`, `lib/reporting/`, and
`app/(dashboard)/board/`, `app/(dashboard)/reports/`

**Performance Goals**: Board load and filter queries must meet the constitution's <500ms
p95 — achieved via indexes already implied by `003`'s schema (store_id, status,
machine_model) plus one additional index this feature's migration adds on
`tickets.customer_name` for the name filter (`research.md` §3)

**Constraints**: The "first Completed" timestamp this feature's reports need is the exact
same derived fact `004`'s bill-lock and `005`'s once-only-notification already compute
independently — this plan notes the duplication rather than silently accepting it
(`research.md` §1) since it's now needed by three features; drag-and-drop must have a
non-drag fallback (the ticket detail view's own status controls from `003`) so keyboard/
assistive-technology users are never limited to a pointer-only interaction

**Scale/Scope**: Board/report queries run against ~10,000 tickets/month platform-wide at
full scale (constitution) — filtered queries, not full-table scans, at every step

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Test-First (NON-NEGOTIABLE) | Same TDD discipline; Playwright covers both pointer and keyboard drag-and-drop paths. | PASS |
| II. Simplicity & YAGNI | Zero new tables — this feature is a query/view layer, the simplest possible shape for what spec.md describes. Client-side polling (not websockets) for the 30-second refresh, matching `005`'s own precedent against building push infrastructure nobody's latency target requires. | PASS |
| III. API/Contract-First Design | `contracts/board-reporting-api.md` defines every endpoint before implementation. | PASS |
| IV. Security & Observability by Default | Every query scoped through `assertAccess()`/`002`'s store-visibility rules — the filter's store options and the board's contents are the *same* scoping logic, not two independent implementations that could drift apart (`research.md` §2). | PASS |
| Non-Functional Service Levels | WCAG 2.1 AA drives the `@dnd-kit` choice specifically; <500ms p95 addressed via the one new index this feature adds. | PASS |

No violations — Complexity Tracking is empty.

**Post-Design Re-Check** (after Phase 1): all five rows still PASS. `data-model.md`
confirms no new tables, one new index, and that filter-scoping and board-scoping share one
query function rather than two.

## Project Structure

### Documentation (this feature)

```text
specs/006-dashboard-reporting/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── board-reporting-api.md
└── tasks.md             # /speckit-tasks output — not created by this command
```

### Source Code (repository root)

```text
app/
├── api/
│   ├── tickets/route.ts                 # extended (already exists from 003): adds filter
│   │                                     # query params per this spec's FR-008/FR-009
│   ├── reports/
│   │   ├── summary/route.ts             # GET per-store summary for a date range
│   │   └── export/route.ts              # GET filtered-list export (csv|pdf query param)
│   └── tickets/[id]/audit-trail/route.ts # GET consolidated cross-feature audit view
└── (dashboard)/
    ├── board/page.tsx                   # kanban board, drag-and-drop, filters, 30s poll
    ├── tickets/[id]/page.tsx            # extended (from 003): adds all detail-view sections
    └── reports/page.tsx                 # summary report + export UI

lib/
├── board/
│   ├── ticket-query.ts                  # the ONE scoped query function board + filters + API list share
│   └── card-shape.ts                    # projects a ticket row into the board-card fields
├── reporting/
│   ├── first-completed.ts               # shared "first reached Completed" timestamp query
│   │                                    # (research.md §1 — this feature's version of the
│   │                                    #  logic 004 and 005 each independently implement)
│   ├── summary.ts                       # aggregation: counts, resolution time, revenue
│   ├── csv-export.ts
│   └── pdf-export.ts
└── audit/
    └── consolidated-trail.ts            # merges status_history + notifications + line-item
                                         # events into one chronological audit view

tests/
├── contract/
│   └── board-reporting-api.test.ts
├── integration/
│   ├── board-scoping.test.ts            # US1 role/store scoping
│   ├── drag-and-drop.test.ts            # US2, incl. keyboard path
│   ├── filters.test.ts                  # US3, incl. Customer Name matching per-ticket name
│   ├── ticket-detail-audit.test.ts      # US4
│   └── summary-report.test.ts           # US5, incl. first-Completed attribution & resolution time
└── e2e/
    └── board-to-report.spec.ts
```

**Structure Decision**: Extends the same single Next.js project, adding no new tables.
`lib/reporting/first-completed.ts` is written here but is functionally identical to logic
already inline in `004`'s `completed-lock.ts` and `005`'s completion-notification trigger
check — flagged as a follow-up consolidation opportunity in `research.md` §1 rather than
retroactively changing those two already-planned features within this command's scope.

## Complexity Tracking

*No entries — no Constitution Check violations to justify.*
