# Quickstart: Validating Authentication & RBAC

This is a validation guide, not an implementation guide — it proves the feature works
end-to-end once built. Full route/service code and migrations belong to `tasks.md` and the
implementation phase, not here. See `data-model.md` for schema and `contracts/auth-api.md`
for exact request/response shapes.

## Prerequisites

- PostgreSQL 15+ running (Docker Compose service, per `plan.md`'s Project Structure)
- Database migrated with the `users`, `user_stores`, `sessions`, `password_reset_tokens`,
  and `audit_log` tables from `data-model.md`
- One seed row: a `super_admin` user (this feature has no self-service way to create the
  *first* Super Admin — seeded directly, outside the API, per `contracts/auth-api.md`'s note
  on `POST /api/auth/users`)
- SMTP credentials configured (or a local mail-catcher like Mailhog) for password-reset email

## Scenario 1 — Login & session idle timeout (spec User Story 1)

```bash
# Log in as the seeded Super Admin
curl -i -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"<seed password>"}'
# Expect: 200, Set-Cookie present

curl -i -b cookies.txt http://localhost:3000/api/auth/session
# Expect: 200 { "user": { "role": "super_admin", ... } }
```

**Idle timeout**: fast-forward the session's `last_active_at` in the database (or reduce the
configured idle timeout to a few seconds for this test run) and re-request `/api/auth/session`
— expect `401`. This is exactly Acceptance Scenario US1.2.

**Lockout**: submit `/api/auth/login` with a wrong password 5 times in a row, then a 6th
time with the *correct* password — expect `423 account_locked` on the 6th attempt (US1.3).
After the configured lockout window (or with time manipulated in a test environment), the
correct password succeeds again with no manual intervention (spec SC-003).

## Scenario 2 — Role-scoped access enforcement (User Story 2)

1. As Super Admin, create an Admin assigned to Store A and B, and a Service Manager assigned
   to Store A only (`POST /api/auth/users`, twice).
2. Log in as the Service Manager; call an endpoint scoped to Store B (any future feature's
   store-scoped endpoint, or this feature's own `GET /api/auth/session` to confirm
   `storeIds: ["A"]` only) — the Service Manager must never see Store B.
3. Log in as the Admin; confirm `storeIds` includes both A and B, and attempt to reach a
   maintenance-console-only route (owned by `007-admin-console`) — expect `403`.

This validates FR-014/FR-015/FR-016 without needing another feature fully built: the
`GET /api/auth/session` contract alone proves the *scope* is correct; enforcement on other
features' routes is validated in their own quickstarts by calling `assertAccess()`
(`lib/auth/rbac.ts`) the same way this feature's routes do.

## Scenario 3 — Self-service password reset (User Story 3)

```bash
curl -X POST http://localhost:3000/api/auth/password-reset/request \
  -H 'Content-Type: application/json' -d '{"email":"someone@example.com"}'
# Expect: 200 with the same generic message whether or not that email exists (FR-010)
```

Retrieve the reset link from the mail-catcher, extract the token, then:

```bash
curl -X POST http://localhost:3000/api/auth/password-reset/confirm \
  -H 'Content-Type: application/json' \
  -d '{"token":"<token>","newPassword":"NewPass123!"}'
# Expect: 200, then the old password no longer works and the new one does
```

Wait 31 minutes (or use a shortened token TTL in a test environment) and repeat with the
same token — expect `400 invalid_or_expired_token` (US3, Acceptance Scenario 3).

## Scenario 4 — Live revocation, not cached at login (this spec's clarified FR-019)

1. Log in as a Service Manager; confirm `GET /api/auth/session` succeeds.
2. As Super Admin (separate session), `PATCH /api/auth/users/:id { "active": false }`.
3. **Without logging out**, immediately re-request `GET /api/auth/session` on the deactivated
   user's original session — expect `401`, not a still-valid response. This is the exact
   behavior FR-019/SC-006 require and is worth its own dedicated integration test
   (`tests/integration/live-revocation.test.ts` in `plan.md`'s structure), since it's easy
   to accidentally build a version that only checks state at login.

## Scenario 5 — Last Super Admin guard (FR-020)

With exactly one active `super_admin` row in the database:

```bash
curl -X PATCH http://localhost:3000/api/auth/users/<that-super-admin-id> \
  -b cookies.txt -H 'Content-Type: application/json' -d '{"active": false}'
# Expect: 409 { "error": { "code": "last_super_admin" } }
```

## Success criteria checklist (from spec.md)

- [ ] SC-001: a role/store violation is denied in every scenario above, zero exceptions
- [ ] SC-002: reset flow (Scenario 3) completes in well under 5 minutes end-to-end
- [ ] SC-003: lockout self-clears after the configured window, no admin action
- [ ] SC-004: deactivated user's historical actions still show their name (verify via
  `audit_log` rows created in earlier scenarios)
- [ ] SC-005: creating a store's staff (Scenario 2, step 1) required no code change
- [ ] SC-006: Scenario 4 passes — no stale-permission window
- [ ] SC-007: Scenario 5 passes — the last Super Admin can never be locked out of their own system
