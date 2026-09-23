# API Contract: Board, Filters & Reporting

Per constitution Principle III. Common error shape as in prior contracts. All endpoints
require a valid session; scoping per `assertAccess()`/role as noted per endpoint.

---

## `GET /api/tickets` (extended from `003-ticket-lifecycle`)

Adds this spec's filter query parameters to the endpoint `003` already defined.

**Query params**: `storeId[]`, `status[]`, `dateFrom`, `dateTo`, `ticketId`,
`customerName`, `machineModel` — all optional, combined with AND (FR-009). `storeId[]`'s
available values are restricted to the caller's visible stores (FR-010); omitting it
returns tickets across all stores the caller can see (not "no filter" in the sense of
bypassing scope).

**Deviation** (post-v1, per direct product feedback): `technicianId` — an additional
optional filter narrowing to one Technician's assigned tickets, on top of (not instead
of) everything above. For a `technician` caller this is redundant with their own forced
filter (`lib/board/ticket-query.ts`); it's meant for a Service Manager/Admin/Super Admin
picking a technician from `GET /api/technicians` below.

**Responses**:
- `200 { "tickets": [{ "id", "ticketNumber", "customerName", "machineModel", "status", "createdAt", "daysOpen" }] }`
  — empty array (not an error) when nothing matches (FR-016)

---

## `GET /api/technicians`

**Deviation** (post-v1, per direct product feedback): active Technicians within the
caller's visible store scope — populates the "filter by technician" picker on the board
and the Reports table (both pass the selected id as `technicianId` to the endpoints
above). Any authenticated role, scope-only, same pattern as `GET /api/stores`.

**Query params**: `storeId[]` (optional) — narrows the list to those store(s), e.g. the
board's own Store filter, so the technician picker never offers someone outside the
currently-filtered store(s). Intersected with the caller's own scope, same
never-escape-scope rule `GET /api/tickets`'s own `storeId[]` uses; omitting it returns
every technician in the caller's scope, same as before.

**Responses**: `200 { "technicians": [{ "id", "name" }] }`

---

## `GET /api/tickets/:id/audit-trail`

**Responses**: `200 { "entries": [{ "source": "status_history | line_item | notification | otp | override", "actor", "timestamp", "description" }] }` —
merged and chronologically sorted per `data-model.md`'s Consolidated Audit Trail

---

## `GET /api/reports/summary`

**Requires**: Admin or Super Admin (FR-015 denies Store Service Manager).

**Query params**: `storeId` (required), `dateFrom`, `dateTo` (required)

**Responses**:
```json
200 {
  "totalTickets": number,
  "byStatus": { "open": number, "in_progress": number, "on_hold": number, "completed": number, "delivered": number, "cancelled": number },
  "avgResolutionTimeHours": number,
  "partsRevenue": number,
  "servicesRevenue": number
}
```
- `403` — Store Service Manager

---

## `GET /api/reports/tickets`

**Deviation** (post-v1, per direct product feedback): the Reports page's table view — every
ticket's full detail, across every status, for a date range (not just first-Completed
counts the way `/api/reports/summary` is). **Requires**: Admin or Super Admin.

**Query params**: `storeId[]` (optional — omitting it returns every store in the caller's
scope, same as `GET /api/tickets`), `status[]`, `dateFrom`, `dateTo` (required),
`ticketId`, `customerName`, `customerPhone`, `machineModel`, `technicianId` — the same
filter set `GET /api/tickets` already offers. Unlike the board, every status is included
by default (Cancelled too) — a report needs the whole picture, not the board's default
working view.

**Responses**:
```json
200 {
  "tickets": [{
    "id", "ticketNumber", "storeId", "storeName", "customerName", "customerPhone",
    "machineModel", "issueDescription", "status", "createdAt", "estimatedPickupDate",
    "technicianName": "string | null",
    "subtotal": number, "taxAmount": number, "total": number
  }]
}
```
- `403` — Store Service Manager

---

## `GET /api/reports/export`

**Requires**: Admin or Super Admin.

**Query params**: `format` (`csv` | `pdf`, required), plus either the same filter params as
`GET /api/tickets` (list export) or `storeId`+`dateFrom`+`dateTo` (summary export, via
`type=summary`)

**Responses**:
- `200` — binary response, `Content-Type: text/csv` or `application/pdf`, content matching
  exactly what the equivalent `GET /api/tickets` or `GET /api/reports/summary` call would
  return for the same parameters (spec.md's own requirement: exported content matches
  what's shown on screen)
- `403` — Store Service Manager
- `400 { code: "invalid_format" }` — anything other than `csv`/`pdf`
