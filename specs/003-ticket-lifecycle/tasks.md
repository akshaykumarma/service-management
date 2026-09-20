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

- [ ] T001 [P] Add a `minio` service to `docker-compose.yml` for intake-photo object storage per `plan.md`
- [ ] T002 [P] Install `@aws-sdk/client-s3` (S3-compatible client for MinIO)
- [ ] T003 [P] Create the intake-photos bucket in MinIO (init script or documented manual setup step)

**Checkpoint**: MinIO reachable and ready; no ticket code yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema and core utilities every user story depends on

**⚠️ CRITICAL**: No user story task may begin until this phase is complete

- [ ] T004 Add/confirm a minimal `stores` table (`id`, `name`) in `lib/db/schema.ts`. **Cross-feature note**: `002-auth-rbac`'s `user_stores` table has a foreign key into `stores.id`; if `002` is implemented before this table exists, its own migration will fail. Coordinate: this table must exist in the shared `lib/db/schema.ts` before or alongside whichever of `002`/`003` is migrated first — don't assume the two features' schema work is fully independent.
- [ ] T005 Define Drizzle schema for `tickets`, `customers`, `status_history`, `ticket_photos`, `ticket_number_counters` per `data-model.md` in `lib/db/schema.ts` (depends on T004)
- [ ] T006 Generate and run the migration (depends on T005)
- [ ] T007 [P] Implement the MinIO S3-compatible client config in `lib/storage/minio-client.ts` (depends on T001-T003)
- [ ] T008 Implement the atomic ticket-number generator (`research.md` §1 — single upsert statement, no read-then-write race) in `lib/tickets/ticket-number.ts` (depends on T005)
- [ ] T009 [P] Implement find-or-create-by-phone customer resolution (FR-020) in `lib/tickets/customer.ts` (depends on T005)

**Checkpoint**: Schema and core utilities exist — user story work can begin.

---

## Phase 3: User Story 1 - Ticket Intake with Model-Based History Lookup (Priority: P1) 🎯 MVP

**Goal**: Capture a new ticket (customer, machine model, issue, optional photos) and show
model-based service history scoped to the creator's role, inline with creation.

**Independent Test**: Create a ticket for a model with no history (shows "no history") and
for a model with prior closed tickets (shows them, store-scoped for Service Managers,
cross-store for Admin/Super Admin) — per spec.md's Acceptance Scenarios.

### Tests for User Story 1 ⚠️ Write first; confirm they fail before implementing

- [ ] T010 [P] [US1] Contract tests for `POST /api/tickets/photo-upload-url` and `POST /api/tickets` (all documented status codes) in `tests/contract/tickets-api.test.ts`
- [ ] T011 [P] [US1] Integration test for intake + history lookup (found/not-found, store-scoped vs. cross-store) in `tests/integration/ticket-intake-history.test.ts`
- [ ] T012 [P] [US1] Integration test for collision-free ticket-number generation under concurrent creation in `tests/integration/ticket-number-collision.test.ts`
- [ ] T013 [P] [US1] E2E test for the intake-to-history flow in `tests/e2e/intake-to-history.spec.ts`

### Implementation for User Story 1

- [ ] T014 [US1] Implement the role-scoped history-lookup query (`research.md` §6 — single indexed query, not per-call-site filtering) in `lib/tickets/history.ts` (depends on T005)
- [ ] T015 [US1] Implement `POST /api/tickets/photo-upload-url` (presigned MinIO URL issuance, content-type/size validation per `research.md` §5) in `app/api/tickets/photo-upload-url/route.ts` (depends on T007)
- [ ] T016 [US1] Implement `POST /api/tickets` (customer resolution, ticket-number generation, up-to-5-photo validation, inline history-lookup response) in `app/api/tickets/route.ts` (depends on T008, T009, T014, T015)
- [ ] T017 [US1] Implement `GET /api/tickets/:id` (detail including status history and photos) in `app/api/tickets/[id]/route.ts` (depends on T016)
- [ ] T018 [US1] Build an accessible (WCAG 2.1 AA) ticket intake form in `app/(dashboard)/tickets/new/page.tsx` (depends on T016)
- [ ] T019 [US1] Build the ticket detail page including the history panel in `app/(dashboard)/tickets/[id]/page.tsx` (depends on T017)
- [ ] T020 [US1] Confirm T010-T013 pass; run `quickstart.md` Scenario 1 (depends on T014-T019)

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

- [ ] T021 [P] [US2] Integration test for forward/backward transitions, including the Delivered-backward Admin/Super-Admin-only gate, in `tests/integration/status-transitions.test.ts`
- [ ] T022 [P] [US2] Integration test for last-write-wins on concurrent status changes (FR-019) in `tests/integration/concurrent-status-change.test.ts`

### Implementation for User Story 2

- [ ] T023 [US2] Implement the allowed-transition table with role and mandatory-comment gates (including the Delivered-backward exception, FR-018) in `lib/tickets/status-transitions.ts` (depends on T005)
- [ ] T024 [US2] Implement `PATCH /api/tickets/:id/status` — a plain `UPDATE` with **no optimistic-concurrency check** (`research.md` §2 — required by FR-019) plus an unconditional `status_history` insert on every request — in `app/api/tickets/[id]/status/route.ts` (depends on T023)
- [ ] T025 [US2] Add status-change controls to the ticket detail page in `app/(dashboard)/tickets/[id]/page.tsx` (depends on T024, T019)
- [ ] T026 [US2] Confirm T021-T022 pass; run `quickstart.md` Scenarios 2 and 4 (depends on T023-T025)

**Checkpoint**: User Stories 1 and 2 both independently functional.

---

## Phase 5: User Story 3 - Mandatory-Reason Holds & Cancellations (Priority: P3)

**Goal**: On Hold requires a reason; Cancelled is Admin/Super-Admin-only with a mandatory
reason and is excluded from the default active-tickets view while remaining retrievable.

**Independent Test**: Attempt On Hold without a reason (rejected) and with one (accepted);
attempt Cancelled as Service Manager (denied) and as Admin (accepted, hidden from default
list, visible via all-tickets filter).

### Tests for User Story 3 ⚠️ Write first; confirm it fails before implementing

- [ ] T027 [P] [US3] Integration test for the On Hold comment requirement, the Cancelled role/comment gate, and default-view exclusion in `tests/integration/holds-cancellations.test.ts`

### Implementation for User Story 3

- [ ] T028 [US3] Add the default-active-view exclusion filter for Cancelled tickets (with an explicit "all tickets" override) to `GET /api/tickets` in `app/api/tickets/route.ts` (On Hold/Cancelled comment and role gates are already covered by T023's transition table) (depends on T023)
- [ ] T029 [US3] Confirm T027 passes; run `quickstart.md` Scenario 3 (depends on T028)

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
