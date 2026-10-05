---

description: "Task list for Demo Board & Demo Tickets (008-demo-board)"
---

# Tasks: Demo Board & Demo Tickets

**Input**: Design documents from `/specs/008-demo-board/` (spec.md, plan.md, data-model.md,
contracts/demo-tickets-api.md).

**Tests**: Included and REQUIRED per constitution Principle I.

## Phase 1: Foundation (blocking)

- [X] T001 Schema + migration: `demo_ticket_status` enum, `demo_services`, `demo_tickets`, `demo_ticket_status_history`, `demo_ticket_number_counters`, `users.phone`, `notifications.demo_ticket_id`, `notification_type += demo_assignment` (lib/db/schema.ts, lib/db/migrations/)
- [X] T002 Test helpers: `resetDb` truncates the new tables; `createDemoService` / `createDemoTicket` factories (tests/helpers/)
- [X] T003 [P] Demo state machine with unit tests for every allowed/refused move (lib/demo/status-transitions.ts, tests/integration/demo-status-transitions.test.ts)

## Phase 2: User Story 4 — Demo services catalogue (P2, needed by US1)

- [X] T004 Tests: demo-services CRUD + role checks (tests/integration/demo-services.test.ts)
- [X] T005 `lib/catalogue/demo-services.ts` + `app/api/catalogue/demo-services/{route,[id]/route}.ts`
- [X] T006 Catalogue page "Demo services" section (app/(dashboard)/admin/catalogue/page.tsx)

## Phase 3: User Story 1 — Create demo tickets (P1)

- [X] T007 Tests: create (fields, validation, numbering, scope), history + 3rd-demo warning (tests/integration/demo-tickets-create.test.ts)
- [X] T008 Ticket numbers, short codes, history lookup, create (lib/demo/*) + `POST /api/demo-tickets`, `GET /api/demo-tickets/history`
- [X] T009 New Ticket page: Service/Demo switch, demo form, live history + warning (app/(dashboard)/tickets/new/page.tsx)

## Phase 4: User Story 2 — Demo Board (P1)

- [X] T010 Tests: list scoping, technician filter, completed-this-month, status transitions incl. technician_required (tests/integration/demo-board.test.ts)
- [X] T011 `GET /api/demo-tickets`, `PATCH /api/demo-tickets/:id/status`
- [X] T012 Extract `components/ticket-board.tsx` from the Service Board; Service Board + Demo Board pages; sidebar "Service Board" / "Demo Board"

## Phase 5: User Story 3 — Assignment + WhatsApp (P2)

- [X] T013 Tests: assign → Assigned + one queued message with short URL; reassign; same technician no-op; no phone; unassign → New; short link redirect (tests/integration/demo-assignment.test.ts)
- [X] T014 `users.phone` on Team page and users API; `PATCH /api/demo-tickets/:id/assign-technician`; WhatsApp job support; `GET /t/:code`; login `next`

## Phase 6: User Story 5 — Demo ticket page (P3)

- [X] T015 Tests: detail GET scope, edit details (lock, technician 403), activity (tests/integration/demo-ticket-detail.test.ts)
- [X] T016 `GET/PATCH /api/demo-tickets/:id`, `GET /api/demo-tickets/:id/activity`; page app/(dashboard)/demo-tickets/[id]/page.tsx

## Phase 7: Polish

- [X] T017 PRD update (docs/PRD-v1.1-source.md §16), full test suite, lint, e2e, screenshots
