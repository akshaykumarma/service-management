# Phase 1 Data Model: Authentication & Role-Based Access Control

Entities below extend Auth.js's standard database-adapter schema (`users`, `sessions`)
rather than replacing it, per `research.md` §1-2. Full column-level SQL/migrations belong to
implementation tasks, not this document — this captures fields, types, constraints, and
relationships derived from spec.md's requirements.

## Entities

### `users` (spec.md: Staff Account)

| Field | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | required |
| `email` | text | required, unique, case-insensitive |
| `password_hash` | text | required; bcrypt, cost 12 (constitution) |
| `role` | enum(`super_admin`, `admin`, `service_manager`) | required (spec FR-001) |
| `active` | boolean | default `true` (spec FR-013) |
| `created_at` | timestamptz | required |
| `updated_at` | timestamptz | required |

**Validation rules**:
- Exactly one of the three role values (FR-001).
- Email uniqueness is a hard DB constraint, not just application-level (prevents a race
  creating two accounts with the same email).
- `active = false` is set, never a row deletion — spec FR-013 requires historical
  attribution to survive deactivation (see `audit_log` below); "delete" in the UI maps to
  this soft-deactivation, not a destructive row delete, for any user with existing ticket
  history. (A never-used account with zero history may be hard-deleted; not a data-integrity
  concern either way.)
- **Cross-row invariant (FR-020)**: before setting a `super_admin` row's `active` to
  `false`, the application MUST verify at least one *other* row has `role = 'super_admin'
  AND active = true`; if not, reject the operation. This cannot be expressed as a simple
  column constraint — it's enforced in the deactivation service function, inside the same
  transaction that would perform the update, to avoid a race between the check and the write.

### `user_stores` (spec.md: store assignment, join between Staff Account and Store)

| Field | Type | Constraints |
|---|---|---|
| `user_id` | uuid | FK → `users.id` |
| `store_id` | uuid | FK → `stores.id` (owned by `007-admin-console`) |

**Validation rules**:
- Composite PK (`user_id`, `store_id`) — no duplicate assignment rows.
- `role = 'service_manager'` rows: application MUST enforce exactly one `user_stores` row
  at all times (FR-002, FR-017) — a partial unique index on `user_id` where the joined
  user's role is `service_manager` is the intended DB-level backstop, checked at the
  application layer since the role lives on a different table.
- `role = 'admin'` rows: one or more allowed (FR-003); zero is rejected at creation time
  (FR-017) but not retroactively enforced if all a store's assignments are later removed —
  removing an Admin's *last* store assignment is allowed (spec doesn't forbid it), it just
  means they can act on nothing until reassigned.
- `role = 'super_admin'`: no rows needed here at all — visibility is global by definition
  (FR-004), not represented via this join table.

### `sessions` (spec.md: Session) — Auth.js database-session table, extended

| Field | Type | Constraints |
|---|---|---|
| `session_token` | text | PK, opaque random value |
| `user_id` | uuid | FK → `users.id` |
| `expires_at` | timestamptz | absolute expiry (Auth.js default field) |
| `last_active_at` | timestamptz | **added field** — drives the idle-timeout check (FR-006) |

**Validation rules**:
- A request updates `last_active_at` to now on each successful, authorized use of the
  session (sliding idle window), per spec Acceptance Scenario US1.2.
- A session is valid only if `now - last_active_at < idle_timeout` AND the joined `users`
  row has `active = true` (FR-019 — this join is what makes revocation live, not a
  separate invalidation step).
- Idle timeout value: a deployment-time configuration constant (default 8 hours per
  spec/PRD), not a per-request or per-user override — spec's "configurable" language refers
  to deployment configuration, not a Super Admin-facing settings screen (none is specified).

### `password_reset_tokens` (spec.md: Password Reset Request)

| Field | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK → `users.id` |
| `token_hash` | text | required, unique — **hash of the token**, never the plaintext value (the plaintext is only ever in the emailed link) |
| `expires_at` | timestamptz | issuance + 30 minutes (FR-008) |
| `used_at` | timestamptz | nullable; set on successful use, making the token single-use (FR-009) |
| `created_at` | timestamptz | required |

**Validation rules**:
- A token is valid only if `used_at IS NULL AND now < expires_at`.
- Requesting a new reset for the same user does not need to invalidate a still-valid prior
  token explicitly — spec doesn't require single-active-token-per-user, only that each
  individual token is single-use and time-limited.
- Rate limiting on *requesting* a reset (research.md §7) is tracked separately (e.g., a
  short-lived counter, not a persisted table) — implementation detail, not a data-model entity.

### `audit_log` (referenced by spec FR-018; shared table, PRD §9 shape)

| Field | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `actor_id` | uuid | FK → `users.id` — who performed the action |
| `entity_type` | text | e.g. `"user"`, `"user_stores"` for this feature's writes |
| `entity_id` | uuid | the affected row's id |
| `action` | text | e.g. `"deactivate"`, `"role_change"`, `"store_assign"`, `"store_unassign"` |
| `before_json` | jsonb | prior state snapshot |
| `after_json` | jsonb | new state snapshot |
| `ts` | timestamptz | required |

**Validation rules**:
- Append-only — no updates or deletes (constitution Technology & Domain Constraints).
- Retained ≥ 2 years (constitution Principle IV).
- Every FR-011/FR-012/FR-020 mutation (user CRUD, role/store change, deactivation) writes
  exactly one row here in the same transaction as the mutation itself.

## Relationships

```text
users (1) ───< user_stores >─── (N) stores [owned by 007-admin-console]
users (1) ───< sessions
users (1) ───< password_reset_tokens
users (1) ───< audit_log (as actor)
```

## State Transitions

**Staff Account (`users.active`)**:
`active = true` ⇄ `active = false`, both directions Super-Admin-only (FR-011), guarded by
the FR-020 last-super-admin invariant when transitioning a `super_admin` row to `false`.
No other state machine — role and store assignment are independent fields/rows updated by
the same Super-Admin-only path (FR-012), not a sequential lifecycle.

**Session validity** (derived, not a stored state): `valid` while
`now < expires_at AND now - last_active_at < idle_timeout AND users.active = true`;
otherwise `invalid` — computed per request, never transitioned/stored explicitly (FR-019).
