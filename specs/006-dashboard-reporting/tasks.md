---

description: "Task list for Kanban Board, Ticket Detail View & Reporting (006-dashboard-reporting)"
---

# Tasks: Kanban Board, Ticket Detail View & Reporting

**Input**: Design documents from `/specs/006-dashboard-reporting/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/board-reporting-api.md, quickstart.md (all present). Assumes `002-auth-rbac`,
`003-ticket-lifecycle`, `004-parts-services-catalogue`, `005-customer-notifications`, and
`007-admin-console` are already scaffolded. This feature introduces **zero new persisted
tables** — only one new index, plus queries, aggregation, and UI over existing schema
(`data-model.md`). All ticket status writes route through `003`'s existing
status-transition function; this feature never writes ticket status directly.

**Tests**: Included and REQUIRED per constitution Principle I (Test-First, NON-NEGOTIABLE).

**Organization**: Tasks are grouped by user story (spec.md priorities P1–P5).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [ ] T001 [P] Install `@dnd-kit/core` dependency for accessible drag-and-drop (`research.md` §4)
- [ ] T002 [P] Install `pdfkit` dependency for PDF report generation (`research.md` §5)
- [ ] T003 [P] Install `csv-stringify` dependency for CSV export (`research.md` §6)

**Checkpoint**: Dependencies available; no feature code yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The one schema change and the shared query utilities every user story depends on

**⚠️ CRITICAL**: No user story task may begin until this phase is complete

- [ ] T004 Add `CREATE INDEX idx_tickets_customer_name ON tickets (customer_name)` to `lib/db/schema.ts` (`data-model.md` — the only schema change this feature makes)
- [ ] T005 Generate and run the migration (depends on T004)
- [ ] T006 Implement the single shared scoped-query function — role/store visibility (per `002`'s scoping rules) AND the FR-008/FR-009 filter criteria in one place, so board scoping and filter-choice scoping can never drift apart (`research.md` §2) — in `lib/board/ticket-query.ts` (depends on T005)
- [ ] T007 [P] Implement the ticket-card projection, including the `days_open` computation that freezes once a ticket reaches a terminal status (`data-model.md`) in `lib/board/card-shape.ts` (depends on T006)
- [ ] T008 [P] Implement `lib/reporting/first-completed.ts` — `SELECT MIN(created_at) FROM status_history WHERE ticket_id = $1 AND to_status = 'completed'` (`research.md` §1) — functionally consistent with, but not sharing code with, `004`'s Completed-lock and `005`'s once-only-notification check (depends on T005)

**Checkpoint**: Schema and shared query utilities exist — user story work can begin.

---

## Phase 3: User Story 1 - Kanban Board Overview of All Tickets (Priority: P1) 🎯 MVP

**Goal**: A board showing every relevant ticket as a card in its status column, scoped to
the viewer's role/store, auto-refreshing every 30 seconds.

**Independent Test**: With seeded tickets across multiple statuses, load the board and
confirm each ticket appears as a card in the column matching its current status, showing
the required summary fields.

### Tests for User Story 1 ⚠️ Write first; confirm it fails before implementing

- [ ] T009 [P] [US1] Integration test for board role/store scoping (Store Service Manager sees only their store; Admin sees assigned stores; Super Admin sees all) in `tests/integration/board-scoping.test.ts`

### Implementation for User Story 1

- [ ] T010 [US1] Extend `GET /api/tickets` (already exists from `003`) to return the board-card shape via `ticket-query.ts` and `card-shape.ts` in `app/api/tickets/route.ts` (depends on T006, T007)
- [ ] T011 [US1] Build the kanban board UI — one column per status, cards showing Ticket ID/customer name/machine model/creation date/days-open, 30-second poll refresh (`research.md`'s client-side polling decision) — in `app/(dashboard)/board/page.tsx` (depends on T010)
- [ ] T012 [US1] Confirm T009 passes; run `quickstart.md` Scenario 1 (depends on T010-T011)

**Checkpoint**: User Story 1 fully functional and independently testable/deployable (MVP).

---

## Phase 4: User Story 2 - Drag-and-Drop Status Updates (Priority: P2)

**Goal**: Move a ticket to a different status by dragging its card to another column,
subject to `003`'s existing transition rules, with a mandatory-comment prompt mid-drag when
required.

**Independent Test**: Drag a card to a valid next-status column and confirm the update;
drag to an invalid column and confirm the move is rejected and the card returns.

### Tests for User Story 2 ⚠️ Write first; confirm it fails before implementing

- [ ] T013 [P] [US2] Playwright test for valid and invalid drag transitions via both pointer and `@dnd-kit`'s keyboard activation path (WCAG 2.1 AA) in `tests/integration/drag-and-drop.test.ts`

### Implementation for User Story 2

- [ ] T014 [US2] Wire `@dnd-kit` drag interactions on the board to `003`'s existing `PATCH /api/tickets/:id/status` endpoint — never a duplicate status-write path — rejecting invalid transitions (FR-006) and prompting for a mandatory comment mid-drag when the target transition requires one (FR-007); the ticket detail page's own status controls remain the non-drag fallback (`plan.md`'s accessibility constraint) — in `app/(dashboard)/board/page.tsx` (depends on T011)
- [ ] T015 [US2] Confirm T013 passes; run `quickstart.md` Scenario 2 (depends on T014)

**Checkpoint**: User Stories 1 and 2 both independently functional.

---

## Phase 5: User Story 3 - Filtered Search Across Tickets (Priority: P3)

**Goal**: Narrow the board/list by store, status, date range, ticket ID, customer name, or
machine model, combined with AND; store choices restricted to the viewer's visible stores.

**Independent Test**: With a mixed set of seeded tickets, apply each filter type
individually and confirm only matching tickets are shown.

### Tests for User Story 3 ⚠️ Write first; confirm they fail before implementing

- [ ] T016 [P] [US3] Contract tests for `GET /api/tickets`'s filter query parameters (all documented combinations) in `tests/contract/board-reporting-api.test.ts`
- [ ] T017 [P] [US3] Integration test for each filter individually and combined (AND, FR-009), plus the Customer Name filter matching each ticket's own historical intake-time name rather than a later-corrected canonical name (FR-008, SC-008) in `tests/integration/filters.test.ts`

### Implementation for User Story 3

- [ ] T018 [US3] Extend `GET /api/tickets` to accept `storeId[]`/`status[]`/`dateFrom`/`dateTo`/`ticketId`/`customerName`/`machineModel` query params, all routed through `ticket-query.ts` (already scoping-aware from T006) in `app/api/tickets/route.ts` (depends on T006)
- [ ] T019 [US3] Add the filter UI (store/status/date-range/ticket-ID/customer-name/machine-model) to the board page, restricting the store filter's choices to the viewer's visible stores (FR-010), with a clear empty-state when nothing matches (FR-016) in `app/(dashboard)/board/page.tsx` (depends on T018, T011)
- [ ] T020 [US3] Confirm T016-T017 pass; run `quickstart.md` Scenario 3 (depends on T018-T019)

**Checkpoint**: User Stories 1-3 independently functional.

---

## Phase 6: User Story 4 - Ticket Detail View with Full Audit Trail (Priority: P4)

**Goal**: A single ticket's detail view consolidates intake info, service history, status
timeline, parts/services with bill summary, WhatsApp notification log, OTP verification
outcome, and a complete audit trail, with zero gaps against what other specs recorded.

**Independent Test**: Open a ticket that has gone through intake, status changes,
parts/services, a notification, and delivery, and confirm every section shows accurate,
complete information.

### Tests for User Story 4 ⚠️ Write first; confirm they fail before implementing

- [ ] T021 [P] [US4] Contract test for `GET /api/tickets/:id/audit-trail` in `tests/contract/board-reporting-api.test.ts`
- [ ] T022 [P] [US4] Integration test asserting the consolidated audit trail has zero gaps against what `003`-`005` independently recorded (SC-005) in `tests/integration/ticket-detail-audit.test.ts`

### Implementation for User Story 4

- [ ] T023 [US4] Implement the consolidated audit-trail merge — `UNION ALL` across `status_history`, `ticket_line_items`, `notifications`, `otp_verifications`, and `delivery_overrides`, chronologically sorted, as a read-time view rather than a new stored table (`data-model.md`) — in `lib/audit/consolidated-trail.ts` (depends on T005)
- [ ] T024 [US4] Implement `GET /api/tickets/:id/audit-trail` in `app/api/tickets/[id]/audit-trail/route.ts` (depends on T023)
- [ ] T025 [US4] Extend the ticket detail page with all required sections — Intake Info, Service History, Status Timeline, Parts & Services with Bill Summary, WhatsApp Notification Log, OTP Verification outcome, and Audit Trail (FR-011) — in `app/(dashboard)/tickets/[id]/page.tsx` (depends on T024)
- [ ] T026 [US4] Confirm T021-T022 pass; run `quickstart.md` Scenario 4 (depends on T023-T025)

**Checkpoint**: User Stories 1-4 independently functional.

---

## Phase 7: User Story 5 - Exportable Summary Reports (Priority: P5)

**Goal**: Admin/Super Admin export a filtered ticket list or a per-store summary (totals,
status breakdown, average resolution time, parts/services revenue) as CSV or PDF, for a
chosen date range; Store Service Managers are denied.

**Independent Test**: Apply a date range and store filter, export as both CSV and PDF, and
confirm the exported content matches what's shown on-screen for that filter.

### Tests for User Story 5 ⚠️ Write first; confirm they fail before implementing

- [ ] T027 [P] [US5] Contract tests for `GET /api/reports/summary` and `GET /api/reports/export` (all documented responses, including `403` for Store Service Manager and `400 invalid_format`) in `tests/contract/board-reporting-api.test.ts`
- [ ] T028 [P] [US5] Integration test for summary aggregation — first-Completed period attribution (FR-017, SC-006), Open-to-Completed resolution time excluding pickup wait (FR-018, SC-007), and parts/services revenue split — in `tests/integration/summary-report.test.ts`

### Implementation for User Story 5

- [ ] T029 [US5] Implement the summary aggregation (total tickets, breakdown by current status, average resolution time, parts revenue, services revenue — joining `first-completed.ts` once per ticket per `data-model.md`) in `lib/reporting/summary.ts` (depends on T008)
- [ ] T030 [US5] Implement CSV export (list export from `ticket-query.ts`'s results, or summary export from `summary.ts`'s aggregates) in `lib/reporting/csv-export.ts` (depends on T006, T029)
- [ ] T031 [US5] Implement PDF export via `pdfkit`, matching the same two export shapes as T030 exactly (spec.md's own requirement: exported content matches what's shown on screen) in `lib/reporting/pdf-export.ts` (depends on T006, T029)
- [ ] T032 [US5] Implement `GET /api/reports/summary` (Admin/Super-Admin-only, FR-015) in `app/api/reports/summary/route.ts` (depends on T029)
- [ ] T033 [US5] Implement `GET /api/reports/export` (`format=csv|pdf` query param, list or summary export via `type=summary`, Admin/Super-Admin-only) in `app/api/reports/export/route.ts` (depends on T030, T031)
- [ ] T034 [US5] Build the reports UI (summary display, date-range/store selectors, CSV/PDF export controls) in `app/(dashboard)/reports/page.tsx` (depends on T032-T033)
- [ ] T035 [US5] Confirm T027-T028 pass; run `quickstart.md` Scenario 5 (depends on T029-T034)

**Checkpoint**: All five user stories independently functional — spec.md fully implemented.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T036 [P] Run the full `quickstart.md` validation (all 5 scenarios, all 8 success-criteria checklist items) end-to-end
- [ ] T037 [P] E2E test for the full board-to-report flow in `tests/e2e/board-to-report.spec.ts`
- [ ] T038 [P] Accessibility audit (WCAG 2.1 AA) of the board (including keyboard drag-and-drop), filters, ticket detail view, and reports UI
- [ ] T039 [P] Security review: confirm board, filter, and export endpoints all resolve visibility through T006's single shared `ticket-query.ts` function rather than any ad hoc re-implementation of scoping (`research.md` §2's whole point)
- [ ] T040 Performance check: board load and filter queries meet the constitution's <500ms p95, and confirm T004's `idx_tickets_customer_name` index is actually used by the Customer Name filter's query plan
- [ ] T041 [P] Note the "first reached Completed" derived-fact check (`research.md` §1) as now triplicated across `004`'s Completed-lock, `005`'s once-only-notification trigger, and this feature's own `first-completed.ts` — a recommended follow-up refactor (a shared utility or SQL view) flagged for visibility, not silently accepted a third time

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS every user story
- **User Stories (Phases 3-7)**: All depend on Foundational completion
  - US1 has no dependency on US2-US5
  - US2 depends on US1's board UI (T011) existing as the surface it adds drag interactions to
  - US3 depends only on Foundational (T006) for its API work (T018), but its UI (T019) extends US1's board page
  - US4 depends only on Foundational (T005, for T023) — can be built in parallel with US1-US3
  - US5 depends only on Foundational (T006, T008) — can be built in parallel with US1-US4
- **Polish (Phase 8)**: Depends on all five user stories being complete

### Within Each User Story

- Tests MUST be written and confirmed failing before implementation begins (constitution Principle I)
- Shared utilities before routes; routes before UI
- Story's own "confirm tests pass + run quickstart scenario" task is last

### Parallel Opportunities

- T001-T003 (Setup) can all run in parallel
- T007 and T008 (Foundational) can run in parallel once T006 lands
- T016-T017 (US3 tests) can run in parallel — different files
- T021-T022 (US4 tests) can run in parallel — different files
- T027-T028 (US5 tests) can run in parallel — different files
- T030 and T031 (US5, CSV vs. PDF export) can run in parallel — different files
- Once Foundational is done, US1, US4, and US5 can be staffed in parallel (US2 needs US1's board UI first; US3's UI needs US1's board page but its API work doesn't)
- T036-T039, T041 (Polish) can run in parallel

---

## Parallel Example: User Stories 1, 4, and 5

```bash
# Once Foundational (T004-T008) is done, these can proceed in parallel:
Task: "US1: Build the kanban board UI in app/(dashboard)/board/page.tsx"
Task: "US4: Implement the consolidated audit-trail merge in lib/audit/consolidated-trail.ts"
Task: "US5: Implement summary aggregation in lib/reporting/summary.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (blocks everything)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: run `quickstart.md` Scenario 1 independently
5. Deploy/demo if ready — staff get at-a-glance board visibility even before drag-and-drop,
   filters, detail view, or reporting exist

### Incremental Delivery

1. Setup + Foundational → foundation ready (one index, shared scoping/query utilities)
2. + User Story 1 → validate → deploy (MVP — board visibility)
3. + User Story 2 → validate → deploy (drag-and-drop convenience live)
4. + User Story 3 → validate → deploy (filtered search live)
5. + User Story 4 → validate → deploy (full ticket detail/audit view live)
6. + User Story 5 → validate → deploy (reporting/export live — spec.md complete)
7. Phase 8 Polish

### Parallel Team Strategy

Once Foundational is done: Developer A takes US1→US2→US3 (the board and its interactions,
since these build on the same page sequentially); Developer B takes US4 (ticket detail/audit
view) independently; Developer C takes US5 (reporting/export) independently — both B and C
only need Foundational, not A's board work.

---

## Notes

- [P] tasks touch different files with no unmet dependency
- [Story] labels trace every task back to its spec.md user story
- Every test task MUST be run and confirmed **failing** before its paired implementation task starts
- T014 routes every drag-and-drop status change through `003`'s existing status-transition
  endpoint — do not introduce a second status-writing code path
- T041 flags this feature's own instance of the "first reached Completed" derived-fact
  pattern as the third independent implementation (after `004` and `005`) — worth
  consolidating together rather than accumulating a fourth copy in some future feature
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently before continuing
