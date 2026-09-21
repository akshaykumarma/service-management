# API Contract: Authentication & User Management

Per constitution Principle III (API/Contract-First Design): this contract is defined before
implementation; contract tests (one per endpoint) must fail against no implementation and
pass once it exists. Breaking any shape below without a version bump is prohibited.

**Common error shape** (all endpoints, all non-2xx responses):

```json
{ "error": { "code": "string", "message": "string" } }
```

**Common auth requirement**: every endpoint below except `POST /api/auth/login` and the two
`password-reset` endpoints requires a valid session (per FR-019, re-checked live on every
call — an expired/deactivated session gets `401`, not a cached "still logged in" response).

---

## `POST /api/auth/login`

Authenticates with email/password, establishes a database session (Auth.js Credentials
provider under the hood).

**Request**:
```json
{ "email": "string", "password": "string" }
```

**Responses**:
- `200` — session cookie set (HttpOnly, Secure); body: `{ "user": { "id", "name", "email", "role" } }`
- `401 { code: "invalid_credentials" }` — wrong email/password (generic message, doesn't
  reveal which field was wrong)
- `423 { code: "account_locked", retryAfterSeconds: number }` — 5 consecutive failures
  within the current lockout window (FR-007)
- `403 { code: "account_deactivated" }` — credentials correct but account is inactive (FR-013)

---

## `POST /api/auth/logout`

Ends the current session.

**Responses**: `204` — session cookie cleared, session row deleted.

---

## `GET /api/auth/session`

Returns the current caller's identity and role/store scope, freshly evaluated (never from a
cached token — this endpoint's own correctness is how FR-019 is verified in contract tests).

**Responses**:
- `200 { "user": { "id", "name", "email", "role", "storeIds": string[] } }` — `storeIds` is
  empty for `super_admin` (global scope implied, per FR-004, not enumerated)
- `401` — no valid session

---

## `POST /api/auth/password-reset/request`

**Request**: `{ "email": "string" }`

**Responses**:
- `200 { "message": "If that email is registered, a reset link has been sent." }` — **always**
  this response, whether or not the email is registered (FR-010) and whether or not the
  request was rate-limited (research.md §7) — no distinguishable signal either way.

---

## `POST /api/auth/password-reset/confirm`

**Request**: `{ "token": "string", "newPassword": "string" }`

**Responses**:
- `200` — password updated; token marked used; all of that user's existing sessions are
  invalidated (a reset implies "I may have been compromised," so this is a deliberate
  exception to "no explicit session termination" — FR-019 governs *authorization* state
  changes, not a security-sensitive credential rotation like this one)
- `400 { code: "invalid_or_expired_token" }` — token unknown, already used, or past 30 minutes (FR-009)

---

## `GET /api/auth/users`

Lists staff accounts. **Requires**: `super_admin` or `admin` role (FR-011).

**Deviation from the original design**: originally Super-Admin-only; broadened (post-v1,
per direct product feedback enabling Admin-initiated password resets below) so an Admin
can list Store Service Managers within their own store(s) — a Super Admin still sees every
account. An Admin caller only ever sees `service_manager`-role accounts whose store
assignment overlaps their own; they never see other Admins, Super Admins, or
out-of-scope Service Managers.

**Responses**: `200 { "users": [{ "id", "name", "email", "role", "active", "storeIds" }] }`

---

## `POST /api/auth/users`

Creates a staff account. **Requires**: `super_admin` role (FR-011).

**Request**:
```json
{ "name": "string", "email": "string", "role": "admin | service_manager", "storeIds": ["uuid", "..."], "password": "string" }
```
(`role: "super_admin"` is not creatable via this endpoint in v1 — no spec'd flow for
creating a second Super Admin; only one is assumed to exist per deployment, seeded outside
this API.)

**Deviation from the original design** (documented here rather than silently changed): v1
of this contract had the system generate a one-time temporary password, returned once for
the Super Admin to relay to the new hire. Per direct product feedback, the Super Admin now
sets the account's initial password themselves at creation time — `password` is required
and checked against the same complexity rule as `/api/auth/users/:id/reset-password` and
self-service reset (`lib/auth/password-policy.ts`: 8+ characters, an uppercase letter, a
lowercase letter, and a special character). The response no longer carries a
`temporaryPassword`.

**Responses**:
- `201 { "user": { "id", "name", "email", "role", "active": true, "storeIds" } }`
- `400 { code: "invalid_password" }` — `password` fails the complexity rule
- `400 { code: "store_assignment_required" }` — `storeIds` empty for `admin`/`service_manager` (FR-017)
- `400 { code: "invalid_store_count" }` — `service_manager` with `storeIds.length !== 1` (FR-002)
- `400 { code: "invalid_store_id" }` — a `storeIds` entry doesn't exist
- `409 { code: "email_already_registered" }`

---

## `POST /api/auth/users/:id/reset-password`

Added post-v1, per direct product feedback: lets a Super Admin or Admin set a staff
member's password directly, without the affected user initiating a self-service reset.
**Requires**: `super_admin` (any staff account) or `admin` role, scoped to Store Service
Managers within the Admin's own store(s) — the same visibility boundary `GET
/api/auth/users` already enforces for Admins.

**Request**: `{ "password": "string" }` — same complexity rule as account creation.

**Responses**:
- `200 { "message": "Password reset." }` — also revokes every existing session for that
  user, the same credential-rotation exception to FR-019 that self-service reset uses
- `400 { code: "invalid_password" }`
- `403` — caller is a Store Service Manager (or unauthenticated)
- `404` — target doesn't exist, or (for an Admin caller) is outside their stores or isn't
  a Store Service Manager; a 404 rather than 403 so an out-of-scope id isn't confirmed to
  exist

---

## `PATCH /api/auth/users/:id`

Edits role/active state/store assignment. **Requires**: `super_admin` role (FR-011, FR-012).

**Request** (all fields optional; only provided fields change):
```json
{ "name": "string", "role": "admin | service_manager", "active": boolean, "storeIds": ["uuid"] }
```

**Responses**:
- `200 { "user": { ...same shape as GET } }`
- `400 { code: "invalid_store_count" }` — as above, if `role` is/becomes `service_manager`
- `409 { code: "last_super_admin" }` — attempting to set `active: false` on the last active
  `super_admin` (FR-020)
- `404` — no such user

Every successful call here writes an `audit_log` row (actor = caller, entity = this user,
before/after snapshot) per FR-018.

---

## `DELETE /api/auth/users/:id`

Hard-deletes a staff account. **Requires**: `super_admin` role.

**Responses**:
- `204` — deleted (only permitted if the user has zero historical ticket actions — otherwise
  the client should call `PATCH .../:id { "active": false }` instead, per data-model.md's
  soft-deactivation note)
- `409 { code: "has_history_use_deactivate" }` — user has attributed history; deletion refused
