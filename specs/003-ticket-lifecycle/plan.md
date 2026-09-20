# Implementation Plan: Ticket Intake, History Lookup & Status Lifecycle

**Branch**: `003-ticket-lifecycle` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-ticket-lifecycle/spec.md`

## Summary

Build ticket intake (customer, machine model, issue, optional photos), model-based service
history lookup (store-scoped for Service Managers, cross-store for Admin/Super Admin), and
the six-status lifecycle (Open → In Progress → On Hold → Completed → Delivered, plus
Cancelled) with role-gated and mandatory-comment transitions. Two of this spec's own
clarifications drive specific architectural choices: last-write-wins concurrency (FR-019 —
no optimistic locking on ticket status) and a phone-keyed `customers` table separate from
each ticket's own historical name/phone fields (FR-020).

This is the **second** feature planned; it adopts the project-wide stack `002-auth-rbac`
established (Next.js 14+ TypeScript, PostgreSQL 15+, Drizzle ORM, Docker Compose
self-hosted) rather than re-deciding it, per the constitution's "binding thereafter" rule.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS (unchanged from `002-auth-rbac`)

**Primary Dependencies**: Next.js 14+ (App Router) · Drizzle ORM · `pg` driver ·
`@aws-sdk/client-s3` pointed at a self-hosted **MinIO** instance for intake photos
(S3-compatible, so a later move to real AWS S3 needs no code change) · `assertAccess()` and
the session/RBAC layer from `002-auth-rbac` (reused, not reimplemented)

**Storage**: PostgreSQL 15+ (tickets, customers, status_history, ticket_photos tables) +
MinIO (object storage for intake photo files; only the object key is stored in Postgres)

**Testing**: Vitest (unit/contract/integration) + Playwright (e2e), consistent with
`002-auth-rbac`

**Target Platform**: Same Docker Compose deployment as `002-auth-rbac`; this feature adds a
`minio` service to `docker-compose.yml`

**Project Type**: Same single Next.js App Router project as `002-auth-rbac` — this feature
adds its own `app/api/tickets/*` routes and `lib/tickets/` modules alongside the existing
`lib/auth/`

**Performance Goals**: Ticket creation and history lookup must meet the constitution's
<500ms p95 for ticket CRUD; the history-lookup query (FR-007/FR-008) is a single indexed
query, not a chain of lookups, to keep SC-002's "under 30 seconds" (effectively instant)
achievable

**Constraints**: Up to 5 intake photos per ticket, JPEG/PNG, max 5MB each (source PRD
§6.2.2 — this specific limit isn't restated in spec.md's FR-004 but is a real technical
constraint this plan must enforce); ticket ID format `SVC-{YYYY}-{5-digit sequence}`,
store+year-scoped, collision-free under concurrent creation (spec Edge Case); no optimistic
concurrency check on a ticket's status field (FR-019 requires last-write-wins, not
conflict rejection)

**Scale/Scope**: ~1,000 tickets/store/month, ≥10 stores (constitution Non-Functional
Service Levels) — status_history and photo tables grow proportionally with tickets, not
independently

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Test-First (NON-NEGOTIABLE) | `/speckit-tasks` sequences a failing test (Vitest/Playwright) before each implementation task, as in `002-auth-rbac`. | PASS |
| II. Simplicity & YAGNI | `machine_model` is a plain text field with **no FK constraint** to `007-admin-console`'s catalogue — building referential integrity to a feature that doesn't exist yet, for a field the spec itself requires to accept free text (FR-003), would be premature. The ticket-number counter is one small table with one atomic increment statement, not a generic ID-generation framework. | PASS |
| III. API/Contract-First Design | `contracts/tickets-api.md` defines every endpoint before implementation, contract-tested per endpoint. | PASS |
| IV. Security & Observability by Default | Every route reuses `assertAccess()` from `002-auth-rbac` (no parallel authorization logic). `status_history` is the append-only, actor/timestamp-attributed record FR-015 requires and, together with FR-006's immutable creator/timestamp, satisfies the constitution's "every mutation attributable" domain constraint without a duplicate write to the generic `audit_log` table — logging the same fact twice would violate Simplicity for no added guarantee. | PASS |
| Non-Functional Service Levels | Photo size/type limits enforced at upload; <500ms p95 target achievable with the single-query history lookup; scale target (~1,000 tickets/store/month × 10 stores) comfortably within PostgreSQL's indexed-query range. | PASS |

No violations — Complexity Tracking is empty.

**Post-Design Re-Check** (after Phase 1): all five rows still PASS. `data-model.md`
confirms no FK from `tickets.machine_model` to any catalogue table, no optimistic-lock
column added to `tickets.status` (the one place a well-intentioned addition could have
silently violated FR-019), and the ticket-number counter's atomic upsert is the only
concurrency-control mechanism this feature introduces.

## Project Structure

### Documentation (this feature)

```text
specs/003-ticket-lifecycle/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── tickets-api.md
└── tasks.md             # /speckit-tasks output — not created by this command
```

### Source Code (repository root)

```text
# Extends the single Next.js project from 002-auth-rbac — same repo, new modules.
app/
├── api/
│   └── tickets/
│       ├── route.ts                     # POST create, GET list (filtered by role scope)
│       ├── [id]/
│       │   ├── route.ts                 # GET detail
│       │   └── status/route.ts          # PATCH status transition
│       └── photo-upload-url/route.ts    # POST — issue a presigned MinIO upload URL
└── (dashboard)/
    └── tickets/
        ├── new/page.tsx                 # intake form
        └── [id]/page.tsx                # ticket detail incl. history panel + status controls

lib/
├── db/
│   └── schema.ts                        # extended: tickets, customers, status_history,
│                                         # ticket_photos, ticket_number_counters
├── tickets/
│   ├── ticket-number.ts                 # atomic SVC-{YYYY}-{NNNNN} generator
│   ├── customer.ts                      # find-or-create-by-phone + name update (FR-020)
│   ├── history.ts                       # role-scoped history lookup query (FR-007/008)
│   ├── status-transitions.ts            # the allowed-transition table + role/comment gates
│   └── photos.ts                        # MinIO presigned URL issuance + validation
└── storage/
    └── minio-client.ts                  # S3-compatible client config

tests/
├── contract/
│   └── tickets-api.test.ts
├── integration/
│   ├── ticket-intake-history.test.ts    # US1 scenarios
│   ├── status-transitions.test.ts       # US2 scenarios incl. Delivered-backward gate
│   ├── holds-cancellations.test.ts      # US3 scenarios
│   ├── concurrent-status-change.test.ts # FR-019 last-write-wins
│   └── ticket-number-collision.test.ts  # concurrent-creation edge case
└── e2e/
    └── intake-to-history.spec.ts
```

**Structure Decision**: Adds `lib/tickets/` and `app/api/tickets/*` to the existing
`002-auth-rbac` project; no new deployable, no new project. `stores` (referenced by
`tickets.store_id`) and `machine_models` (referenced only as free text, not a hard FK) are
owned by `007-admin-console`, not yet planned — this feature's migration creates a minimal
`stores` table stub if it doesn't already exist, to be superseded by `007`'s fuller
definition when that feature is planned (same cross-feature pattern `002-auth-rbac` used for
`user_stores` → `stores`).

## Complexity Tracking

*No entries — no Constitution Check violations to justify.*
