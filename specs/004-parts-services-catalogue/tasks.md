---

description: "Task list for Parts & Services Selection, Billing, and Catalogue Maintenance (004-parts-services-catalogue)"
---

# Tasks: Parts & Services Selection, Billing, and Catalogue Maintenance

**Input**: Design documents from `/specs/004-parts-services-catalogue/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/catalogue-billing-api.md, quickstart.md (all present). Assumes
`002-auth-rbac` and `003-ticket-lifecycle` are already scaffolded (this feature reads
`003`'s `tickets`/`status_history` tables and reuses `assertAccess()`).

**Tests**: Included and REQUIRED per constitution Principle I (Test-First, NON-NEGOTIABLE).

**Organization**: Tasks are grouped by user story (spec.md priorities P1–P3).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 [P] Install `csv-parse` dependency for bulk parts import (`research.md` §4)

**Checkpoint**: Dependency available; no feature code yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema and core billing utilities every user story depends on

**⚠️ CRITICAL**: No user story task may begin until this phase is complete

- [X] T002 Define Drizzle schema for `parts`, `services`, `ticket_line_items` (all money columns as `numeric(12,2)`, per `research.md` §2 — never floating point) in `lib/db/schema.ts`. Also added `stores.tax_rate` (`numeric(5,2)`, extending the existing table via `ALTER TABLE`, never recreating it) since bill calculation needs a live rate to read and `007-admin-console` hasn't built store management yet — `quickstart.md`'s own Prerequisites anticipated exactly this fallback ("a manually-seeded row if that feature isn't built yet").
- [X] T003 Generate and run the migration (depends on T002)
- [X] T004 [P] Implement the Completed-lock derived check — `EXISTS ... status_history WHERE to_status = 'completed'`, read-only against `003-ticket-lifecycle`'s existing table, no new column added anywhere (`research.md` §1) — in `lib/billing/completed-lock.ts` (depends on T002)
- [X] T005 [P] Implement bill calculation (subtotal/tax/total computed entirely in one `NUMERIC` SQL aggregation query — sum and multiplication both happen in Postgres, never JS floating point — tax read live from the store's current rate per `research.md` §3) in `lib/billing/bill-calculation.ts` (depends on T002)

**Checkpoint**: Schema and billing utilities exist — user story work can begin.

---

## Phase 3: User Story 1 - Applying Parts & Services with Automatic Bill Calculation (Priority: P1) 🎯 MVP

**Goal**: Add parts/services to an in-progress ticket with quantity; the ticket's bill
(subtotal, tax, total) recalculates automatically; blocked on an "Open" or Completed-locked
ticket; zero/negative quantities rejected.

**Independent Test**: Given a ticket in progress and a populated catalogue, add a part and
a service and confirm the bill reflects them correctly, per spec.md's Acceptance Scenarios.

### Tests for User Story 1 ⚠️ Write first; confirm they fail before implementing

- [X] T006 [P] [US1] Contract tests for the line-item add/edit/remove endpoints (all documented status codes) in `tests/contract/catalogue-billing-api.test.ts`
- [X] T007 [P] [US1] Integration test for bill calculation including tax, the "Open" status gate, and zero/negative quantity rejection in `tests/integration/bill-calculation.test.ts`
- [X] T008 [P] [US1] E2E test for applying parts/services to a ticket in `tests/e2e/apply-parts-to-ticket.spec.ts`

### Implementation for User Story 1

- [X] T009 [US1] Implement line-item add/update/remove logic — status gate (`in_progress`/`on_hold` only), Completed-lock gate, quantity validation, unit-cost snapshot at insert time never re-read afterward — in `lib/billing/line-items.ts` (depends on T004, T005)
- [X] T010 [US1] Implement `POST /api/tickets/:id/line-items` in `app/api/tickets/[id]/line-items/route.ts` (depends on T009)
- [X] T011 [US1] Implement `PATCH`/`DELETE /api/tickets/:id/line-items/:lineItemId` (quantity change / removal, same status/lock gates) in `app/api/tickets/[id]/line-items/[lineItemId]/route.ts` (depends on T009)
- [X] T012 [US1] Add parts/services selection UI with a live bill display to `003-ticket-lifecycle`'s ticket detail page in `app/(dashboard)/tickets/[id]/page.tsx` (depends on T010, T011). Also extended `GET /api/tickets/:id` (003's own contract) to additively include `lineItems`/`bill` — `data-model.md` explicitly specifies the bill is "included in ticket-detail... responses," so this isn't scope creep, it's literally this feature's own documented design.
- [X] T013 [US1] Confirm T006-T008 pass; run `quickstart.md` Scenario 2 (depends on T009-T012) — 16 new Vitest tests plus 1 e2e test pass; full suite 79/79; verified against a real `next build && next start`, not just the test runner

**Checkpoint**: User Story 1 fully functional and independently testable/deployable (MVP).

---

## Phase 4: User Story 2 - Catalogue Maintenance by Super Admin (Priority: P2)

**Goal**: Super Admin creates/edits/deactivates parts and services (global, not per-store),
including CSV bulk import for parts with per-row failure reporting.

**Independent Test**: As Super Admin, create a part and a service, confirm both are
immediately selectable by any store, then deactivate one and confirm it disappears from
selection while existing ticket references are unaffected.

### Tests for User Story 2 ⚠️ Write first; confirm they fail before implementing

- [X] T014 [P] [US2] Contract tests for parts/services CRUD and the CSV import endpoint in `tests/contract/catalogue-billing-api.test.ts`
- [X] T015 [P] [US2] Integration test for catalogue CRUD, deactivation exclusion from selection, and CSV import's per-row failure reporting in `tests/integration/catalogue-maintenance.test.ts`. **Test-infrastructure bug found here**: `tests/helpers/db.ts`'s `resetDb()` had never been updated to truncate `parts`/`services`/`ticket_line_items`, so a part created by one test silently persisted into the next and tripped the duplicate-name check nondeterministically. Fixed the shared helper.

### Implementation for User Story 2

- [X] T016 [US2] Implement parts CRUD (create/edit/deactivate, duplicate-name check) in `lib/catalogue/parts.ts` (depends on T002)
- [X] T017 [P] [US2] Implement services CRUD (create/edit/deactivate) in `lib/catalogue/services.ts` (depends on T002)
- [X] T018 [US2] Implement CSV bulk import with independent per-row validation and failure reporting (`research.md` §4) in `lib/catalogue/csv-import.ts` (depends on T016). Duplicate-name checking considers both existing active rows and names already imported earlier in the same file, since two rows in one CSV can collide with each other.
- [X] T019 [US2] Implement `GET`/`POST /api/catalogue/parts` and `PATCH /api/catalogue/parts/:id` in `app/api/catalogue/parts/route.ts` and `app/api/catalogue/parts/[id]/route.ts` (depends on T016)
- [X] T020 [US2] Implement `POST /api/catalogue/parts/import` in `app/api/catalogue/parts/import/route.ts` (depends on T018)
- [X] T021 [P] [US2] Implement `GET`/`POST`/`PATCH /api/catalogue/services` in `app/api/catalogue/services/route.ts` (depends on T017)
- [X] T022 [US2] Build the Super Admin catalogue maintenance UI (parts/services CRUD, CSV import) in `app/(dashboard)/admin/catalogue/page.tsx`, gated by the existing Super-Admin-only `app/(dashboard)/admin/layout.tsx` from `002-auth-rbac` (depends on T019-T021)
- [X] T023 [US2] Confirm T014-T015 pass; run `quickstart.md` Scenario 1 (depends on T016-T022) — 11 new tests pass; full suite 71/71; `next build` clean

**Checkpoint**: User Stories 1 and 2 both independently functional.

---

## Phase 5: User Story 3 - Historical Price Snapshot Integrity (Priority: P3)

**Goal**: A ticket's applied line-item cost never changes after a later catalogue price
update, and the Completed-lock (FR-015) holds even across a `003-ticket-lifecycle`
backward transition.

**Independent Test**: Apply a part, change its catalogue price, confirm the existing
ticket's line item is unaffected while a new ticket picks up the new price; move a
Completed ticket backward and confirm line items are still locked.

### Tests for User Story 3 ⚠️ Write first; confirm they fail before implementing

- [ ] T024 [P] [US3] Integration test for price-snapshot immutability after a catalogue cost change in `tests/integration/price-snapshot.test.ts`
- [ ] T025 [P] [US3] Integration test for the Completed-lock persisting across a `003-ticket-lifecycle` backward transition — the compound cross-spec case flagged in `quickstart.md` as the most important scenario to automate — in `tests/integration/completed-lock.test.ts`

### Implementation for User Story 3

- [ ] T026 [US3] Verify T004's Completed-lock check and T009's cost-snapshot logic satisfy T024-T025 without modification; if either test reveals a gap, harden `lib/billing/completed-lock.ts` or `lib/billing/line-items.ts` accordingly (depends on T004, T009)
- [ ] T027 [US3] Confirm T024-T025 pass; run `quickstart.md` Scenarios 3-4 (depends on T026)

**Checkpoint**: All three user stories independently functional — spec.md fully implemented.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T028 [P] Run the full `quickstart.md` validation (all 4 scenarios, all 6 success-criteria checklist items) end-to-end
- [ ] T029 [P] Accessibility audit (WCAG 2.1 AA) of the catalogue maintenance and line-item selection UI
- [ ] T030 [P] Security review: Super-Admin-only enforcement on every catalogue route, role/store scoping on every line-item route
- [ ] T031 Performance check: bill recalculation and catalogue list queries meet the constitution's <500ms p95
- [ ] T032 [P] Note the shared "first reached Completed" pattern (`research.md` §1) as a candidate for future consolidation with `005-customer-notifications` and `006-dashboard-reporting`, which each implement the same derived fact independently

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS every user story
- **User Stories (Phases 3-5)**: All depend on Foundational completion
  - US1 has no dependency on US2/US3
  - US2 depends only on Foundational (T002) — can run in parallel with US1
  - US3 depends on US1's line-item logic (T009) existing to test against, and on
    Foundational's Completed-lock (T004)
- **Polish (Phase 6)**: Depends on all three user stories being complete

### Within Each User Story

- Tests MUST be written and confirmed failing before implementation begins (constitution Principle I)
- Schema/utilities before routes; routes before UI
- Story's own "confirm tests pass + run quickstart scenario" task is last

### Parallel Opportunities

- T004 and T005 (Foundational) can run in parallel once T002/T003 land
- T006-T008 (US1 tests) can run in parallel — different files
- T016 and T017 (US2, parts vs. services CRUD) can run in parallel — different files
- T019 and T021 (US2, parts vs. services routes) can run in parallel
- T024 and T025 (US3 tests) can run in parallel — different files
- Once Foundational is done, US1 and US2 can be staffed in parallel (US2 doesn't depend on US1)
- T028-T030, T032 (Polish) can run in parallel

---

## Parallel Example: User Story 2

```bash
Task: "Implement parts CRUD in lib/catalogue/parts.ts"
Task: "Implement services CRUD in lib/catalogue/services.ts"
# Both independent of each other; both depend only on the Foundational schema (T002)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (blocks everything)
3. Complete Phase 3: User Story 1 — **requires a populated catalogue to test against**,
   so seed at least one part/service manually (or run Phase 4's CRUD tasks first, even
   though US1 doesn't strictly depend on the catalogue *maintenance* UI existing)
4. **STOP and VALIDATE**: run `quickstart.md` Scenario 2 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. + User Story 2 (catalogue exists to select from) → validate → deploy
3. + User Story 1 → validate → deploy (billing now live)
4. + User Story 3 → validate → deploy (integrity guarantees confirmed — spec.md complete)
5. Phase 6 Polish

Note this feature's natural build order is **US2 before US1** in practice (a catalogue
must exist before line items can reference it), even though spec.md ranks US1 as P1 by
business value — `/speckit-tasks`' phase ordering follows spec.md priority, but
`/speckit-implement` may reasonably sequence Phase 4 before Phase 3 to avoid needing
manually-seeded catalogue data for US1's own tests.

### Parallel Team Strategy

Once Foundational is done: Developer A takes US2 (catalogue CRUD); Developer B takes US1's
line-item logic against manually-seeded catalogue rows in parallel; both converge before
US3's integrity tests, which need both to exist.

---

## Notes

- [P] tasks touch different files with no unmet dependency
- [Story] labels trace every task back to its spec.md user story
- Every test task MUST be run and confirmed **failing** before its paired implementation task starts
- T032 flags cross-feature technical debt (duplicated Completed-lock-style logic) for
  future attention rather than silently accepting it
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently before continuing
