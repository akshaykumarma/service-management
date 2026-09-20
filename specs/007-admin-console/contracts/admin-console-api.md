# API Contract: Machine Model & Store Administration

Per constitution Principle III. Common error shape as in prior contracts. Every endpoint
below requires Super Admin (`assertAccess`) — FR-001, FR-005, FR-011.

---

## `GET /api/admin/machine-models` / `POST /api/admin/machine-models`

**Request (POST)**: `{ "name": "string", "manufacturer": "string", "category": "string | null" }`

**Responses**:
- `201 { "machineModel": { "id", "name", "manufacturer", "category", "active": true } }`
- `409 { code: "duplicate_name" }` — an active model with this name already exists

---

## `PATCH /api/admin/machine-models/:id`

`{ "active": false }` deactivates (no delete endpoint, consistent with `004`'s catalogue
precedent).

**Responses**: `200 { "machineModel": {...} }` · `404`

---

## `POST /api/admin/machine-models/import`

Bulk CSV import. **Request**: multipart file, columns `name,manufacturer,category`.

**Responses**: `200 { "imported": number, "failed": [{ "row": number, "reason": "string" }] }` —
always `200`; failures are in the body (FR-004), same pattern as `004`'s parts import.

---

## `GET /api/admin/stores` / `POST /api/admin/stores`

**Request (POST)**: `{ "name", "address", "primaryContact", "whatsappNumber", "taxRate": number }`
— created with `active: false` by default; must be explicitly activated (see below) once
`whatsappNumber` validates.

**Responses**:
- `201 { "store": {...}, "active": false } }`
- `400 { code: "invalid_tax_rate" }` — outside `[0, 100]`

---

## `PATCH /api/admin/stores/:id`

Edits fields and/or toggles `active`.

**Request**: any subset of `{ "name", "address", "primaryContact", "whatsappNumber", "taxRate", "active": boolean }`

**Responses**:
- `200 { "store": {...} }`
- `400 { code: "invalid_whatsapp_number" }` — malformed format (FR-007's format check, `research.md` §4)
- `409 { code: "whatsapp_number_required_to_activate" }` — attempting `active: true` with
  no valid `whatsappNumber` on file

---

## `POST /api/admin/stores/:id/admins` / `DELETE /api/admin/stores/:id/admins/:userId`

Assigns/removes an Admin's association with this store. **Writes directly to
`002-auth-rbac`'s `user_stores` table** (`research.md` §3) — this is a UI convenience over
that feature's own data, not a separate assignment record.

**Responses**:
- `201` (assign) / `204` (remove)
- `404 { code: "user_not_admin_role" }` — target user isn't an Admin (this endpoint doesn't
  assign Store Service Managers, who are limited to exactly one store via `002`'s own rules)
