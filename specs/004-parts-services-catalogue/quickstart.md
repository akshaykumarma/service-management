# Quickstart: Validating Parts & Services Selection, Billing, and Catalogue Maintenance

Validation guide — see `data-model.md` for schema, `contracts/catalogue-billing-api.md`
for exact shapes. Assumes `002-auth-rbac` and `003-ticket-lifecycle` are already running.

## Prerequisites

- A ticket in "In Progress" status (per `003-ticket-lifecycle`'s quickstart Scenario 2)
- A store with a configured tax rate (from `007-admin-console`, or a manually-seeded row
  if that feature isn't built yet)

## Scenario 1 — Catalogue maintenance (User Story 2)

```bash
curl -b super-admin-cookies.txt -X POST http://localhost:3000/api/catalogue/parts \
  -H 'Content-Type: application/json' \
  -d '{"name":"Drain Pump","sku":"DP-100","unitCost":850.00,"category":"Washing Machine"}'
# Expect: 201

curl http://localhost:3000/api/catalogue/parts
# Expect: 200, includes "Drain Pump"

curl -b super-admin-cookies.txt -X PATCH http://localhost:3000/api/catalogue/parts/<id> \
  -d '{"active": false}'
curl http://localhost:3000/api/catalogue/parts
# Expect: "Drain Pump" no longer listed
```

**CSV import**: submit a CSV with one valid row and one row missing `unit_cost` — expect
`200 { "imported": 1, "failed": [{ "row": 2, "reason": "..." }] }`, not a full-file rejection.

**RBAC**: repeat the `POST` as a Service Manager or Admin — expect `403`.

## Scenario 2 — Applying parts/services with automatic bill calculation (User Story 1)

```bash
curl -b sm-cookies.txt -X POST http://localhost:3000/api/tickets/<ticket-id>/line-items \
  -d '{"itemType":"part","itemId":"<drain-pump-id>","quantity":1}'
# Expect: 201, bill.subtotal = 850.00

curl -b sm-cookies.txt -X POST http://localhost:3000/api/tickets/<ticket-id>/line-items \
  -d '{"itemType":"service","itemId":"<diagnostic-service-id>","quantity":1}'
# Expect: 201, bill.subtotal reflects both lines, bill.taxAmount = subtotal * store's tax rate
```

Attempt the same on a ticket still in "Open" status — expect `409 ticket_status_invalid`.
Attempt with `quantity: 0` — expect `400 invalid_quantity`.

## Scenario 3 — Historical price snapshot integrity (User Story 3)

```bash
# Note Ticket A's line-item unitCostSnapshot (e.g., 850.00), then:
curl -b super-admin-cookies.txt -X PATCH http://localhost:3000/api/catalogue/parts/<drain-pump-id> \
  -d '{"unitCost": 950.00}'

curl http://localhost:3000/api/tickets/<ticket-a-id>
# Expect: the existing line item and bill still show 850.00

# Apply the same part to a NEW ticket:
curl -b sm-cookies.txt -X POST http://localhost:3000/api/tickets/<ticket-b-id>/line-items \
  -d '{"itemType":"part","itemId":"<drain-pump-id>","quantity":1}'
# Expect: 201, unitCostSnapshot = 950.00
```

## Scenario 4 — Permanent bill lock at Completed (this spec's clarification, FR-015)

```bash
# Move Ticket A to Completed (per 003-ticket-lifecycle), then attempt a line-item change:
curl -X PATCH .../api/tickets/<ticket-a-id>/status -d '{"toStatus":"completed"}'
curl -b sm-cookies.txt -X POST .../api/tickets/<ticket-a-id>/line-items -d '{"itemType":"part","itemId":"...","quantity":1}'
# Expect: 409 bill_locked

# Move it BACKWARD to In Progress (Admin, per 003's Delivered/backward rules) and retry:
curl -b admin-cookies.txt -X PATCH .../api/tickets/<ticket-a-id>/status -d '{"toStatus":"in_progress","comment":"reopening"}'
curl -b sm-cookies.txt -X POST .../api/tickets/<ticket-a-id>/line-items -d '{"itemType":"part","itemId":"...","quantity":1}'
# Expect: STILL 409 bill_locked — the lock does not lift on backward transition
```

This is the single most important scenario in this feature to automate
(`tests/integration/completed-lock.test.ts`) — it's exactly the cross-spec interaction
(`003`'s backward transition + `004`'s billing lock) that's easy to get wrong by only
testing the straightforward "still Completed" case.

## Success criteria checklist (from spec.md)

- [ ] SC-001: Scenario 2's bill = subtotal + tax exactly, no floating-point discrepancy
- [ ] SC-002: Scenario 3 passes — Ticket A's price never changes after a catalogue update
- [ ] SC-003: a new catalogue entry (Scenario 1) is immediately selectable, no per-store setup
- [ ] SC-004: the CSV import sub-scenario reports the failed row with a specific reason
- [ ] SC-005: the deactivated part (Scenario 1) never appears in `GET /api/catalogue/parts`
- [ ] SC-006: Scenario 4 passes in both the "still Completed" and "moved backward" cases
