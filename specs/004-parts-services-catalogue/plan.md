# Implementation Plan: Parts & Services Selection, Billing, and Catalogue Maintenance

**Branch**: `004-parts-services-catalogue` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-parts-services-catalogue/spec.md`

## Summary

Build a global (not per-store) parts/services catalogue maintained by the Super Admin, a
ticket line-item mechanism that snapshots unit cost at selection time, automatic
subtotal/tax/total bill calculation, and a permanent line-item lock the first time a ticket
reaches "Completed" (this spec's own clarification, FR-015) — the lock survives any later
backward transition `003-ticket-lifecycle` allows.

Third feature planned; continues the stack `002-auth-rbac` established (Next.js,
PostgreSQL, Drizzle, Docker Compose) and extends `003-ticket-lifecycle`'s `tickets` table
relationship without modifying that table's schema (see Technical Context).

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS (unchanged)

**Primary Dependencies**: Next.js 14+ (App Router) · Drizzle ORM · `pg` driver ·
`csv-parse` for bulk CSV import (streaming, well-maintained, Node-native) · reuses
`assertAccess()` from `002-auth-rbac`

**Storage**: PostgreSQL 15+ — new tables `parts`, `services`, `ticket_line_items`; no
change to `003-ticket-lifecycle`'s `tickets` table (see Decision below on how the
Completed-lock is determined without a new column there)

**Testing**: Vitest + Playwright, consistent with prior features

**Target Platform**: Same Docker Compose deployment; no new services needed

**Project Type**: Same single Next.js project; adds `lib/catalogue/`, `lib/billing/`, and
`app/api/catalogue/*` / `app/api/tickets/[id]/line-items/*`

**Performance Goals**: Bill recalculation on every line-item change must stay well within
the constitution's <500ms p95 — it's a sum over a handful of rows per ticket, not a
cross-ticket aggregate

**Constraints**: Money values MUST use exact decimal arithmetic (PostgreSQL `NUMERIC`, not
floating point) to avoid the rounding errors that would violate SC-001's "zero calculation
discrepancies"; zero/negative quantities rejected (FR-002); the Completed-lock (FR-015)
must hold regardless of how many times a ticket revisits "Completed" or moves backward
afterward

**Scale/Scope**: Global catalogue — expected to be small (tens to low hundreds of parts,
fewer services), not a factor in the ~1,000 tickets/store/month scale target; line items
scale with tickets, a handful per ticket

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Test-First (NON-NEGOTIABLE) | Same TDD discipline as prior features — failing test before implementation, sequenced in `/speckit-tasks`. | PASS |
| II. Simplicity & YAGNI | The Completed-lock is a derived check (`EXISTS ... status_history WHERE to_status = 'completed'`), not a new column/trigger/event-sourcing mechanism on another feature's table — avoids cross-feature schema coupling for a fact `003-ticket-lifecycle`'s own history already records. No generic "pricing rules engine" — tax is a single per-store percentage multiplication, matching spec's actual requirement, not a hypothetical future tax-rule system. | PASS |
| III. API/Contract-First Design | `contracts/catalogue-billing-api.md` defines every endpoint before implementation. | PASS |
| IV. Security & Observability by Default | Catalogue mutation routes reuse `assertAccess()` (Super-Admin-only, FR-009/FR-014); exact-decimal (`NUMERIC`) arithmetic is a correctness/observability concern — a bill discrepancy that can't be explained is exactly the kind of silent failure this principle exists to prevent. | PASS |
| Non-Functional Service Levels | <500ms p95 achievable (small per-ticket row counts); no scalability concern at catalogue's expected size. | PASS |

No violations — Complexity Tracking is empty.

**Post-Design Re-Check** (after Phase 1): all five rows still PASS. `data-model.md`
confirms `ticket_line_items.unit_cost`/`line_total` and all bill fields use `NUMERIC`, the
Completed-lock check queries `003-ticket-lifecycle`'s existing `status_history` table
(read-only, no schema change to it), and `contracts/catalogue-billing-api.md` was written
before any implementation task exists.

## Project Structure

### Documentation (this feature)

```text
specs/004-parts-services-catalogue/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── catalogue-billing-api.md
└── tasks.md             # /speckit-tasks output — not created by this command
```

### Source Code (repository root)

```text
app/
├── api/
│   ├── catalogue/
│   │   ├── parts/route.ts               # Super Admin: list/create parts
│   │   ├── parts/[id]/route.ts          # edit/deactivate
│   │   ├── parts/import/route.ts        # CSV bulk import
│   │   └── services/route.ts            # list/create/edit/deactivate services
│   └── tickets/
│       └── [id]/
│           └── line-items/
│               ├── route.ts             # POST add a line item
│               └── [lineItemId]/route.ts # PATCH quantity / DELETE
└── (dashboard)/
    └── admin/
        └── catalogue/page.tsx           # Super Admin catalogue maintenance UI

lib/
├── db/
│   └── schema.ts                        # extended: parts, services, ticket_line_items
├── catalogue/
│   ├── parts.ts                         # CRUD + deactivation
│   ├── services.ts                      # CRUD + deactivation
│   └── csv-import.ts                    # parse + validate + report per-row failures
└── billing/
    ├── line-items.ts                    # add/update/remove, enforcing the Completed-lock
    ├── bill-calculation.ts              # subtotal/tax/total, NUMERIC-safe arithmetic
    └── completed-lock.ts                # the EXISTS-against-status_history check

tests/
├── contract/
│   └── catalogue-billing-api.test.ts
├── integration/
│   ├── bill-calculation.test.ts         # US1 scenarios incl. tax
│   ├── catalogue-maintenance.test.ts    # US2 scenarios incl. CSV import
│   ├── price-snapshot.test.ts           # US3 scenarios
│   └── completed-lock.test.ts           # FR-015 incl. backward-transition case
└── e2e/
    └── apply-parts-to-ticket.spec.ts
```

**Structure Decision**: Extends the same single Next.js project. This feature owns `parts`,
`services`, and `ticket_line_items` tables; it reads (never writes) `003-ticket-lifecycle`'s
`tickets` and `status_history` tables, and reads (never writes) `007-admin-console`'s
`stores` table for tax rate — a read-only cross-feature dependency, not a schema coupling.

## Complexity Tracking

*No entries — no Constitution Check violations to justify.*
