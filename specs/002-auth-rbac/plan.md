# Implementation Plan: Authentication & Role-Based Access Control

**Branch**: `002-auth-rbac` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-auth-rbac/spec.md`

## Summary

Build email/password authentication with server-managed, database-backed sessions and
three-role authorization (Super Admin, Admin, Store Service Manager) for the Service
Management platform. Every request re-evaluates the caller's active/deactivated state,
role, and store assignment(s) live against the database (spec FR-019) — authorization is
never cached in a token. Session/lockout/reset-token policy values, RBAC scoping rules, and
the "last active Super Admin can't be deactivated" guard come directly from spec.md.

This is the **first** feature planned for this project, so this plan also makes the
project-wide technology stack decision the constitution's `TODO(TECH_STACK)` deferred to
this point (per the user's explicit confirmation): the PRD's recommended baseline
(`docs/PRD-v1.1-source.md` §10), adopted as-is and binding for all subsequent specs unless
amended in the constitution.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS

**Primary Dependencies**: Next.js 14+ (App Router) · Auth.js (NextAuth.js v5) with the
**database session strategy** (not JWT — see Rationale below) · Drizzle ORM · `pg`
(node-postgres) driver · `bcrypt` for password hashing · `resend`-compatible SMTP client
(or equivalent) for password-reset email, provider left to `research.md`

**Storage**: PostgreSQL 15+ (self-hosted via Docker Compose, per PRD §10/§11 — confirmed
decisions OQ-09/OQ-10)

**Testing**: Vitest for unit/integration tests (route handlers, RBAC middleware, session
logic) · Playwright for the end-to-end login/lockout/reset/RBAC-boundary flows described in
spec.md's acceptance scenarios

**Target Platform**: Linux server (Docker container behind Nginx, TLS via
Certbot/Let's Encrypt), accessed from the latest two versions of Chrome/Firefox/Safari/Edge
(constitution Non-Functional Service Levels)

**Project Type**: Single full-stack web application (Next.js App Router serves both UI and
API routes in one deployable — per PRD §10, not a separate frontend/backend split)

**Performance Goals**: Auth/session-check middleware must not be the bottleneck behind the
constitution's <500ms p95 API target; a role/store-scope check is a single indexed lookup
per request (see data-model.md), not a chain of queries

**Constraints**: TLS 1.2+; bcrypt cost ≥ 12; HttpOnly + Secure session cookies; CSRF
protection on all state-changing endpoints; OWASP Top-10 baseline; 8-hour default idle
timeout (configurable); lockout 15 min after 5 consecutive failed logins; password-reset
token valid 30 min, single-use; every access-controlled action re-evaluated live per
request (spec FR-019), never cached at login

**Scale/Scope**: ≥10 stores, ~10,000 tickets/month platform-wide, ≥50 concurrent users
without degradation (constitution Non-Functional Service Levels) — for this spec
specifically: a handful of Staff Accounts per store (not itself a high-volume entity)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Test-First (NON-NEGOTIABLE) | `/speckit-tasks` must sequence a failing test (Vitest for each RBAC/session rule, Playwright for each acceptance scenario) before its implementation task. No task in this plan authorizes writing implementation ahead of its test. | PASS (enforced at task-generation time, not violated by this plan) |
| II. Simplicity & YAGNI | Using Auth.js instead of hand-rolled session/JWT machinery avoids building undifferentiated auth code. No generic "permission framework" — 3 fixed roles with a single scope-check function (`assertAccess(user, store)`), matching spec FR-001's "exactly three roles," not an extensible role system nobody asked for. | PASS |
| III. API/Contract-First Design | All auth/user-management endpoints defined in `contracts/auth-api.md` before implementation; contract tests (Vitest, one per endpoint) fail against no implementation and must pass before the route is considered done. | PASS |
| IV. Security & Observability by Default | bcrypt cost 12, TLS 1.2+, HttpOnly+Secure cookies, CSRF, OWASP Top-10 baseline, audit-log entries (2yr retention) for every access-controlled action (FR-018) — all captured in data-model.md and contracts. Database session strategy (not JWT) is required specifically to satisfy FR-019's live per-request re-evaluation; a JWT strategy would let a deactivated user's stale claims keep working until token expiry, which is exactly the gap FR-019 closed. | PASS |
| Non-Functional Service Levels | Performance (<500ms p95), availability, browser support, WCAG 2.1 AA (login/user-mgmt forms), i18n-ready string externalization — all in scope for `/speckit-tasks`; none contradicted by this design. | PASS |

No violations — Complexity Tracking is empty.

**Post-Design Re-Check** (after Phase 1 `data-model.md`/`contracts/`/`quickstart.md`): all
five rows above still PASS. The database-session design materialized exactly as planned
(no JWT crept back in), the contract file was written before any implementation, and
`audit_log` append-only/2-year-retention and bcrypt-12/TLS/CSRF constraints are reflected in
`data-model.md` and `contracts/auth-api.md`. No new violations introduced by the detailed
design; Complexity Tracking remains empty.

## Project Structure

### Documentation (this feature)

```text
specs/002-auth-rbac/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── auth-api.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
# Single Next.js project (App Router) — chosen because the PRD specifies a full-stack
# app in one repo, not a separate frontend/backend split.
app/
├── (auth)/
│   ├── login/page.tsx
│   ├── forgot-password/page.tsx
│   └── reset-password/[token]/page.tsx
├── api/
│   └── auth/
│       ├── [...nextauth]/route.ts      # Auth.js handler (database session strategy)
│       ├── password-reset/route.ts     # request + confirm reset
│       └── users/route.ts              # Super Admin user CRUD (this feature's scope)
└── (dashboard)/
    └── admin/
        └── users/page.tsx              # Super Admin user/store-assignment management UI

lib/
├── db/
│   ├── schema.ts                        # Drizzle schema: users, sessions, password_reset_tokens
│   └── client.ts
├── auth/
│   ├── auth.config.ts                   # Auth.js config (providers, session strategy, callbacks)
│   ├── rbac.ts                          # assertAccess(user, store) — the one scope-check function
│   └── lockout.ts                       # failed-attempt counting + 15-min lockout
└── email/
    └── password-reset.ts                # reset-link email sending

tests/
├── contract/
│   └── auth-api.test.ts                 # one test per contracts/auth-api.md endpoint
├── integration/
│   ├── login-lockout.test.ts
│   ├── password-reset.test.ts
│   ├── rbac-scope.test.ts               # US2 acceptance scenarios (cross-store denial, etc.)
│   └── live-revocation.test.ts          # FR-019: deactivation takes effect next request
└── e2e/
    └── login-to-dashboard.spec.ts       # Playwright, US1 acceptance scenarios
```

**Structure Decision**: Single Next.js App Router project (not a split frontend/backend),
per PRD §10's "full-stack in one repo" guidance. This feature owns `lib/auth/`,
`lib/db/schema.ts`'s `users`/`sessions`/`password_reset_tokens` tables, and the
`app/api/auth/*` routes; later features add their own `lib/<domain>/` and route segments
without touching this feature's auth core beyond calling `assertAccess()`.

## Complexity Tracking

*No entries — no Constitution Check violations to justify.*
