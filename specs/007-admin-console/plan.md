# Implementation Plan: Machine Model & Store Administration Console

**Branch**: `007-admin-console` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-admin-console/spec.md`

## Summary

Build Super-Admin-only CRUD for machine models (bulk CSV import) and stores (with tax
rate, WhatsApp contact number, active/inactive state), plus a convenience UI on the store
screen for the Admin-store assignment capability `002-auth-rbac` already owns. This feature
is the **canonical owner** of the `stores` table that `002`, `003`, `004`, and `005` have
all referenced as a read-only cross-feature dependency (some via a minimal stub) — this
plan's first job is reconciling that stub into the full schema spec.md requires, not
creating a competing table.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS (unchanged)

**Primary Dependencies**: Next.js 14+ (App Router) · Drizzle ORM · `pg` driver ·
`csv-parse` (already used in `004`, reused here for machine-model bulk import) · reuses
`assertAccess()` from `002-auth-rbac`

**Storage**: PostgreSQL 15+ — **extends** the existing `stores` table (created as a minimal
stub by `003-ticket-lifecycle`'s migration, per that feature's plan) with this spec's full
column set, via an `ALTER TABLE` migration rather than a new table; adds a new
`machine_models` table (no prior stub — `003` deliberately stores `tickets.machine_model`
as free text with no FK, so there's nothing to reconcile there, see `research.md` §2)

**Testing**: Vitest + Playwright, consistent with prior features

**Target Platform**: Same Docker Compose deployment; no new services

**Project Type**: Same single Next.js project; adds `lib/admin/` and `app/api/admin/*`

**Performance Goals**: Catalogue/store CRUD is low-volume, Super-Admin-only traffic — no
meaningful load concern; still held to the constitution's <500ms p95 baseline

**Constraints**: A store cannot be made `active` without a valid-format WhatsApp contact
number (FR-007); tax rate stored as an exact percentage (`numeric`, not floating point,
consistent with `004`'s money-precision precedent); Admin-store assignment changes here
write to `002-auth-rbac`'s existing `user_stores` table, not a new one (`research.md` §3)

**Scale/Scope**: Tens of machine models to low hundreds; ≤10 stores per the constitution's
scale target — both comfortably small relative to ticket volume

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Test-First (NON-NEGOTIABLE) | Same TDD discipline as prior features. | PASS |
| II. Simplicity & YAGNI | Reuses `002`'s `user_stores` table for Admin-store assignment rather than inventing a parallel assignment mechanism (spec.md's own Assumptions call this out: "the same underlying capability... this spec only adds a convenient entry point"). Reuses `004`'s `csv-parse` import pattern rather than a second bespoke CSV parser. | PASS |
| III. API/Contract-First Design | `contracts/admin-console-api.md` defines every endpoint before implementation. | PASS |
| IV. Security & Observability by Default | Every route Super-Admin-gated via the existing `assertAccess()`; store/model creation and edits are exactly the kind of configuration change the constitution's audit expectations cover — logged via the same pattern `002-auth-rbac` established for its own `audit_log` writes on user/role changes. | PASS |
| Non-Functional Service Levels | No scale concern at this feature's data volume; WCAG 2.1 AA applies to the admin forms same as everywhere else. | PASS |

No violations — Complexity Tracking is empty.

**Post-Design Re-Check** (after Phase 1): all five rows still PASS. `data-model.md`
confirms the `stores` table migration is an `ALTER`, not a `CREATE`, preserving every
existing FK from `002`/`003`/`004`/`005` into it; `machine_models` is a genuinely new table
with no prior stub to reconcile; Admin-store assignment writes are confirmed to target
`002`'s `user_stores` table directly.

## Project Structure

### Documentation (this feature)

```text
specs/007-admin-console/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── admin-console-api.md
└── tasks.md             # /speckit-tasks output — not created by this command
```

### Source Code (repository root)

```text
app/
├── api/
│   └── admin/
│       ├── machine-models/route.ts          # list/create
│       ├── machine-models/[id]/route.ts     # edit/deactivate
│       ├── machine-models/import/route.ts   # CSV bulk import
│       ├── stores/route.ts                  # list/create
│       └── stores/[id]/route.ts             # edit/deactivate/assign-admins
└── (dashboard)/
    └── admin/
        ├── machine-models/page.tsx
        └── stores/page.tsx                  # incl. Admin-assignment UI (writes to 002's user_stores)

lib/
├── db/
│   └── schema.ts                            # extended: machine_models; stores ALTERed
└── admin/
    ├── machine-models.ts                    # CRUD + dedup + CSV import (reuses csv-import.ts pattern from 004)
    └── stores.ts                            # CRUD + WhatsApp-number validation + assignment writes into user_stores

tests/
├── contract/
│   └── admin-console-api.test.ts
├── integration/
│   ├── machine-model-maintenance.test.ts    # US1 incl. CSV import
│   ├── store-setup.test.ts                  # US2 incl. tax rate flowing into 004's bill calc
│   └── admin-assignment-persistence.test.ts # US3 + store deactivate/reactivate (FR-012)
└── e2e/
    └── configure-new-store.spec.ts
```

**Structure Decision**: Extends the same single Next.js project. This feature's migration
is the one that finalizes the `stores` table's full shape — every other feature's
reference to `stores.id` (as an FK) remains valid across the `ALTER`, since no column
those features depend on (`id`) is touched, only new columns are added.

## Complexity Tracking

*No entries — no Constitution Check violations to justify.*
