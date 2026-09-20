---

description: "Task list for Ticket Intake, History Lookup & Status Lifecycle (003-ticket-lifecycle)"
---

# Tasks: Ticket Intake, History Lookup & Status Lifecycle

**Input**: Design documents from `/specs/003-ticket-lifecycle/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/tickets-api.md,
quickstart.md (all present). Assumes `002-auth-rbac`'s project scaffolding
(Next.js/Drizzle/Docker Compose base, `assertAccess()`) already exists.

**Tests**: Included and REQUIRED per constitution Principle I (Test-First, NON-NEGOTIABLE).

**Organization**: Tasks are grouped by user story (spec.md priorities P1–P3).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

**Purpose**: Add this feature's infrastructure to the existing project

- [X] T001 [P] Add a `minio` service (plus a `minio-init` bucket-creation step) to `docker-compose.yml` for intake-photo object storage per `plan.md`
- [X] T002 [P] Install `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` (S3-compatible client for MinIO)
- [X] T003 [P] **Implementation deviation**: MinIO's open-source server binaries were discontinued/archived after this feature's research.md was written (`dl.min.io` now returns `410 Gone` for the server download; only the still-current `minio/minio` container image remains, which needs Docker to run). This sandboxed dev/test environment has no working Docker daemon. Substituted `s3rver` (an npm package implementing enough of the S3 API for real integration testing, no external binary/daemon needed) for local dev/test only, started/stopped via Vitest's `globalSetup` in `tests/global-setup.ts`. `lib/storage/minio-client.ts` is a plain `@aws-sdk/client-s3` `S3Client` pointed at `MINIO_ENDPOINT` — genuinely S3-API-generic, so it targets real MinIO in `docker-compose.yml`'s production/deployment path unchanged.

**Checkpoint**: MinIO reachable and ready; no ticket code yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema and core utilities every user story depends on

**⚠️ CRITICAL**: No user story task may begin until this phase is complete

- [X] T004 Confirmed: `002-auth-rbac`'s implementation already created the minimal `stores` table (`id`, `name`) in `lib/db/schema.ts`, exactly per this task's own coordination note — resolved by build order, not by this feature having to create it now.
- [X] T005 Define Drizzle schema for `tickets`, `customers`, `status_history`, `ticket_photos`, `ticket_number_counters` per `data-model.md` in `lib/db/schema.ts` (depends on T004)
- [X] T006 Generate and run the migration (depends on T005)
- [X] T007 [P] Implement the S3-compatible client config in `lib/storage/minio-client.ts` (depends on T001-T003)
- [X] T008 Implement the atomic ticket-number generator (`research.md` §1 — single upsert statement, no read-then-write race) in `lib/tickets/ticket-number.ts` (depends on T005)
- [X] T009 [P] Implement find-or-create-by-phone customer resolution (FR-020) in `lib/tickets/customer.ts` (depends on T005)

**Checkpoint**: Schema and core utilities exist — user story work can begin.

---

## Phase 3: User Story 1 - Ticket Intake with Model-Based History Lookup (Priority: P1) 🎯 MVP

**Goal**: Capture a new ticket (customer, machine model, issue, optional photos) and show
model-based service history scoped to the creator's role, inline with creation.

**Independent Test**: Create a ticket for a model with no history (shows "no history") and
for a model with prior closed tickets (shows them, store-scoped for Service Managers,
cross-store for Admin/Super Admin) — per spec.md's Acceptance Scenarios.

### Tests for User Story 1 ⚠️ Write first; confirm they fail before implementing

- [X] T010 [P] [US1] Contract tests for `POST /api/tickets/photo-upload-url` and `POST /api/tickets` (all documented status codes) in `tests/contract/tickets-api.test.ts`
- [X] T011 [P] [US1] Integration test for intake + history lookup (found/not-found, store-scoped vs. cross-store) in `tests/integration/ticket-intake-history.test.ts`
- [X] T012 [P] [US1] Integration test for collision-free ticket-number generation under concurrent creation in `tests/integration/ticket-number-collision.test.ts`
- [X] T013 [P] [US1] E2E test for the intake-to-history flow in `tests/e2e/intake-to-history.spec.ts`

### Implementation for User Story 1

- [X] T014 [US1] Implement the role-scoped history-lookup query (`research.md` §6 — single indexed query, not per-call-site filtering) in `lib/tickets/history.ts` (depends on T005). **Schema fix found here**: `tickets.ticket_number` was originally made globally unique, but plan.md's own Constraints say the numbering is "store+year-scoped" — two different stores legitimately both issue `SVC-2026-00001`. Changed the unique index to `(store_id, ticket_number)`.
- [X] T015 [US1] Implement `POST /api/tickets/photo-upload-url` (presigned S3-compatible URL issuance, content-type/size validation per `research.md` §5) in `app/api/tickets/photo-upload-url/route.ts` (depends on T007)
- [X] T016 [US1] Implement `POST /api/tickets` (customer resolution, ticket-number generation, up-to-5-photo validation, inline history-lookup response, and an initial `status_history` row for the creation event per `data-model.md`) in `app/api/tickets/route.ts` (depends on T008, T009, T014, T015). Also implements `GET /api/tickets` (role-scoped list) here, since US3's T028 extends this same file and the contract defines it.
- [X] T017 [US1] Implement `GET /api/tickets/:id` (detail including status history and photos; 404 — not 403 — for an out-of-scope caller, per contract's no-existence-leak requirement) in `app/api/tickets/[id]/route.ts` (depends on T016)
- [X] T018 [US1] Build an accessible (WCAG 2.1 AA) ticket intake form in `app/(dashboard)/tickets/new/page.tsx`, showing the inline history result immediately on success (matching the contract's inline-with-creation response, rather than navigating straight to the detail page and losing that context) (depends on T016). Also adds `GET /api/stores` (`app/api/stores/route.ts`) as a minimal scoped store-list endpoint — the intake form has no other way to populate its store selector, and no earlier feature exposes one; a thin read-only list `007-admin-console` can absorb later.
- [X] T019 [US1] Build the ticket detail page including the status-timeline history panel in `app/(dashboard)/tickets/[id]/page.tsx` (depends on T017)
- [X] T020 [US1] Confirm T010-T013 pass; run `quickstart.md` Scenario 1 (depends on T014-T019) — all 12 new tests plus 2 e2e tests pass; full suite 49/49. Also fixed a real bug in `scripts/bench-auth-routes.ts` (left over from `002-auth-rbac`'s polish phase) that had silently truncated the persistent dev database instead of the test one, due to a dotenv override running after `lib/db/client.ts`'s module-load-time `Pool` construction had already read the wrong `DATABASE_URL` — added a hard guard requiring `DATABASE_URL` to look like a test database before that script's `TRUNCATE` runs.

**Checkpoint**: User Story 1 fully functional and independently testable/deployable (MVP).

---

## Phase 4: User Story 2 - Status Lifecycle Management (Priority: P2)

**Goal**: Move tickets through Open → In Progress → On Hold → Completed → Delivered (plus
backward transitions with a comment); backward-out-of-Delivered restricted to
Admin/Super Admin; concurrent status changes resolve last-write-wins with both preserved
in history.

**Independent Test**: Move an existing ticket through each forward status; attempt a
backward transition (requires comment); attempt backward-from-Delivered as a Store Service
Manager (denied) and as Admin (allowed); fire two concurrent status changes and confirm
both land in history with the second-committed one as current.

### Tests for User Story 2 ⚠️ Write first; confirm they fail before implementing

- [X] T021 [P] [US2] Integration test for forward/backward transitions, including the Delivered-backward Admin/Super-Admin-only gate, in `tests/integration/status-transitions.test.ts`
- [X] T022 [P] [US2] Integration test for last-write-wins on concurrent status changes (FR-019) in `tests/integration/concurrent-status-change.test.ts`

### Implementation for User Story 2

- [X] T023 [US2] Implement the allowed-transition checker with role and mandatory-comment gates (including the Delivered-backward exception, FR-018) in `lib/tickets/status-transitions.ts` (depends on T005). Confirmed against `quickstart.md` Scenario 2's own example (`in_progress` → `completed` directly, skipping `on_hold`) that forward moves may skip intermediate statuses — the state diagram's arrows are the *allowed* path, not a mandatory sequence every ticket must pass through.
- [X] T024 [US2] Implement `PATCH /api/tickets/:id/status` — a plain `UPDATE` with **no optimistic-concurrency check** (`research.md` §2 — required by FR-019) plus a `status_history` insert on every successful transition — in `app/api/tickets/[id]/status/route.ts` (depends on T023)
- [X] T025 [US2] Add status-change controls (status selector, comment field, inline error messages for each rejection code) to the ticket detail page in `app/(dashboard)/tickets/[id]/page.tsx` (depends on T024, T019)
- [X] T026 [US2] Confirm T021-T022 pass; run `quickstart.md` Scenarios 2 and 4 (depends on T023-T025) — 7 new tests pass; full suite 56/56; `next build` clean

**Checkpoint**: User Stories 1 and 2 both independently functional.

---

## Phase 5: User Story 3 - Mandatory-Reason Holds & Cancellations (Priority: P3)

**Goal**: On Hold requires a reason; Cancelled is Admin/Super-Admin-only with a mandatory
reason and is excluded from the default active-tickets view while remaining retrievable.

**Independent Test**: Attempt On Hold without a reason (rejected) and with one (accepted);
attempt Cancelled as Service Manager (denied) and as Admin (accepted, hidden from default
list, visible via all-tickets filter).

### Tests for User Story 3 ⚠️ Write first; confirm it fails before implementing

- [X] T027 [P] [US3] Integration test for the On Hold comment requirement, the Cancelled role/comment gate, and default-view exclusion in `tests/integration/holds-cancellations.test.ts`

### Implementation for User Story 3

- [X] T028 [US3] The default-active-view exclusion filter for Cancelled tickets (with an `includeCancelled=true` override) was already built into `GET /api/tickets` as part of T016, since the two tasks share one file and the filter is a few lines — confirmed here rather than re-implemented. On Hold/Cancelled comment and role gates are covered by T023's transition checker, exercised directly by T027's tests (depends on T023)
- [X] T029 [US3] Confirm T027 passes; run `quickstart.md` Scenario 3 (depends on T028) — 2 new tests pass; full suite 58/58

**Checkpoint**: All three user stories independently functional — spec.md fully implemented.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T030 [P] Run the full `quickstart.md` validation (all 5 scenarios, all 8 success-criteria checklist items) end-to-end
- [ ] T031 [P] Accessibility audit (WCAG 2.1 AA) of the intake and ticket detail pages
- [ ] T032 [P] Security review: photo upload content-type/size enforcement, presigned URL expiry, RBAC on every route
- [ ] T033 Performance check: history-lookup query and ticket creation meet the constitution's <500ms p95
- [ ] T034 [P] Document the `stores` table cross-feature coordination note from T004 in the project's setup docs, so whoever implements `002` and `003` is aware of the dependency regardless of which is built first

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup (T007 needs MinIO) — BLOCKS every user story
- **User Stories (Phases 3-5)**: All depend on Foundational completion
  - US1 has no dependency on US2/US3
  - US2 depends on tickets existing (US1) to have something to transition, but its own
    logic (`status-transitions.ts`) is independently testable given a seeded ticket
  - US3 depends on US2's transition table (`lib/tickets/status-transitions.ts`) already
    existing, since On Hold/Cancelled are transitions within that same table
- **Polish (Phase 6)**: Depends on all three user stories being complete

### Within Each User Story

- Tests MUST be written and confirmed failing before implementation begins (constitution Principle I)
- Schema/utilities before routes; routes before UI pages
- Story's own "confirm tests pass + run quickstart scenario" task is last

### Parallel Opportunities

- T001-T003 (Setup) can all run in parallel
- T007 and T008/T009 (Foundational) can run in parallel once T005/T006 land
- T010-T013 (US1 tests) can run in parallel — different files
- T021-T022 (US2 tests) can run in parallel — different files
- T030-T032, T034 (Polish) can run in parallel

---

## Parallel Example: User Story 1

```bash
Task: "Contract tests for photo-upload-url and ticket creation in tests/contract/tickets-api.test.ts"
Task: "Integration test for intake + history lookup in tests/integration/ticket-intake-history.test.ts"
Task: "Integration test for ticket-number collision safety in tests/integration/ticket-number-collision.test.ts"
Task: "E2E test for intake-to-history in tests/e2e/intake-to-history.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (blocks everything, including resolving the `stores`
   cross-feature note in T004)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: run `quickstart.md` Scenario 1 independently
5. Deploy/demo if ready — staff can already record tickets and see machine history

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. + User Story 1 → validate → deploy (MVP)
3. + User Story 2 → validate → deploy (full status workflow live)
4. + User Story 3 → validate → deploy (holds/cancellations live — spec.md complete)
5. Phase 6 Polish

### Parallel Team Strategy

Once Foundational is done: Developer A takes US1 (intake/history); Developer B can begin
US2's `status-transitions.ts` logic against a manually-seeded ticket in parallel, since it
doesn't functionally depend on US1's intake UI being finished, only on a ticket row
existing.

---

## Notes

- [P] tasks touch different files with no unmet dependency
- [Story] labels trace every task back to its spec.md user story
- Every test task MUST be run and confirmed **failing** before its paired implementation task starts
- T004's cross-feature `stores` table note is the single most important thing to resolve
  correctly before either `002` or `003` is actually implemented — a naive "just do them in
  numeric order" assumption will hit a broken migration if not handled
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently before continuing
