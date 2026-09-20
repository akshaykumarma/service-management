# Quickstart: Validating Ticket Intake, History Lookup & Status Lifecycle

Validation guide — see `data-model.md` for schema and `contracts/tickets-api.md` for exact
request/response shapes. Assumes `002-auth-rbac` is already running (login/session/RBAC).

## Prerequisites

- Everything from `002-auth-rbac`'s quickstart (seeded Super Admin, working login)
- At least one `store` row and one Store Service Manager + one Admin, each assigned per
  `002-auth-rbac`'s Scenario 2
- MinIO running (Docker Compose) with a bucket for intake photos

## Scenario 1 — Intake with model-based history lookup (User Story 1)

```bash
# As a Store Service Manager at Store A, create a ticket for a never-before-seen model
curl -i -b store-a-sm-cookies.txt -X POST http://localhost:3000/api/tickets \
  -H 'Content-Type: application/json' \
  -d '{"storeId":"<store-a-id>","customerName":"Priya Sharma","customerPhone":"+91...", "machineModel":"LG-FHM1207ZDL","issueDescription":"Not spinning"}'
# Expect: 201, history.found === false
```

Move that ticket through `In Progress → Completed → Delivered` (Scenario 2 below), then
create a **second** ticket for the same `machineModel` at Store A:

```bash
curl -i -b store-a-sm-cookies.txt -X POST http://localhost:3000/api/tickets \
  -H 'Content-Type: application/json' \
  -d '{"storeId":"<store-a-id>","customerName":"Someone Else","customerPhone":"+91...","machineModel":"LG-FHM1207ZDL","issueDescription":"Different issue"}'
# Expect: 201, history.found === true, history.entries includes the first ticket
```

Repeat as a Store Service Manager at **Store B** for the same model — expect
`history.found === false` (store-scoped). Repeat as an Admin/Super Admin — expect the
Store A ticket to appear (cross-store visibility, FR-008).

**Photo limit**: attempt `POST /api/tickets` with 6 `photoObjectKeys` — expect
`400 too_many_photos`.

## Scenario 2 — Status lifecycle & Delivered-backward gate (User Story 2)

```bash
# Forward transitions, no comment needed except entering On Hold
curl -X PATCH .../api/tickets/<id>/status -d '{"toStatus":"in_progress"}'
curl -X PATCH .../api/tickets/<id>/status -d '{"toStatus":"completed"}'
curl -X PATCH .../api/tickets/<id>/status -d '{"toStatus":"delivered"}'

# As Store Service Manager, try to move it backward — expect 403
curl -X PATCH .../api/tickets/<id>/status -d '{"toStatus":"completed","comment":"oops"}'
# Expect: 403 role_not_permitted

# As Admin, same request — expect success
curl -b admin-cookies.txt -X PATCH .../api/tickets/<id>/status -d '{"toStatus":"completed","comment":"correcting a mistaken OTP confirmation"}'
# Expect: 200
```

Fetch `GET /api/tickets/<id>` and confirm `statusHistory` has one entry per transition
above, each with the correct actor and comment (or null where none was required).

## Scenario 3 — Mandatory-reason holds & cancellations (User Story 3)

```bash
curl -X PATCH .../api/tickets/<id>/status -d '{"toStatus":"on_hold"}'
# Expect: 400 comment_required

curl -X PATCH .../api/tickets/<id>/status -d '{"toStatus":"on_hold","comment":"waiting on part"}'
# Expect: 200

# As Store Service Manager, attempt Cancelled — expect 403
curl -X PATCH .../api/tickets/<id>/status -d '{"toStatus":"cancelled","comment":"customer withdrew"}'
# Expect: 403

# As Admin, same request — expect 200, then confirm it's excluded from GET /api/tickets
# default list but present when an "all tickets" filter is applied.
```

## Scenario 4 — Concurrent status change: last write wins (FR-019)

Fire two `PATCH .../status` requests for the same ticket at nearly the same time (e.g., two
parallel `curl` processes) with different `toStatus` values. Confirm:
- The ticket's final `status` matches whichever request's response arrived/committed second
  (not necessarily which was *sent* first — commit order, not send order).
- `GET /api/tickets/<id>`'s `statusHistory` contains **both** transitions, not just one.

This is worth a dedicated automated test
(`tests/integration/concurrent-status-change.test.ts`) rather than relying on manual
timing, since the race window is narrow.

## Scenario 5 — Ticket number collision check (concurrent creation)

Fire N concurrent `POST /api/tickets` requests for the same store. Confirm all N resulting
`ticketNumber` values are unique and sequential with no gaps or duplicates — validates
`research.md` §1's atomic counter.

## Success criteria checklist (from spec.md)

- [ ] SC-001: ticket intake (Scenario 1) completes well under 2 minutes end-to-end
- [ ] SC-002: history lookup (Scenario 1) is returned inline with ticket creation — no
  separate search step, effectively instant
- [ ] SC-003: Scenario 5 passes — zero ticket-number collisions
- [ ] SC-004: Scenario 3 passes — 0% of On Hold/Cancelled transitions lack a comment
- [ ] SC-005: every `statusHistory` entry across all scenarios has an actor and timestamp
- [ ] SC-006: a Cancelled ticket (Scenario 3) never appears in the default list, always in
  the all-tickets view
- [ ] SC-007: Scenario 2's backward-from-Delivered attempt is denied for Store Service
  Manager, succeeds for Admin, in both cases with the comment recorded
- [ ] SC-008: Scenario 4 passes — both concurrent transitions preserved, current status
  matches the second-committed one
