# API Contract: Catalogue & Ticket Billing

Per constitution Principle III: defined before implementation; one contract test per
endpoint. Common error shape and auth requirement as in prior features' contracts
(`{ "error": { "code", "message" } }`; valid session + `assertAccess()` required
everywhere). Catalogue maintenance (`POST`/`PATCH /api/catalogue/parts(/:id)`,
`POST`/`PATCH /api/catalogue/services(/:id)`, `POST /api/catalogue/parts/import`) was
originally Super-Admin-only and has since been widened to Admin-or-above — see the
Deviation note on each endpoint below.

---

## `GET /api/catalogue/parts` / `GET /api/catalogue/services`

Lists active catalogue entries (for ticket line-item selection dropdowns) — any
authenticated role may call these (selection, not maintenance).

**Responses**: `200 { "parts": [{ "id", "name", "sku", "unitCost", "category" }] }` (services analogous, no `sku`/`category`)

---

## `POST /api/catalogue/parts` / `POST /api/catalogue/services`

Creates a catalogue entry. **Requires**: Admin-or-above.

**Deviation** (post-v1, per direct product feedback: "...be able to edit and add the new
models/parts/services"): originally Super-Admin-only (FR-009). Widened to Admin-or-above,
mirroring the same widening already made to Stores and Machine Models — an Admin gets full
parity with a Super Admin here (every part/service, not just their own), since catalogue
entries aren't scoped data the way staff accounts are.

**Request (parts)**: `{ "name", "sku": "string | null", "unitCost": number, "category": "string | null" }`
**Request (services)**: `{ "name", "description": "string | null", "unitCost": number }`

**Responses**:
- `201 { "part" | "service": {...} }`
- `400 { code: "invalid_unit_cost" }` — negative or non-numeric
- `409 { code: "duplicate_name" }` — an active entry with this name already exists

---

## `PATCH /api/catalogue/parts/:id` / `PATCH /api/catalogue/services/:id`

Edits or deactivates an entry (`{ "active": false }` is how deactivation happens — no
separate delete endpoint, per `research.md` §5). **Requires**: Admin-or-above (same
Deviation as `POST` above — previously Super-Admin-only).

**Deviation** (post-v1, per direct product feedback): the admin UI previously only ever sent
`{ "active": false }` here (no Edit control existed) for either parts or services —
`name`/`sku`/`unitCost`/`category`/`description` were always accepted by this endpoint but
never exercised. Now that Edit is a real UI feature for both, **parts** gained a rename
collision check: a rename is checked against `isDuplicateActiveName` the same way `POST
/api/catalogue/parts` already is (a part can't be renamed onto another active part's name);
renaming a part to its own current name is never a collision. **Services have no such
check** — service names were never validated for duplicates even at creation, and this
change doesn't invent that constraint now.

**Responses**: `200 { "part" | "service": {...} }` · `404` — no such entry ·
`409 { code: "duplicate_name" }` — parts only, on a rename collision

---

## `POST /api/catalogue/parts/import`

Bulk CSV import (parts only, per spec.md's Assumptions). **Requires**: Admin-or-above (same
Deviation as above — previously Super-Admin-only).

**Request**: multipart file upload, CSV columns `name,sku,unit_cost,category`

**Responses**: `200 { "imported": number, "failed": [{ "row": number, "reason": "string" }] }` —
always `200` even with failures present; the response body itself carries the per-row
outcome (FR-013), not an error status for partial success

---

## `POST /api/tickets/:ticketId/line-items`

Adds a part or service to a ticket. **Requires**: caller's store scope includes this
ticket (`assertAccess`); ticket status is `in_progress` or `on_hold`.

**Deviation** (post-v1, per direct product feedback: "unable to update/add part or service
after moving the ticket from complete to in progress"): this spec's original FR-015 locked
the bill permanently the first time a ticket ever reached "Completed" ( `data-model.md`'s
Completed-lock, checked against `status_history` regardless of current status), even across
a later backward transition — so a ticket moved back to In Progress stayed uneditable
forever. Reversed: editability now depends only on the ticket's *current* status, exactly
like every other write this endpoint already gated on status. Reaching Completed again
re-blocks it, so this is symmetric, not a one-way "ever unlocked" flag. `bill_locked` is no
longer a real response — a ticket sitting at `completed` gets `ticket_status_invalid`
instead, the same code an `open`/`cancelled`/`delivered` ticket already got.

**Request**: `{ "itemType": "part | service", "itemId": "uuid", "quantity": number }`

**Responses**:
- `201 { "lineItem": { "id", "nameSnapshot", "quantity", "unitCostSnapshot", "lineTotal" }, "bill": { "subtotal", "taxAmount", "total" } }`
- `400 { code: "invalid_quantity" }` — zero or negative (FR-002)
- `400 { code: "item_inactive" }` — the referenced catalogue entry is deactivated (FR-012)
- `409 { code: "ticket_status_invalid" }` — ticket is `open`, `cancelled`, `delivered`, or
  `completed` (not `in_progress`/`on_hold`) — FR-001

---

## `PATCH /api/tickets/:ticketId/line-items/:lineItemId`

Changes a line item's quantity (recomputes `lineTotal` from the existing
`unitCostSnapshot` — never re-reads the catalogue). Same status precondition as above.

**Request**: `{ "quantity": number }`

**Responses**: `200 { "lineItem": {...}, "bill": {...} }` · same `400`/`409` codes as above

---

## `DELETE /api/tickets/:ticketId/line-items/:lineItemId`

Removes a line item. Same status precondition.

**Responses**: `200 { "bill": {...recalculated...} }` · `409 { code: "ticket_status_invalid" }` as above
