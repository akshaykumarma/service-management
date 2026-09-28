# API Contract: Machine Model & Store Administration

Per constitution Principle III. Common error shape as in prior contracts. Every endpoint
below requires Super Admin (`assertAccess`) — FR-001, FR-005, FR-011 — **except**
`GET`/`POST /api/admin/stores`, `PATCH /api/admin/stores/:id`, and every endpoint below
under Machine Models, all widened to Admin-or-above (post-v1, per direct product feedback:
"Admin and super admin should be able to edit the stores table", later extended to "...be
able to edit and add the new models/parts/services"). An Admin gets full parity with a
Super Admin on all of these — every store/model, not just their own — since none of this
is scoped data the way staff accounts are. Deciding *who* is an Admin of a store stays
Super-Admin-only: `POST`/`DELETE .../admins(/:userId)` are unchanged. Notification
templates (a separate contract) are unaffected and remain Super-Admin-only.

---

## `GET /api/admin/machine-models` / `POST /api/admin/machine-models`

**Request (POST)**: `{ "name": "string", "manufacturer": "string", "category": "string | null" }`

**Responses**:
- `201 { "machineModel": { "id", "name", "manufacturer", "category", "active": true } }`
- `409 { code: "duplicate_name" }` — an active model with this name already exists

---

## `PATCH /api/admin/machine-models/:id`

**Deviation** (post-v1, per direct product feedback): the admin UI previously only ever
sent `{ "active": false }` here (no Edit control existed) — `name`/`manufacturer`/
`category` were always accepted by this endpoint but never exercised. Now that Edit is a
real UI feature, a rename is checked against `isDuplicateActiveName` the same way
`POST` already is (a model can't be renamed onto another active model's name); renaming a
model to its own current name is never a collision.

**Request**: any subset of `{ "name", "manufacturer", "category": "string | null", "active": boolean }`

**Responses**: `200 { "machineModel": {...} }` · `404` · `409 { code: "duplicate_name" }`

---

## `POST /api/admin/machine-models/import`

Bulk CSV import. **Request**: multipart file, columns `name,manufacturer,category`.

**Responses**: `200 { "imported": number, "failed": [{ "row": number, "reason": "string" }] }` —
always `200`; failures are in the body (FR-004), same pattern as `004`'s parts import.

---

## `GET /api/admin/stores` / `POST /api/admin/stores`

**Request (POST)**: `{ "name", "storeCode", "address", "primaryContact", "whatsappNumber", "taxRate": number }`
— created with `active: false` by default; must be explicitly activated (see below) once
`whatsappNumber` validates.

**Deviation** (post-v1, per direct product feedback): `storeCode` — exactly 3 letters,
unique across stores (case-insensitively; stored uppercased) — is a new mandatory field.
It's the prefix `lib/tickets/ticket-number.ts` uses for every ticket created at this store
(`{storeCode}-{year}-{5-digit sequence}`), replacing the old flat `SVC` prefix used by
every store. Immutable once set — not accepted by `PATCH` below. Every store that predates
this field was backfilled by migration `0014` from the first 3 letters of its own name,
disambiguated with a numeric suffix wherever two existing stores' names collided on the
same 3 letters (so a handful of legacy rows have a code longer than 3 characters — only
ever possible for pre-migration data, never for a store created through this endpoint).

**Responses**:
- `201 { "store": {...}, "active": false } }`
- `400 { code: "invalid_tax_rate" }` — outside `[0, 100]`
- `400 { code: "missing_required_field", field: "storeCode" }` — absent/blank
- `400 { code: "invalid_store_code" }` — not exactly 3 letters
- `409 { code: "store_code_already_registered" }` — another store already has this code

---

## `PATCH /api/admin/stores/:id`

Edits fields and/or toggles `active`.

**Request**: any subset of `{ "name", "address", "primaryContact", "whatsappNumber", "taxRate", "active": boolean }`
— `storeCode` is immutable and not accepted here (silently ignored if sent).

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
