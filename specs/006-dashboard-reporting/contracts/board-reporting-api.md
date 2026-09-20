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

**Responses**:
- `200 { "tickets": [{ "id", "ticketNumber", "customerName", "machineModel", "status", "createdAt", "daysOpen" }] }`
  — empty array (not an error) when nothing matches (FR-016)

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
