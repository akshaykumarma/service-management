# API Contract: Tickets

Per constitution Principle III: defined before implementation; one contract test per
endpoint must fail with no implementation and pass once it exists.

**Common error shape**: `{ "error": { "code": "string", "message": "string" } }`

**Common auth requirement**: every endpoint requires a valid session (`002-auth-rbac`) and
is subject to `assertAccess(user, ticket.storeId)` — a Store Service Manager gets `403` on
any ticket outside their assigned store; an Admin outside their assigned stores likewise.

---

## `POST /api/tickets/photo-upload-url`

Issues a presigned MinIO upload URL for one intake photo, before the ticket itself exists
(intake photos are attached during the same form submission that creates the ticket).

**Request**: `{ "contentType": "image/jpeg | image/png", "sizeBytes": number }`

**Responses**:
- `200 { "uploadUrl": "string", "objectKey": "string", "expiresInSeconds": number }`
- `400 { code: "unsupported_content_type" }` — not JPEG/PNG
- `400 { code: "file_too_large" }` — over 5MB (`research.md` §5)

---

## `POST /api/tickets`

Creates a ticket. **Requires**: Store Service Manager (own store only), Admin (any
assigned store), or Super Admin (any store) — role scope per FR-006/FR-017.

**Request**:
```json
{
  "storeId": "uuid",
  "customerName": "string",
  "customerPhone": "string",
  "customerAltPhone": "string | null",
  "machineModel": "string",
  "issueDescription": "string",
  "estimatedPickupDate": "date | null",
  "photoObjectKeys": ["string", "... up to 5"]
}
```

**Responses**:
- `201 { "ticket": { "id", "ticketNumber", "status": "open", "createdAt", ... }, "history": { "found": boolean, "entries": [...] } }` —
  `history` is the FR-007/FR-008 lookup result, returned inline so the creator sees it
  immediately per spec Acceptance Scenario US1.1-3; `entries` is empty and `found: false`
  when nothing matches within the caller's visibility scope (FR-009)
- `400 { code: "missing_required_field", field: "string" }` — FR-001
- `400 { code: "too_many_photos" }` — more than 5 `photoObjectKeys` (FR-004)
- `403` — creator's role/store scope doesn't permit creating at `storeId`

---

## `GET /api/tickets`

Lists tickets, scoped to the caller's role/store visibility (same scoping as
`006-dashboard-reporting`'s board, which is the primary consumer of this endpoint).
Supports the same filters `006-dashboard-reporting` defines (store, status, date range,
ticket ID, customer name, machine model) as query parameters — filter semantics are that
spec's contract, not repeated here.

**Responses**: `200 { "tickets": [{ "id", "ticketNumber", "customerName", "machineModel", "status", "createdAt" }] }`

---

## `GET /api/tickets/:id`

Ticket detail, including its `status_history`. **Requires**: caller's scope includes this
ticket's store (`assertAccess`), **and**, for a `technician` caller only, that they are
this ticket's `assignedTechnicianId` (`assertTicketAccess` — see the Technician deviation
below). Every other role needs only the store check.

**Responses**:
- `200 { "ticket": {...full fields..., "assignedTechnicianId", "assignedTechnicianName" }, "statusHistory": [{ "fromStatus", "toStatus", "actorId", "actorName", "comment", "createdAt" }], "photos": [{ "objectKey", "url" }] }`
- `404` — no such ticket, caller's scope excludes it, or (for a `technician`) the ticket
  isn't assigned to them — the same response in every case, no existence leak

---

## `GET /api/tickets/:id/technicians`

**Deviation** (post-v1, per direct product feedback introducing the `technician` role):
lists the active Technicians assigned to this ticket's own store, for the Service
Manager's assign-technician picker. **Requires**: caller's scope includes this ticket's
store (store scope alone — this is a read used to choose who to assign, not an action
gated by an assignment that doesn't exist yet).

**Responses**:
- `200 { "technicians": [{ "id", "name" }] }`
- `404` — no such ticket, or caller's scope excludes it

---

## `PATCH /api/tickets/:id/assign-technician`

**Deviation** (post-v1, per direct product feedback): sets, or clears with
`technicianId: null`, the one Technician assigned to this ticket — the Service Manager's
own action, so a Technician may not assign themselves or anyone else even though they're
in scope for the store. **Requires**: caller's scope includes this ticket's store, and
caller's role is not `technician`.

**Request**: `{ "technicianId": "uuid | null" }`

**Responses**:
- `200 { "ticket": {...updated..., "assignedTechnicianId" } }`
- `400 { code: "invalid_technician" }` — `technicianId` isn't an active Technician
  assigned to this ticket's store
- `403 { code: "forbidden" }` — caller's role is `technician`
- `404` — no such ticket, or caller's scope excludes it

---

## `PATCH /api/tickets/:id/status`

Changes a ticket's status. **Requires**: role/comment gates per FR-011 through FR-014,
FR-017, FR-018 (see `data-model.md`'s State Transitions).

**Request**: `{ "toStatus": "in_progress | on_hold | completed | delivered | cancelled | open", "comment": "string | null" }`

**Responses**:
- `200 { "ticket": {...updated...}, "historyEntry": {...the row just inserted...} }` — on a
  last-write-wins race (FR-019), this is simply the normal success response for whichever
  request's transaction commits second; no special "conflict" status is ever returned for
  this reason
- `400 { code: "comment_required" }` — target transition requires a comment and none was
  provided (FR-012, FR-013, FR-014)
- `400 { code: "invalid_transition" }` — not a transition this status sequence allows (e.g.,
  Cancelled → anything)
- `403 { code: "role_not_permitted" }` — e.g., Store Service Manager attempting Cancelled
  (FR-014) or a backward transition out of Delivered (FR-018). **Deviation** (post-v1):
  Technician is restricted the same way as Service Manager for both of these — it's the
  more junior of the two.
