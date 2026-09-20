---

description: "Task list for Authentication & Role-Based Access Control (002-auth-rbac)"
---

# Tasks: Authentication & Role-Based Access Control

**Input**: Design documents from `/specs/002-auth-rbac/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/auth-api.md, quickstart.md (all present)

**Tests**: Included and REQUIRED — constitution Principle I (Test-First) is NON-NEGOTIABLE;
`plan.md`'s Constitution Check commits every task to a failing test before its implementation.

**Organization**: Tasks are grouped by user story (spec.md priorities P1–P4) so each story is
independently implementable, testable, and deployable as an incremental slice.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unmet dependency)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Exact file paths are given in every task description

## Path Conventions

Single Next.js App Router project per `plan.md`'s Structure Decision — `app/`, `lib/`,
`tests/` at the repository root (no separate frontend/backend split).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization per `plan.md`'s Technical Context

- [X] T001 Create Next.js 14+ (App Router) + TypeScript 5.x project structure per `plan.md`'s Project Structure at the repository root
- [X] T002 [P] Configure ESLint + Prettier for the project
- [X] T003 [P] Set up Docker Compose (app service + PostgreSQL 15 service) per `plan.md`'s self-hosted deployment target, in `docker-compose.yml`
- [X] T004 [P] Configure Vitest for unit/contract/integration tests in `vitest.config.ts`
- [X] T005 [P] Configure Playwright for e2e tests in `playwright.config.ts`

**Checkpoint**: Project scaffolding exists; no feature code yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure every user story depends on

**⚠️ CRITICAL**: No user story task may begin until this phase is complete

- [X] T006 Define Drizzle schema for `users`, `user_stores`, `sessions` (extended with `last_active_at`), `password_reset_tokens`, and `audit_log` per `data-model.md` in `lib/db/schema.ts`
- [X] T007 Set up the Drizzle client and migration tooling in `lib/db/client.ts` (depends on T006)
- [X] T008 Generate and run the initial migration against the Docker Postgres instance (depends on T003, T007)
- [X] T009 **Implementation deviation from research.md §2**: Auth.js (NextAuth v5)'s Credentials provider does not support true database-session strategy (its built-in flow has no adapter step for credentials sign-in), and `pg` cannot run in the Next.js Edge middleware runtime `research.md` didn't anticipate needing. Implemented a small custom session module directly against Drizzle instead — opaque random tokens, HttpOnly+Secure cookies, live per-request DB lookup — which satisfies the same FR-019 requirement research.md's decision was made to satisfy, without fighting the library's actual constraints. See `lib/auth/session.ts`. `next-auth`/`@auth/drizzle-adapter` removed from `package.json`.
- [X] T010 [P] Define the environment variable schema (`DATABASE_URL`, `SMTP_*`, `SESSION_IDLE_TIMEOUT_HOURS`, `AUTH_SECRET`) in `.env.example` (depends on T001)
- [X] T011 Write a one-off seed script that creates the first Super Admin account, since no API endpoint creates the first one (per `contracts/auth-api.md`'s note on `POST /api/auth/users`), in `scripts/seed-super-admin.ts` (depends on T006)

**Checkpoint**: Database, ORM, and base auth session infrastructure exist — user story work can begin.

---

## Phase 3: User Story 1 - Secure Login & Session Management (Priority: P1) 🎯 MVP

**Goal**: Any staff member logs in with email/password; the session stays active while
working and expires after idle timeout; 5 consecutive failed logins locks the account for
15 minutes, auto-clearing afterward.

**Independent Test**: Log in with valid credentials, confirm a role-appropriate view is
reached, then verify idle-timeout expiry and lockout-after-5-failures per spec.md's
Acceptance Scenarios — all without any other user story existing yet.

### Tests for User Story 1 ⚠️ Write first; confirm they fail before implementing

- [X] T012 [P] [US1] Contract tests for `POST /api/auth/login`, `GET /api/auth/session`, `POST /api/auth/logout` (every documented status code in `contracts/auth-api.md`) in `tests/contract/auth-api.test.ts`
- [X] T013 [P] [US1] Integration test for idle-timeout expiry and 5-attempt lockout with auto-unlock after 15 minutes in `tests/integration/login-lockout.test.ts`
- [X] T014 [P] [US1] E2E test for login → role-appropriate landing view in `tests/e2e/login-to-dashboard.spec.ts`

### Implementation for User Story 1

- [X] T015 [US1] Implement bcrypt (cost 12) password hashing/verification in `lib/auth/auth.config.ts` (depends on T009, T012) — no Credentials provider; see T009's deviation note
- [X] T016 [US1] Implement login-attempt lockout tracking (5 fails → 15-min lock, self-clearing) in `lib/auth/lockout.ts` (depends on T015)
- [X] T017 [US1] Wire `POST /api/auth/login` (password verification + lockout check + response shape from `contracts/auth-api.md`) in `app/api/auth/login/route.ts` (path deviation from T009's note — discrete route files per contract path, not an Auth.js catch-all) (depends on T015, T016)
- [X] T018 [US1] Implement session validity shaping `{id, name, email, role, storeIds}` and the idle-timeout check against `last_active_at`, live per request, in `lib/auth/session.ts` (depends on T009)
- [X] T019 [US1] Wire `GET /api/auth/session` in `app/api/auth/session/route.ts` and `POST /api/auth/logout` in `app/api/auth/logout/route.ts` (depends on T018)
- [X] T020 [US1] Build an accessible (WCAG 2.1 AA) login page in `app/(auth)/login/page.tsx` (depends on T017)
- [X] T021 [US1] Confirm T012-T014 pass; run `quickstart.md` Scenario 1 (depends on T015-T020) — all 9 Vitest tests and both Playwright e2e tests pass

**Checkpoint**: User Story 1 fully functional and independently testable/deployable (MVP).

---

## Phase 4: User Story 2 - Role-Scoped Access Enforcement (Priority: P2)

**Goal**: A Store Service Manager sees only their store; an Admin sees only assigned
store(s) and is denied maintenance/user-management screens; a Super Admin sees everything.
Enforcement holds even against direct API calls, not just hidden UI.

**Independent Test**: Against a seeded multi-store dataset, log in as each role and confirm
each sees exactly what their role/assignment permits, including a denied direct-invocation
attempt outside their scope.

### Tests for User Story 2 ⚠️ Write first; confirm it fails before implementing

- [X] T022 [P] [US2] Integration test for cross-store denial, multi-store Admin visibility, direct-invocation bypass attempts, and `requireSuperAdmin` denial in `tests/integration/rbac-scope.test.ts`. Full end-to-end "denied from maintenance-console/user-management route" coverage lands with those routes themselves (007, and this spec's own US4) since they call this same `assertAccess()`/`requireSuperAdmin()` — there is only one scope-check implementation to test, not a parallel one per route.

### Implementation for User Story 2

- [X] T023 [US2] Implement `assertAccess(user, storeId)`, `getScopedStoreIds(user)`, and `requireSuperAdmin`/`requireAdminOrAbove` in `lib/auth/rbac.ts` (depends on T009)
- [X] T024 [US2] Compute and return `storeIds` in `GET /api/auth/session` from `getScopedStoreIds()`, empty for `super_admin`, in `app/api/auth/session/route.ts` (depends on T018, T023)
- [X] T025 [US2] Implementation deviation: `pg` cannot run in the Next.js Edge middleware runtime, so `middleware.ts` performs only an Edge-safe cookie-presence redirect for UX (unauthenticated requests bounce to `/login` immediately). The actual live, DB-backed authorization boundary FR-019 requires is `assertAccess()`/`getValidSession()` called inside every protected Route Handler and Server Component (Node.js runtime) — see `app/(dashboard)/dashboard/page.tsx` for the pattern already in place. Documented inline in `middleware.ts` so this isn't mistaken for the real enforcement layer later.
- [X] T026 [US2] Confirm T022 passes; run `quickstart.md` Scenario 2 (depends on T023-T025) — all 6 rbac-scope tests pass; full test suite (15 tests) green with no regressions

**Checkpoint**: User Stories 1 and 2 both independently functional.

---

## Phase 5: User Story 3 - Self-Service Password Reset (Priority: P3)

**Goal**: A staff member who forgot their password resets it via an emailed, single-use,
30-minute link, with no admin intervention needed.

**Independent Test**: Trigger a reset for a known account; confirm the link works within 30
minutes and is rejected after; confirm requesting a reset for an unregistered email returns
the identical response.

### Tests for User Story 3 ⚠️ Write first; confirm they fail before implementing

- [X] T027 [P] [US3] Contract tests for `POST /api/auth/password-reset/request` and `/confirm` in `tests/contract/auth-api.test.ts`
- [X] T028 [P] [US3] Integration test for the full reset flow, 30-minute expiry, single-use enforcement, and non-enumeration (identical response whether or not the email exists) in `tests/integration/password-reset.test.ts`

### Implementation for User Story 3

- [X] T029 [US3] Implement `password_reset_tokens` create/hash(SHA-256)/verify logic plus per-email rate limiting in `lib/auth/password-reset.ts` (depends on T006)
- [X] T030 [P] [US3] Implement Nodemailer/SMTP reset-link email sending in `lib/email/password-reset.ts` (depends on T010)
- [X] T031 [US3] Implement `POST /api/auth/password-reset/request` with the non-revealing response and per-email rate limiting (`research.md` §7) in `app/api/auth/password-reset/request/route.ts` (path deviation, consistent with T017's discrete-route-per-contract-path approach) (depends on T029, T030)
- [X] T032 [US3] Implement `POST /api/auth/password-reset/confirm` (verify token, update password, invalidate the user's existing sessions) in `app/api/auth/password-reset/confirm/route.ts` (same path deviation) (depends on T029)
- [X] T033 [US3] Build accessible forgot-password and reset-password pages in `app/(auth)/forgot-password/page.tsx` and `app/(auth)/reset-password/[token]/page.tsx` (depends on T031, T032)
- [X] T034 [US3] Confirm T027-T028 pass; run `quickstart.md` Scenario 3 (depends on T029-T033) — 12 new tests pass; full suite 21/21 passing

**Checkpoint**: User Stories 1-3 all independently functional.

---

## Phase 6: User Story 4 - Super Admin User Provisioning (Priority: P4)

**Goal**: The Super Admin creates/edits/deactivates staff accounts and manages store
assignments without developer involvement; the last active Super Admin can never be
deactivated; a deactivation or role/store change takes effect on the account's very next
request (FR-019), not after its session naturally expires.

**Independent Test**: As Super Admin, create a Store Service Manager, confirm scoped
access, deactivate them mid-session and confirm their very next request is denied, and
confirm the last remaining Super Admin cannot be deactivated.

### Tests for User Story 4 ⚠️ Write first; confirm they fail before implementing

- [X] T035 [P] [US4] Contract tests for the user CRUD endpoints in `tests/contract/auth-api.test.ts`
- [X] T036 [P] [US4] Integration test for provisioning, one-store-only enforcement for Store Service Managers, and the last-active-Super-Admin guard (FR-020) in `tests/integration/user-provisioning.test.ts`
- [X] T037 [P] [US4] Integration test proving a deactivated account is denied on its very next request, not after its session naturally expires (FR-019) in `tests/integration/live-revocation.test.ts`

### Implementation for User Story 4

- [X] T038 [US4] Implement `POST`/`GET /api/auth/users` (create + list, including store-required and one-store-only validation) in `app/api/auth/users/route.ts` (depends on T023)
- [X] T039 [US4] Implement `PATCH`/`DELETE /api/auth/users/:id` (edit, deactivate/reactivate, role change, delete-only-if-no-history) including the last-active-Super-Admin guard — extended beyond the literal FR-020 wording to also cover a role change away from `super_admin`, since `contracts/auth-api.md`'s own PATCH role enum (`admin | service_manager`) makes that a real path to the same invariant violation — in the same transaction as the update, in `app/api/auth/users/[id]/route.ts` (depends on T038)
- [X] T040 [US4] Scope clarification: `contracts/auth-api.md` never defines a separate assign/remove-store sub-route — store assignment is handled entirely through `PATCH /api/auth/users/:id`'s `storeIds` field (replace-the-set semantics), consistent with Principle III (no undocumented endpoints). No `app/api/auth/users/[id]/stores/route.ts` was created.
- [X] T041 [US4] Implement `audit_log` writes (actor, entity, before/after snapshot) for every mutation in T038-T039, in the same transaction as each mutation, in `lib/auth/audit.ts` (depends on T038, T039)
- [X] T042 [US4] Build the Super Admin user-management UI (list/create/deactivate/reactivate; store assignment via the create form's `storeIds` field) in `app/(dashboard)/admin/users/page.tsx`, gated by a server-side Super-Admin-only check in `app/(dashboard)/admin/layout.tsx` (depends on T038, T039)
- [X] T043 [US4] Confirm T035-T037 pass; run `quickstart.md` Scenarios 4-5 (depends on T038-T042) — full suite 34/34 passing, `next build` clean

**Checkpoint**: All four user stories independently functional — spec.md fully implemented.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validation and hardening spanning every user story

- [X] T044 [P] Ran the full `quickstart.md` validation end-to-end via the automated suite rather than manual curl: SC-001-SC-007 are each covered by a named test (Scenario 1 → `login-lockout.test.ts`+e2e; Scenario 2 → `rbac-scope.test.ts`; Scenario 3 → `password-reset.test.ts`; Scenario 4 → `live-revocation.test.ts`; Scenario 5 → `user-provisioning.test.ts`'s last-super-admin case). 37/37 tests passing.
- [X] T045 [P] Accessibility audit (WCAG 2.1 AA) of the login, password-reset, and user-management pages: every input has an associated `<label>`, errors are announced via `role="alert" aria-live="assertive"` (status messages via `role="status"`), forms are keyboard-operable with no custom widgets, and the user-management table uses proper `<th scope="col">` headers. **Gap, not yet closed**: no visual design/CSS exists yet for this feature, so color-contrast and focus-indicator criteria are untested against real styling (only default browser rendering) — a dedicated pass is needed once a design system lands, most likely alongside `006-dashboard-reporting`'s UI work.
- [X] T046 [P] Security review — **found and fixed a real gap**: CSRF protection was not explicit anywhere (`SameSite=Lax` cookies mitigate but don't satisfy the constitution's own requirement). Added `lib/auth/csrf.ts`'s Origin/Referer verification, applied to every state-changing route (login, logout, both password-reset endpoints, user create/edit), with 3 new tests (`tests/integration/csrf.test.ts`) proving cross-origin and header-absent requests are rejected while same-origin requests still work. Also found and fixed a **second real bug** while verifying this against a real browser: `middleware.ts` importing `SESSION_COOKIE_NAME` from `lib/auth/session.ts` pulled `crypto`/`pg` into the Edge middleware bundle, crashing every request in production (`next start`) despite `next build` succeeding and Vitest passing — fixed by extracting the constant into `lib/auth/session-constants.ts` with zero other imports; confirmed via a real `next build && next start` cycle plus Playwright against that live server. Remaining items confirmed by inspection: bcrypt cost 12 (`lib/auth/auth.config.ts`), HttpOnly+Secure(prod)+SameSite=Lax cookies, OTP/reset tokens hashed never plaintext, RBAC/audit-log on every mutating endpoint. TLS itself is Nginx/deployment-layer (constitution's own framing, PRD §10/§11), not application code — out of this feature's scope to configure here.
- [X] T047 Performance check (`scripts/bench-auth-routes.ts`, 50/100 iterations against real route handlers and a real Postgres connection): `POST /api/auth/login` p95 ≈ 239ms (dominated by bcrypt cost-12, an intentional, non-negotiable cost per the constitution — not overhead to optimize away), `GET /api/auth/session` p95 ≈ 3ms. Both comfortably under the constitution's 500ms p95 target.
- [X] T048 [P] Documented the first-Super-Admin seeding procedure, migration steps, and `.env` setup for new deployments in `docs/deployment-setup.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS every user story
- **User Stories (Phases 3-6)**: All depend on Foundational completion
  - US1 has no dependency on US2-US4
  - US2 depends on US1's session callback (T018) existing to extend it, but is otherwise independently testable
  - US3 depends only on Foundational (T006, T010) — can run in parallel with US2
  - US4 depends on US2's `assertAccess()` (T023) to guard its own routes, but its user-CRUD logic is otherwise independent
- **Polish (Phase 7)**: Depends on all four user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependencies on other stories — the MVP slice
- **User Story 2 (P2)**: Extends US1's session shape (T018); independently testable once done
- **User Story 3 (P3)**: No dependency on US2/US4 — can be built in parallel with either
- **User Story 4 (P4)**: Uses US2's `assertAccess()` to guard its own endpoints; independently testable via its own integration tests

### Within Each User Story

- Tests MUST be written and confirmed failing before implementation tasks begin (constitution Principle I)
- Auth/session config before routes; routes before UI pages
- Story's own "confirm tests pass + run quickstart scenario" task is last

### Parallel Opportunities

- T002-T005 (Setup) can all run in parallel
- T010 (Foundational) can run in parallel with T006-T009, T011
- T012-T014 (US1 tests) can run in parallel — different files
- Once Foundational is done, US1 and US3 can be staffed in parallel (US3 doesn't depend on US1/US2); US2 and US4 depend on pieces of US1/US2 respectively and should follow them
- T035-T037 (US4 tests) can run in parallel — different files
- T044-T046, T048 (Polish) can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all three US1 test-writing tasks together (different files):
Task: "Contract tests for login/session/logout in tests/contract/auth-api.test.ts"
Task: "Integration test for idle-timeout and lockout in tests/integration/login-lockout.test.ts"
Task: "E2E test for login-to-dashboard in tests/e2e/login-to-dashboard.spec.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (blocks everything)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: run `quickstart.md` Scenario 1 independently
5. Deploy/demo if ready — staff can already log in and sessions behave correctly

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. + User Story 1 → validate → deploy (MVP)
3. + User Story 2 → validate → deploy (RBAC now enforced)
4. + User Story 3 → validate → deploy (self-service reset live)
5. + User Story 4 → validate → deploy (full spec.md complete — Super Admin can onboard real stores)
6. Phase 7 Polish

### Parallel Team Strategy

Once Foundational is done: Developer A takes US1 → then US2 (extends US1's session
callback); Developer B takes US3 in parallel (no dependency on US1/US2); once US2 lands,
Developer A or C takes US4 (needs `assertAccess()` from US2).

---

## Notes

- [P] tasks touch different files with no unmet dependency
- [Story] labels trace every task back to its spec.md user story
- Every test task MUST be run and confirmed **failing** before its paired implementation task starts
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently before continuing
