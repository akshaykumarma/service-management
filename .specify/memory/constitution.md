<!--
Sync Impact Report
- Version change: 1.0.0 → 1.1.0
- Modified principles:
  - IV. Security & Observability by Default — expanded with concrete, testable security standards
    (TLS version, password hashing cost factor, cookie flags, CSRF protection, OWASP Top-10
    mitigation, audit/OTP log retention periods), sourced from the ratified product PRD
    (docs/PRD-v1.1-source.md §7). No principle was renamed or removed.
- Added sections:
  - Non-Functional Service Levels (sibling to Technology & Domain Constraints) — performance,
    scalability, availability, data retention, browser/accessibility support, language/i18n
    readiness, and notification latency standards, sourced from the same PRD §7.
- Removed sections: N/A
- Templates requiring updates:
  - .specify/templates/plan-template.md ⚠ pending manual review — its Constitution Check gates
    should also verify against the new Non-Functional Service Levels section, not only the four
    principles.
  - .specify/templates/spec-template.md ✅ no changes needed
  - .specify/templates/tasks-template.md ✅ no changes needed
  - .specify/templates/checklist-template.md ✅ no changes needed
- Follow-up TODOs:
  - TODO(TECH_STACK): still open, unchanged by this amendment — concrete technology stack remains
    a `/speckit-plan` decision. (The source PRD names PostgreSQL and self-hosted deployment as
    confirmed choices and a Next.js-based stack as a recommended-but-substitutable default; this
    amendment does not bind that choice here, since it is an implementation decision outside this
    command's scope.)
-->

# Service Management Constitution

## Core Principles

### I. Test-First (NON-NEGOTIABLE)
Every change to ticket lifecycle behavior (creation, state transitions, assignment, SLA timers,
closure) MUST have automated tests written and reviewed before implementation begins. Tests MUST
fail first (red), then implementation MUST make them pass (green), followed by refactoring with
tests kept green throughout. No pull request that implements or changes lifecycle behavior may
merge without accompanying tests demonstrating the change.

Rationale: A ticket/service-lifecycle system is a system of record — silent regressions in state
transitions or SLA calculations corrupt data that downstream teams and customers rely on. Writing
tests first forces the expected behavior to be specified unambiguously before code exists.

### II. Simplicity & YAGNI
Start with the simplest design that satisfies the current specification. Do not introduce
abstractions (plugin systems, generic workflow engines, configurable state machines) until at
least two concrete features require the same variability. Every added layer of indirection MUST
be justified in the plan's Complexity Tracking section against a specific, current requirement —
not a hypothetical future one.

Rationale: Ticket/workflow systems are natural magnets for premature "make everything
configurable" design. Unjustified flexibility slows delivery and multiplies the surface area that
tests and security review must cover.

### III. API/Contract-First Design
Every capability exposed across a boundary (service-to-service, backend-to-frontend, or public
API) MUST have its contract (request/response shape, status codes, error format) defined and
reviewed before implementation. Contract changes MUST be accompanied by contract tests that fail
against the old contract and pass against the new one. Breaking a published contract without a
version bump is prohibited.

Rationale: Service-management workflows (tickets, assignments, SLA events) are consumed by
multiple surfaces — UI, integrations, automation rules. Defining the contract first catches
mismatches before they become runtime failures for a downstream consumer.

### IV. Security & Observability by Default
All input crossing a trust boundary (API requests, webhook payloads, imported tickets) MUST be
validated and authorized before processing; authentication and authorization are never optional
for lifecycle-mutating operations. Every service MUST emit structured logs and metrics for ticket
state transitions and SLA breaches sufficient to reconstruct "who changed what, when, and why"
without attaching a debugger. Secrets MUST NOT be committed to the repository (see `.gitignore`
for locally-scoped agent/credential files).

The following concrete standards are NON-NEGOTIABLE minimums, not aspirational targets:

- All data in transit MUST be encrypted with TLS 1.2 or higher.
- Passwords MUST be hashed with bcrypt at a cost factor of 12 or higher; plaintext or
  reversibly-encrypted password storage is prohibited.
- Session cookies MUST be marked HttpOnly and Secure.
- Every state-changing endpoint MUST be protected against CSRF.
- Implementations MUST address the OWASP Top-10 risk categories as a baseline; a new endpoint
  that has not been reviewed against them MUST NOT ship.
- Audit log entries (actor, timestamp, before/after state) MUST be retained for at least 2 years.
- OTP verification logs MUST be retained for at least 90 days.

Rationale: A service-management system is a compliance-sensitive audit trail as much as it is a
workflow tool; security gaps and blind spots in observability both directly undermine that trust
function. These specific thresholds come from the ratified product requirements
(docs/PRD-v1.1-source.md §7) and are treated as constitutional minimums because weakening any of
them (a shorter retention window, a lower bcrypt cost, skipping CSRF on "just one" endpoint)
reintroduces exactly the compliance and trust gaps this principle exists to close.

## Technology & Domain Constraints

The concrete technology stack (language, framework, datastore) is not yet chosen; it MUST be
selected and recorded during `/speckit-plan` for the first feature and treated as binding
thereafter unless amended here. Regardless of stack, the following domain constraints apply:

- Ticket state transitions MUST be modeled as an explicit, enumerable state machine — no
  free-form status strings.
- Every mutation to a ticket MUST be attributable to an actor (user, system, or integration) and
  timestamped; the history MUST be append-only (no destructive edits to past state).
- SLA and timer calculations MUST be covered by tests for boundary conditions (paused/resumed
  timers, timezone handling, business-hours calendars) given their direct compliance impact.

## Non-Functional Service Levels

These service levels are binding, non-negotiable minimums for v1, sourced from the ratified
product requirements (docs/PRD-v1.1-source.md §7). A design that cannot meet one of them MUST
either be revised or have the shortfall explicitly justified in the plan's Complexity Tracking
section before implementation proceeds.

- **Performance**: Page loads MUST complete in under 2 seconds on a broadband connection; API
  responses for ticket CRUD operations MUST complete in under 500ms at the 95th percentile.
- **Scalability**: The system MUST comfortably support at least 10 stores operating concurrently,
  at approximately 1,000 tickets per store per month (~10,000/month, ~120,000/year
  platform-wide), and at least 50 concurrent users, without degrading response times.
- **Availability**: The system MUST target 99.5% uptime; any scheduled maintenance MUST be
  communicated at least 24 hours in advance via an in-app banner.
- **Data Retention**: Ticket data MUST be retained indefinitely. A store that is deactivated or
  removed MUST be soft-deleted and archived, never hard-deleted.
- **Browser & Device Support**: The system MUST support the latest two versions of Chrome,
  Firefox, Safari, and Edge, with a responsive layout functional down to 768px width. A native
  mobile app is out of scope for v1.
- **Accessibility**: All interactive elements MUST meet WCAG 2.1 Level AA.
- **Language & Localization**: The v1 interface MUST be English-only, but UI strings MUST be
  externalized to an i18n-ready structure so future localization does not require rewriting
  application code.
- **Notification Latency**: Customer WhatsApp notifications MUST be delivered within 2 minutes
  of the triggering event; a failed delivery MUST surface an in-app alert within 30 seconds (see
  also `specs/005-customer-notifications`, which specifies the feature-level behavior this level
  applies to).

## Development Workflow & Quality Gates

- Every feature proceeds through the Spec Kit flow: `/speckit-specify` → (optional
  `/speckit-clarify`) → `/speckit-plan` → `/speckit-tasks` → (optional `/speckit-analyze`,
  `/speckit-checklist`) → `/speckit-implement`.
- Every plan produced by `/speckit-plan` MUST include a Constitution Check section that verifies
  the design against the four Core Principles and the Non-Functional Service Levels above before
  implementation starts; unresolved violations MUST be justified in Complexity Tracking or the
  plan MUST be revised.
- Pull requests MUST NOT merge with failing tests, unresolved contract-test mismatches, or
  unaddressed security findings.
- Code review MUST verify: tests exist and were written before the implementation they cover,
  no unjustified new abstractions, contracts are documented for any new/changed boundary, and
  authz/logging are present on lifecycle-mutating endpoints.

## Governance

This constitution supersedes any conflicting team convention or informal practice. Amendments are
made by editing this file via `/speckit-constitution`, and MUST include an updated Sync Impact
Report describing what changed and why.

Versioning policy (semantic versioning applied to governance):
- MAJOR: Backward-incompatible principle removal or redefinition (e.g., dropping Test-First).
- MINOR: A new principle or materially expanded section is added.
- PATCH: Wording clarifications, typo fixes, or non-semantic refinements.

Compliance review: every `/speckit-plan` Constitution Check and every pull request review MUST
verify compliance with the principles and service levels above. Any exception MUST be documented
with a concrete justification at the point of use (plan's Complexity Tracking section or the PR
description) — "it's simpler this way" without a specific reason is not sufficient.

**Version**: 1.1.0 | **Ratified**: 2026-08-31 | **Last Amended**: 2026-09-20
