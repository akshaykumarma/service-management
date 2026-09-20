# API Contract: Catalogue & Ticket Billing

Per constitution Principle III: defined before implementation; one contract test per
endpoint. Common error shape and auth requirement as in prior features' contracts
(`{ "error": { "code", "message" } }`; valid session + `assertAccess()` required
everywhere).

---

## `GET /api/catalogue/parts` / `GET /api/catalogue/services`

Lists active catalogue entries (for ticket line-item selection dropdowns) — any
authenticated role may call these (selection, not maintenance).

**Responses**: `200 { "parts": [{ "id", "name", "sku", "unitCost", "category" }] }` (services analogous, no `sku`/`category`)

---

## `POST /api/catalogue/parts` / `POST /api/catalogue/services`

Creates a catalogue entry. **Requires**: Super Admin (FR-009).

**Request (parts)**: `{ "name", "sku": "string | null", "unitCost": number, "category": "string | null" }`
**Request (services)**: `{ "name", "description": "string | null", "unitCost": number }`

**Responses**:
- `201 { "part" | "service": {...} }`
- `400 { code: "invalid_unit_cost" }` — negative or non-numeric
- `409 { code: "duplicate_name" }` — an active entry with this name already exists

---

## `PATCH /api/catalogue/parts/:id` / `PATCH /api/catalogue/services/:id`

Edits or deactivates an entry (`{ "active": false }` is how deactivation happens — no
separate delete endpoint, per `research.md` §5). **Requires**: Super Admin.

**Responses**: `200 { "part" | "service": {...} }` · `404` — no such entry

---

## `POST /api/catalogue/parts/import`

Bulk CSV import (parts only, per spec.md's Assumptions). **Requires**: Super Admin.

**Request**: multipart file upload, CSV columns `name,sku,unit_cost,category`

**Responses**: `200 { "imported": number, "failed": [{ "row": number, "reason": "string" }] }` —
always `200` even with failures present; the response body itself carries the per-row
outcome (FR-013), not an error status for partial success

---

## `POST /api/tickets/:ticketId/line-items`

Adds a part or service to a ticket. **Requires**: caller's store scope includes this
ticket (`assertAccess`); ticket status is `in_progress` or `on_hold`; the ticket's
Completed-lock (`data-model.md`) is not yet true.

**Request**: `{ "itemType": "part | service", "itemId": "uuid", "quantity": number }`

**Responses**:
- `201 { "lineItem": { "id", "nameSnapshot", "quantity", "unitCostSnapshot", "lineTotal" }, "bill": { "subtotal", "taxAmount", "total" } }`
- `400 { code: "invalid_quantity" }` — zero or negative (FR-002)
- `400 { code: "item_inactive" }` — the referenced catalogue entry is deactivated (FR-012)
- `409 { code: "ticket_status_invalid" }` — ticket is `open`, `cancelled`, or `delivered`
  (not `in_progress`/`on_hold`) — FR-001
- `409 { code: "bill_locked" }` — ticket has already reached "Completed" at some point,
  regardless of current status (FR-015, this spec's clarification)

---

## `PATCH /api/tickets/:ticketId/line-items/:lineItemId`

Changes a line item's quantity (recomputes `lineTotal` from the existing
`unitCostSnapshot` — never re-reads the catalogue). Same status/lock preconditions as
above.

**Request**: `{ "quantity": number }`

**Responses**: `200 { "lineItem": {...}, "bill": {...} }` · same `400`/`409` codes as above

---

## `DELETE /api/tickets/:ticketId/line-items/:lineItemId`

Removes a line item. Same status/lock preconditions.

**Responses**: `200 { "bill": {...recalculated...} }` · `409 { code: "bill_locked" }` as above
