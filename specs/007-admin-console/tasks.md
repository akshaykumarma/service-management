---

description: "Task list for Machine Model & Store Administration Console (007-admin-console)"
---

# Tasks: Machine Model & Store Administration Console

**Input**: Design documents from `/specs/007-admin-console/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/admin-console-api.md, quickstart.md (all present). Assumes `002-auth-rbac` and
`003-ticket-lifecycle` are already scaffolded — this feature **extends** `003`'s minimal
`stores` stub rather than creating a new table (`research.md` §1), and its Admin-assignment
endpoints write to `002`'s existing `user_stores` table (`research.md` §3).

**Tests**: Included and REQUIRED per constitution Principle I (Test-First, NON-NEGOTIABLE).

**Organization**: Tasks are grouped by user story (spec.md priorities P1–P3).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [ ] T001 [P] Verify `csv-parse` (already installed for `004-parts-services-catalogue`'s bulk import) is available for this feature's own machine-model CSV import — no new dependency needed

**Checkpoint**: No new infrastructure required; proceed to schema work.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Reconcile the shared `stores` table and add the new `machine_models` table

**⚠️ CRITICAL**: No user story task may begin until this phase is complete

- [ ] T002 `ALTER TABLE stores` to add `address`, `primary_contact`, `whatsapp_number`, `tax_rate`, `active` columns in `lib/db/schema.ts` — this **extends** the minimal `stores` stub `003-ticket-lifecycle`'s Foundational phase created; it MUST NOT be a `CREATE TABLE` (`research.md` §1), or every existing FK from `002`'s `user_stores`, `003`'s `tickets`, `004`'s tax-rate reads, and `005`'s WhatsApp-number reads into `stores.id` breaks
- [ ] T003 Define Drizzle schema for the new `machine_models` table (no FK from `tickets.machine_model` — that stays free text per `003`'s own design, `research.md` §2) in `lib/db/schema.ts` (depends on T002, same file)
- [ ] T004 Generate and run the migration (depends on T002, T003)
- [ ] T005 [P] Implement WhatsApp-number format validation (E.164-style; a display/contact-info check, not a Meta API check — `research.md` §4) in `lib/admin/stores.ts` (depends on T004)

**Checkpoint**: Schema reconciled; user story work can begin.

---

## Phase 3: User Story 1 - Machine Model Catalogue Maintenance (Priority: P1) 🎯 MVP

**Goal**: Super Admin maintains the machine model list (name/manufacturer/category) staff
select from at intake, including bulk CSV import.

**Independent Test**: As Super Admin, add a model and confirm it's immediately selectable
at intake; deactivate it and confirm it disappears from selection while existing ticket
references are unaffected; bulk-import a CSV and confirm valid/invalid rows are both
reported correctly.

### Tests for User Story 1 ⚠️ Write first; confirm they fail before implementing

- [ ] T006 [P] [US1] Contract tests for machine-model CRUD and import endpoints in `tests/contract/admin-console-api.test.ts`
- [ ] T007 [P] [US1] Integration test for machine model CRUD, deactivation exclusion, and CSV import per-row failure reporting in `tests/integration/machine-model-maintenance.test.ts`

### Implementation for User Story 1

- [ ] T008 [US1] Implement machine model CRUD (create/edit/deactivate, duplicate-name check per this spec's Model-Name clarification) in `lib/admin/machine-models.ts` (depends on T003)
- [ ] T009 [US1] Implement CSV bulk import reusing `004-parts-services-catalogue`'s `csv-import.ts` pattern (columns `name,manufacturer,category`) in `lib/admin/machine-models.ts` (depends on T008)
- [ ] T010 [US1] Implement `GET`/`POST /api/admin/machine-models` and `PATCH /api/admin/machine-models/:id` in `app/api/admin/machine-models/route.ts` and `app/api/admin/machine-models/[id]/route.ts` (depends on T008)
- [ ] T011 [US1] Implement `POST /api/admin/machine-models/import` in `app/api/admin/machine-models/import/route.ts` (depends on T009)
- [ ] T012 [US1] Build the machine model maintenance UI in `app/(dashboard)/admin/machine-models/page.tsx` (depends on T010, T011)
- [ ] T013 [US1] Confirm T006-T007 pass; run `quickstart.md` Scenario 1 (depends on T008-T012)

**Checkpoint**: User Story 1 fully functional and independently testable/deployable (MVP).

---

## Phase 4: User Story 2 - Store Setup & Configuration (Priority: P2)

**Goal**: Super Admin creates/configures stores (name, address, contact, WhatsApp number,
tax rate, active state); a store's tax rate flows into `004`'s bill calculation; a store
requires a valid WhatsApp number before activation.

**Independent Test**: Create a store with a specific tax rate, confirm a ticket at that
store bills using that rate, then deactivate it and confirm it's no longer selectable for
new tickets.

### Tests for User Story 2 ⚠️ Write first; confirm they fail before implementing

- [ ] T014 [P] [US2] Contract tests for store CRUD, including the WhatsApp-number and tax-rate validation responses, in `tests/contract/admin-console-api.test.ts`
- [ ] T015 [P] [US2] Integration test for store creation/activation, tax-rate propagation into `004-parts-services-catalogue`'s bill calculation, and deactivation excluding new-ticket selection in `tests/integration/store-setup.test.ts`
- [ ] T016 [P] [US2] E2E test for configuring a new store end-to-end in `tests/e2e/configure-new-store.spec.ts`

### Implementation for User Story 2

- [ ] T017 [US2] Implement store CRUD — create/edit/deactivate, tax-rate range validation (`0`-`100`), activation gated on a valid WhatsApp number (FR-007) — in `lib/admin/stores.ts` (depends on T005)
- [ ] T018 [US2] Implement `GET`/`POST /api/admin/stores` and `PATCH /api/admin/stores/:id` in `app/api/admin/stores/route.ts` and `app/api/admin/stores/[id]/route.ts` (depends on T017)
- [ ] T019 [US2] Build the store setup/configuration UI in `app/(dashboard)/admin/stores/page.tsx` (depends on T018)
- [ ] T020 [US2] Confirm T014-T016 pass; run `quickstart.md` Scenario 2 (depends on T017-T019)

**Checkpoint**: User Stories 1 and 2 both independently functional.

---

## Phase 5: User Story 3 - Assigning Admins to Stores (Priority: P3)

**Goal**: Super Admin assigns/removes an Admin's association with a store from the store
screen; the assignment survives the store's own deactivate/reactivate cycle unchanged
(FR-012).

**Independent Test**: Assign an Admin to a store, confirm their ticket visibility updates
immediately; deactivate and reactivate the store; confirm the assignment was never touched.

### Tests for User Story 3 ⚠️ Write first; confirm it fails before implementing

- [ ] T021 [P] [US3] Integration test for Admin assignment/removal and its persistence across a store deactivate/reactivate cycle (FR-012) in `tests/integration/admin-assignment-persistence.test.ts`

### Implementation for User Story 3

- [ ] T022 [US3] Implement `POST /api/admin/stores/:id/admins` and `DELETE /api/admin/stores/:id/admins/:userId`, writing directly to `002-auth-rbac`'s existing `user_stores` table — **no new assignment table** (`research.md` §3) — in `app/api/admin/stores/[id]/admins/route.ts` and `app/api/admin/stores/[id]/admins/[userId]/route.ts` (depends on T018)
- [ ] T023 [US3] Add the Admin-assignment UI to the store configuration screen in `app/(dashboard)/admin/stores/page.tsx` (depends on T022, T019)
- [ ] T024 [US3] Confirm T021 passes; run `quickstart.md` Scenario 3 (depends on T022-T023)

**Checkpoint**: All three user stories independently functional — spec.md fully implemented.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T025 [P] Run the full `quickstart.md` validation (all 3 scenarios, all 6 success-criteria checklist items) end-to-end
- [ ] T026 [P] Accessibility audit (WCAG 2.1 AA) of the machine-model and store admin UI
- [ ] T027 [P] Security review: Super-Admin-only enforcement on every route in this feature
- [ ] T028 Performance check: catalogue/store CRUD meets the constitution's <500ms p95 (low-volume traffic — should be trivial to satisfy)
- [ ] T029 [P] Regression check: confirm T002's `ALTER TABLE stores` preserved every existing foreign key from `002`, `003`, `004`, and `005` into `stores.id` — a targeted check given this is a shared-table schema change, not a routine one

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS every user story; T002's `ALTER`
  additionally depends on `003-ticket-lifecycle`'s Foundational phase having already
  created the `stores` stub (cross-feature ordering — see that feature's own tasks.md note)
- **User Stories (Phases 3-5)**: All depend on Foundational completion
  - US1 has no dependency on US2/US3
  - US2 depends only on Foundational (T005) — can run in parallel with US1
  - US3 depends on US2's store routes (T018) existing as the surface it adds
    assignment endpoints alongside
- **Polish (Phase 6)**: Depends on all three user stories being complete

### Within Each User Story

- Tests MUST be written and confirmed failing before implementation begins (constitution Principle I)
- Schema/utilities before routes; routes before UI
- Story's own "confirm tests pass + run quickstart scenario" task is last

### Parallel Opportunities

- T006-T007 (US1 tests) can run in parallel — different files
- T014-T016 (US2 tests) can run in parallel — different files
- Once Foundational is done, US1 and US2 can be staffed in parallel (independent of each other)
- T025-T027, T029 (Polish) can run in parallel

---

## Parallel Example: User Stories 1 and 2

```bash
# Once Foundational (T002-T005) is done, these can proceed in parallel:
Task: "US1: Implement machine model CRUD in lib/admin/machine-models.ts"
Task: "US2: Implement store CRUD in lib/admin/stores.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational — **critically, confirm the `stores` ALTER (T002) is
   sequenced correctly against `003`'s stub creation** before proceeding
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: run `quickstart.md` Scenario 1 independently
5. Deploy/demo if ready — Super Admin can now maintain the model list even before store
   configuration (US2) or admin assignment (US3) exist

### Incremental Delivery

1. Setup + Foundational → foundation ready (schema reconciled)
2. + User Story 1 → validate → deploy
3. + User Story 2 → validate → deploy (stores configurable, tax rate flows into billing)
4. + User Story 3 → validate → deploy (admin assignment convenience UI — spec.md complete)
5. Phase 6 Polish

### Parallel Team Strategy

Once Foundational is done: Developer A takes US1 (machine models); Developer B takes US2
(stores) in parallel — fully independent until US3, which builds on US2's store screen.

---

## Notes

- [P] tasks touch different files with no unmet dependency
- [Story] labels trace every task back to its spec.md user story
- Every test task MUST be run and confirmed **failing** before its paired implementation task starts
- T002 and T029 are the two tasks most worth extra care: this feature's migration touches
  a table four other features already depend on
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently before continuing
