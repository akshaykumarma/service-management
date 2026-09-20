# Phase 0 Research: Authentication & Role-Based Access Control

All items below were resolved during planning; none remain as `NEEDS CLARIFICATION`. This is
the first feature planned for the project, so several project-wide technology decisions are
made here and are binding for subsequent specs unless the constitution is amended.

## 1. Session strategy: database-backed vs. JWT

**Decision**: Auth.js (NextAuth v5) configured with the **database session strategy** — a
session token is an opaque reference; the server looks up the session row (and joins to the
current `users` row) on every request.

**Rationale**: spec.md FR-019 requires that a deactivation or role/store change take effect
on the account's *very next request*, with no session-termination step. A JWT strategy
bakes role/store claims into a signed token that isn't re-checked against the database until
it expires or is refreshed — exactly the stale-permission window FR-019 was written to close
(see `002-auth-rbac`'s clarify session, 2026-09-20). Database sessions make "current state"
and "authorized state" the same query, by construction.

**Alternatives considered**:
- **JWT strategy** — rejected: would require a separate token-revocation/deny-list
  mechanism to satisfy FR-019, adding complexity the database strategy gets for free
  (violates Simplicity & YAGNI otherwise).
- **JWT with a short (e.g., 60s) TTL and silent refresh** — rejected: still leaves a
  window (however small) where a deactivated account's requests succeed; FR-019 says
  "very next request," not "within N seconds."

## 2. Auth library: Auth.js vs. custom JWT vs. other

**Decision**: Auth.js (NextAuth v5) with the Credentials provider (email/password) and the
Drizzle adapter for database sessions.

**Rationale**: PRD §10 names both "NextAuth.js (Auth.js) or custom JWT" as acceptable;
constitution Principle II (Simplicity & YAGNI) favors not hand-rolling session cookie
handling, CSRF token wiring, and credential storage when a maintained library already does
it correctly and integrates natively with the chosen framework (Next.js).

**Alternatives considered**:
- **Custom JWT implementation** — rejected per Simplicity & YAGNI: would require building
  and security-reviewing session/cookie/CSRF handling from scratch for no functional gain.
- **Lucia** — considered (lightweight, framework-agnostic); rejected in favor of Auth.js's
  more mature Next.js App Router integration and larger community track record for the
  database-session pattern this spec requires.

## 3. ORM: Drizzle vs. Prisma

**Decision**: Drizzle ORM with the `pg` (node-postgres) driver.

**Rationale**: PRD §10 names both as acceptable ("Drizzle ORM or Prisma"). Drizzle's
SQL-like query builder keeps generated queries transparent and reviewable — relevant to
Principle IV's audit/observability expectations — and its migration files are plain SQL,
easing the constitution's "PostgreSQL with appropriate indexing" scalability note.

**Alternatives considered**:
- **Prisma** — rejected as the default (not disqualified): heavier code-generation step,
  less transparent generated SQL; either would have satisfied the spec, so this is a
  preference, not a hard constraint. A future feature is not blocked from revisiting this
  if a concrete need arises (constitution Simplicity & YAGNI: don't relitigate without one).

## 4. Password hashing

**Decision**: `bcrypt`, cost factor 12 (Node.js `bcrypt` package).

**Rationale**: Constitution Principle IV states this as a non-negotiable minimum. No
alternative considered — this is a fixed constraint, not an open decision.

## 5. Password-reset email delivery

**Decision**: Nodemailer with a generic SMTP transport, provider selected via environment
configuration (compatible with SendGrid, self-hosted Postfix, or any SMTP provider per PRD
§11's "any SMTP provider" framing).

**Rationale**: spec.md's Assumptions explicitly defer "the specific email-sending
mechanism" to `/speckit-plan`. A generic SMTP transport avoids locking the project into one
vendor and matches the PRD's own "minimal use; single transactional template" framing —
this feature sends exactly one email type (the reset link).

**Alternatives considered**:
- **Provider-specific SDK (e.g., SendGrid SDK)** — rejected for this feature: adds a
  vendor dependency for a single email template where generic SMTP suffices; can be
  swapped in later without changing this spec's contract if volume/deliverability demands it.

## 6. Testing stack

**Decision**: Vitest for unit/contract/integration tests; Playwright for the end-to-end
acceptance scenarios in spec.md (login, lockout, reset, RBAC boundaries, live revocation).

**Rationale**: Both are the current de facto standard for Next.js/TypeScript projects, with
first-class TypeScript support and fast iteration — directly serving constitution Principle
I (Test-First): tests need to be fast enough to run before every implementation step without
friction, or the practice erodes.

**Alternatives considered**:
- **Jest** — rejected as the default: Vitest is faster and shares Vite's config/tooling
  ecosystem more naturally with a modern Next.js setup; either would technically satisfy
  the constitution's testing requirement.

## 7. Password-reset request rate limiting (hardening beyond spec.md)

**Decision**: Rate-limit password-reset *requests* to a small number per email address per
hour (e.g., 3/hour), returning the same non-revealing response either way (per spec FR-010)
whether the limit is hit or the account doesn't exist.

**Rationale**: spec.md specifies login-attempt rate limiting (FR-007) but is silent on the
reset-request endpoint itself. Constitution Principle IV requires an OWASP Top-10 baseline;
an unthrottled reset-request endpoint is a known abuse vector (mail-bombing a real user, or
timing-based account enumeration). This is a plan-level hardening decision, not a spec
change — it doesn't alter any user-visible behavior spec.md describes.

**Alternatives considered**:
- **No rate limiting** — rejected: fails the OWASP Top-10 baseline constitution requires.
