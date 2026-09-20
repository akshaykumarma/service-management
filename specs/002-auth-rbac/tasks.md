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

- [ ] T001 Create Next.js 14+ (App Router) + TypeScript 5.x project structure per `plan.md`'s Project Structure at the repository root
- [ ] T002 [P] Configure ESLint + Prettier for the project
- [ ] T003 [P] Set up Docker Compose (app service + PostgreSQL 15 service) per `plan.md`'s self-hosted deployment target, in `docker-compose.yml`
- [ ] T004 [P] Configure Vitest for unit/contract/integration tests in `vitest.config.ts`
- [ ] T005 [P] Configure Playwright for e2e tests in `playwright.config.ts`

**Checkpoint**: Project scaffolding exists; no feature code yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure every user story depends on

**⚠️ CRITICAL**: No user story task may begin until this phase is complete

- [ ] T006 Define Drizzle schema for `users`, `user_stores`, `sessions` (extended with `last_active_at`), `password_reset_tokens`, and `audit_log` per `data-model.md` in `lib/db/schema.ts`
- [ ] T007 Set up the Drizzle client and migration tooling in `lib/db/client.ts` (depends on T006)
- [ ] T008 Generate and run the initial migration against the Docker Postgres instance (depends on T003, T007)
- [ ] T009 Configure Auth.js (NextAuth v5) with the Drizzle adapter and **database session strategy** (per `research.md` §1) in `lib/auth/auth.config.ts` (depends on T006)
- [ ] T010 [P] Define the environment variable schema (`DATABASE_URL`, `SMTP_*`, `SESSION_IDLE_TIMEOUT_HOURS`, `AUTH_SECRET`) in `.env.example` (depends on T001)
- [ ] T011 Write a one-off seed script that creates the first Super Admin account, since no API endpoint creates the first one (per `contracts/auth-api.md`'s note on `POST /api/auth/users`), in `scripts/seed-super-admin.ts` (depends on T006)

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

- [ ] T012 [P] [US1] Contract tests for `POST /api/auth/login`, `GET /api/auth/session`, `POST /api/auth/logout` (every documented status code in `contracts/auth-api.md`) in `tests/contract/auth-api.test.ts`
- [ ] T013 [P] [US1] Integration test for idle-timeout expiry and 5-attempt lockout with auto-unlock after 15 minutes in `tests/integration/login-lockout.test.ts`
- [ ] T014 [P] [US1] E2E test for login → role-appropriate landing view in `tests/e2e/login-to-dashboard.spec.ts`

### Implementation for User Story 1

- [ ] T015 [US1] Implement the Credentials provider with bcrypt (cost 12) password verification in `lib/auth/auth.config.ts` (depends on T009, T012)
- [ ] T016 [US1] Implement login-attempt lockout tracking (5 fails → 15-min lock, self-clearing) in `lib/auth/lockout.ts` (depends on T015)
- [ ] T017 [US1] Wire `POST /api/auth/login` (Credentials sign-in + lockout check + response shape from `contracts/auth-api.md`) in `app/api/auth/[...nextauth]/route.ts` (depends on T015, T016)
- [ ] T018 [US1] Implement the session callback shaping `{id, name, email, role, storeIds}` and enforcing the idle-timeout check against `last_active_at` in `lib/auth/auth.config.ts` (depends on T009)
- [ ] T019 [US1] Wire `GET /api/auth/session` and `POST /api/auth/logout` via the Auth.js catch-all route in `app/api/auth/[...nextauth]/route.ts` (depends on T018)
- [ ] T020 [US1] Build an accessible (WCAG 2.1 AA) login page in `app/(auth)/login/page.tsx` (depends on T017)
- [ ] T021 [US1] Confirm T012-T014 pass; run `quickstart.md` Scenario 1 (depends on T015-T020)

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

- [ ] T022 [P] [US2] Integration test for cross-store denial, multi-store Admin visibility, maintenance-console denial for Admin, and direct-invocation bypass attempts in `tests/integration/rbac-scope.test.ts`

### Implementation for User Story 2

- [ ] T023 [US2] Implement the `assertAccess(user, store)` scope-check function in `lib/auth/rbac.ts` (depends on T009)
- [ ] T024 [US2] Compute and return `storeIds` in the session callback from the `user_stores` join, empty for `super_admin`, in `lib/auth/auth.config.ts` (depends on T018, T023)
- [ ] T025 [US2] Apply `assertAccess()` as Next.js middleware guarding every authenticated route, including denying Admin from maintenance-console/user-management routes, in `middleware.ts` (depends on T023)
- [ ] T026 [US2] Confirm T022 passes; run `quickstart.md` Scenario 2 (depends on T023-T025)

**Checkpoint**: User Stories 1 and 2 both independently functional.

---

## Phase 5: User Story 3 - Self-Service Password Reset (Priority: P3)

**Goal**: A staff member who forgot their password resets it via an emailed, single-use,
30-minute link, with no admin intervention needed.

**Independent Test**: Trigger a reset for a known account; confirm the link works within 30
minutes and is rejected after; confirm requesting a reset for an unregistered email returns
the identical response.

### Tests for User Story 3 ⚠️ Write first; confirm they fail before implementing

- [ ] T027 [P] [US3] Contract tests for `POST /api/auth/password-reset/request` and `/confirm` in `tests/contract/auth-api.test.ts`
- [ ] T028 [P] [US3] Integration test for the full reset flow, 30-minute expiry, single-use enforcement, and non-enumeration (identical response whether or not the email exists) in `tests/integration/password-reset.test.ts`

### Implementation for User Story 3

- [ ] T029 [US3] Implement `password_reset_tokens` create/hash/verify logic in `lib/auth/password-reset.ts` (depends on T006)
- [ ] T030 [P] [US3] Implement Nodemailer/SMTP reset-link email sending in `lib/email/password-reset.ts` (depends on T010)
- [ ] T031 [US3] Implement `POST /api/auth/password-reset/request` with the non-revealing response and per-email rate limiting (`research.md` §7) in `app/api/auth/password-reset/route.ts` (depends on T029, T030)
- [ ] T032 [US3] Implement `POST /api/auth/password-reset/confirm` (verify token, update password, invalidate the user's existing sessions) in `app/api/auth/password-reset/route.ts` (depends on T029)
- [ ] T033 [US3] Build accessible forgot-password and reset-password pages in `app/(auth)/forgot-password/page.tsx` and `app/(auth)/reset-password/[token]/page.tsx` (depends on T031, T032)
- [ ] T034 [US3] Confirm T027-T028 pass; run `quickstart.md` Scenario 3 (depends on T029-T033)

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

- [ ] T035 [P] [US4] Contract tests for the user CRUD and store-assignment endpoints in `tests/contract/auth-api.test.ts`
- [ ] T036 [P] [US4] Integration test for provisioning, one-store-only enforcement for Store Service Managers, and the last-active-Super-Admin guard (FR-020) in `tests/integration/user-provisioning.test.ts`
- [ ] T037 [P] [US4] Integration test proving a deactivated or role/store-changed account is denied on its very next request, not after its session naturally expires (FR-019) in `tests/integration/live-revocation.test.ts`

### Implementation for User Story 4

- [ ] T038 [US4] Implement `POST`/`GET /api/auth/users` (create + list, including store-required and one-store-only validation) in `app/api/auth/users/route.ts` (depends on T023)
- [ ] T039 [US4] Implement `PATCH`/`DELETE /api/auth/users/:id` (edit, deactivate/reactivate, role change, delete-only-if-no-history) including the last-active-Super-Admin guard in the same transaction as the update, in `app/api/auth/users/[id]/route.ts` (depends on T038)
- [ ] T040 [US4] Implement store-assignment sub-routes (assign/remove an Admin's store) in `app/api/auth/users/[id]/stores/route.ts` (depends on T038)
- [ ] T041 [US4] Implement `audit_log` writes (actor, entity, before/after snapshot) for every mutation in T038-T040, in the same transaction as each mutation, in `lib/auth/audit.ts` (depends on T038, T039, T040)
- [ ] T042 [US4] Build the Super Admin user-management UI (list/create/edit/deactivate/assign stores) in `app/(dashboard)/admin/users/page.tsx` (depends on T038, T039, T040)
- [ ] T043 [US4] Confirm T035-T037 pass; run `quickstart.md` Scenarios 4-5 (depends on T038-T042)

**Checkpoint**: All four user stories independently functional — spec.md fully implemented.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Validation and hardening spanning every user story

- [ ] T044 [P] Run the full `quickstart.md` validation (all 5 scenarios, all 7 success-criteria checklist items) end-to-end
- [ ] T045 [P] Accessibility audit (WCAG 2.1 AA) of the login, password-reset, and user-management pages
- [ ] T046 [P] Security review: TLS config, CSRF protection on every state-changing route, bcrypt cost-12 verification, OWASP Top-10 checklist
- [ ] T047 Performance check: confirm auth/session-check routes meet the constitution's <500ms p95 target under a light load test
- [ ] T048 [P] Document the first-Super-Admin seeding procedure and `.env` setup for new deployments

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
