# Contract: Demo tickets API (008)

All routes require a valid session. State-changing routes require the same-origin (CSRF) check.
Errors use the app's standard `{ "error": { "code": string, ... } }` shape. A ticket outside the
caller's scope is always `404 not_found` (no existence leak).

## `GET /api/demo-tickets`

Same query parameters as `GET /api/tickets` (`storeId[]`, `status[]`, `dateFrom`, `dateTo`,
`ticketId`, `customerName`, `customerPhone`, `machineModel`, `technicianId`, `includeCancelled`).
Technicians only see demos assigned to them. Completed demos are only included when completed in
the current calendar month (Asia/Kolkata).

`200 { "tickets": [{ id, ticketNumber, customerName, machineModel, status, createdAt, daysOpen,
demoDate, storeId, storeName, technicianName }] }`

## `POST /api/demo-tickets`

Body: `storeId, customerName, customerPhone, machineModel, serialNumber, invoiceNumber,
demoServiceId, receivedDate (YYYY-MM-DD, optional = today), demoDate (YYYY-MM-DD)`.

- `201 { ticket: { id, ticketNumber, status: "new", createdAt }, history: HistoryResult }`
- `400 missing_required_field {field}` · `invalid_received_date` · `received_date_in_future` ·
  `invalid_demo_date` · `demo_date_before_received` · `invalid_demo_service`
- `403 forbidden` (store out of scope) · `409 store_inactive`

## `GET /api/demo-tickets/history?serialNumber=&invoiceNumber=[&excludeId=]`

`200 HistoryResult = { entries: [{ id, ticketNumber, status, serialNumber, invoiceNumber,
demoServiceName, demoDate, createdAt }], activeCount: number, warning: boolean }` —
entries match serial **or** invoice (case/space-insensitive), within the caller's stores, newest
first. `activeCount` excludes cancelled; `warning = activeCount >= 2`.

## `GET /api/demo-tickets/:id`

`200 { ticket: {...all columns, storeName, assignedTechnicianName, assignedTechnicianHasPhone,
shortUrl}, demoHistory: HistoryResult }`

## `PATCH /api/demo-tickets/:id` — edit details

Any subset of `customerName, customerPhone, machineModel, serialNumber, invoiceNumber,
demoServiceId, demoDate`. Technician → `403`. Completed/Cancelled → `409 ticket_locked`.
`400 missing_required_field | invalid_field | invalid_demo_service | demo_date_before_received`.
`200 { ticket }`.

## `PATCH /api/demo-tickets/:id/status`

Body `{ toStatus, comment? }` → `200 { ticket }` or `400 invalid_transition | comment_required |
technician_required`, `403 role_not_permitted`.

## `PATCH /api/demo-tickets/:id/assign-technician`

Body `{ technicianId: string | null }`. Technician callers → `403`. Must be an active technician of
the ticket's store → else `400 invalid_technician`. Completed/Cancelled → `409 ticket_locked`.
Side effects: New→Assigned on assign; Assigned→New on unassign; WhatsApp to a newly assigned
technician. `200 { ticket, whatsapp: "queued" | "no_phone" | "not_sent" }`.

## `GET /api/demo-tickets/:id/activity`

`200 { entries: [{ source: "status" | "edit" | "assignment" | "notification", actor, timestamp,
description }] }` oldest first.

## `GET /t/:code`

`302` to `/demo-tickets/:id` (logged in) or `/login?next=/demo-tickets/:id`; unknown code `404`.

## Catalogue: `/api/catalogue/demo-services`

`GET` (active list) · `POST {name, description?, unitCost}` →
`201` · `PATCH /:id {name?, description?, unitCost?, active?}` → `200`. Same roles and validation
as `/api/catalogue/services`.

## Reports *(follow-up, FR-013)*

- `GET /api/reports/demo-tickets` — same query parameters as `GET /api/demo-tickets` plus
  `serialNumber`, `invoiceNumber`; includes Cancelled. Service Manager and above (Technician
  `403`), store-scoped. `200 { tickets: [{ id, ticketNumber, storeName, customerName,
  customerPhone, machineModel, serialNumber, invoiceNumber, demoServiceName, demoServicePrice,
  demoDate, status, createdAt, technicianName }] }`
- `GET /api/reports/export?type=demo-details&format=xlsx|csv|pdf&…same filters` — the same rows
  with a `Total (N demos)` row summing the price.

## Users

`POST /api/auth/users` and `PATCH /api/auth/users/:id` accept optional `phone` (string or null).
