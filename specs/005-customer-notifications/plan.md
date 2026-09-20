# Implementation Plan: Customer WhatsApp Notifications & OTP Delivery Verification

**Branch**: `005-customer-notifications` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-customer-notifications/spec.md`

## Summary

Build automatic WhatsApp completion notifications (with in-app failure alerting) and
mandatory OTP-verified delivery, including this spec's own two-layer Admin/Super-Admin
escalation for OTP send failure and timeout-exhaustion. Fourth feature planned; continues
the established stack and, per the PRD's own confirmed decision (OQ-01), integrates with
**Meta's WhatsApp Business Cloud API** specifically — not a generic "a WhatsApp provider."

One real-world integration constraint surfaces during this plan that materially affects
User Story 6 (Message Template Management) and is called out prominently below: **Meta's
Cloud API requires business-initiated messages to use pre-approved message templates**, so
"editing template wording" (FR-016) is not simply live-editing free text — see Technical
Context and `research.md` §5.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js 20 LTS (unchanged)

**Primary Dependencies**: Next.js 14+ (App Router) · Drizzle ORM · `pg` driver · Meta
WhatsApp Business Cloud API (direct HTTPS calls, no third-party WhatsApp SDK needed — the
Cloud API is a plain REST API) · **`pg-boss`** (Postgres-backed job queue) for async
message sending and OTP-expiry sweeping, per PRD §10's own recommendation ("avoids an
extra Redis dependency") · `crypto` (Node built-in) for OTP hashing (HMAC-SHA256, not
bcrypt — see `research.md` §2)

**Storage**: PostgreSQL 15+ — new tables `notifications`, `otp_verifications`,
`delivery_overrides`, `message_templates`, `manual_notification_confirmations`; `pg-boss`
adds its own job-queue tables to the same database (no separate infrastructure)

**Testing**: Vitest + Playwright, consistent with prior features; WhatsApp API calls are
mocked in tests (a fake Cloud API HTTP server), never hitting the real Meta endpoint

**Target Platform**: Same Docker Compose deployment; adds a `pg-boss` worker process (or
in-process worker, per `research.md` §1) alongside the existing app container; adds a
webhook endpoint for Meta's delivery-receipt callbacks

**Project Type**: Same single Next.js project; adds `lib/notifications/`, `lib/whatsapp/`,
and `app/api/webhooks/whatsapp/route.ts`

**Performance Goals**: SC-001's "within 2 minutes" is generous relative to a typical
WhatsApp API call (seconds); the job queue exists for reliability/retry, not because the
call itself is slow — see `research.md` §1

**Constraints**: OTP codes stored as HMAC-SHA256 hashes, never plaintext, never logged; the
completion notification fires only on a ticket's **first** transition into "Completed" (a
plan-level interpretation — see `research.md` §4, flagged for visibility since it isn't
explicit in spec.md's FR-001); a phone-number correction during OTP failure escalation
(FR-020) updates only that ticket's own phone field, never the shared `customers` table's
canonical phone (`research.md` §3)

**Scale/Scope**: ~1,000 tickets/store/month × ≥10 stores → a comparable volume of
completion notifications and OTP sends; well within a single Postgres-backed job queue's
capacity at this scale

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Test-First (NON-NEGOTIABLE) | Same TDD discipline; WhatsApp API mocked so tests never depend on external network. | PASS |
| II. Simplicity & YAGNI | `pg-boss` (already the PRD's own recommendation) avoids introducing Redis for a job queue this scale doesn't need. Failed-notification alerts are a derived query (`notifications WHERE status='failed' AND no confirmation yet`), not a new real-time push/websocket subsystem — the existing 30-second dashboard poll (`006-dashboard-reporting`) is sufficient for SC-002's 30-second surfacing target. | PASS |
| III. API/Contract-First Design | `contracts/notifications-api.md` defines every endpoint (including the Meta webhook's expected payload shape) before implementation. | PASS |
| IV. Security & Observability by Default | OTP codes hashed (never stored/logged in plaintext); every override/escalation action (FR-020, FR-021) is Admin/Super-Admin-gated via the existing `assertAccess()` and immutably recorded, distinct from normal OTP-verified deliveries (FR-021, SC-004). | PASS |
| Non-Functional Service Levels | SC-001's 2-minute notification latency and the constitution's "delivered within 2 minutes / failure alert within 30 seconds" NFR are the same requirement restated — both satisfied by the async job queue plus the existing dashboard poll cycle. | PASS |

No violations — Complexity Tracking is empty.

**Post-Design Re-Check** (after Phase 1): all five rows still PASS. `data-model.md`
confirms `otp_verifications.code_hash` (never plaintext), `delivery_overrides` as a
distinct table from normal OTP verification (satisfying FR-021's distinguishability
requirement structurally, not just via a flag that could be overlooked), and
`contracts/notifications-api.md` predates any implementation task.

## Project Structure

### Documentation (this feature)

```text
specs/005-customer-notifications/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── notifications-api.md
└── tasks.md             # /speckit-tasks output — not created by this command
```

### Source Code (repository root)

```text
app/
├── api/
│   ├── tickets/[id]/
│   │   ├── deliver/route.ts             # POST initiate delivery (issues OTP)
│   │   ├── deliver/verify/route.ts      # POST verify OTP code
│   │   ├── deliver/resend/route.ts      # POST resend (one allowance)
│   │   ├── deliver/reinitiate/route.ts  # POST Admin/Super Admin: new attempt after lockout/timeout
│   │   ├── deliver/correct-phone/route.ts # POST Admin/Super Admin: FR-020
│   │   ├── deliver/override/route.ts    # POST Admin/Super Admin: FR-021
│   │   └── notification-confirm/route.ts # POST Service Manager: manual notification confirmation (FR-005)
│   ├── templates/route.ts               # GET/PATCH message templates (Super Admin)
│   ├── templates/test-send/route.ts     # POST test-send (Super Admin)
│   └── webhooks/whatsapp/route.ts       # Meta delivery-receipt callback
└── (dashboard)/
    └── admin/
        └── templates/page.tsx           # Super Admin template editor + test-send UI

lib/
├── db/
│   └── schema.ts                        # extended: notifications, otp_verifications,
│                                         # delivery_overrides, message_templates,
│                                         # manual_notification_confirmations
├── whatsapp/
│   ├── client.ts                        # Meta Cloud API HTTP client
│   └── templates.ts                     # placeholder substitution + validation (FR-017, FR-019)
├── notifications/
│   ├── send-completion.ts               # triggered on first Completed transition
│   └── alerts.ts                        # derived "needs manual confirmation" query
└── delivery/
    ├── otp.ts                           # generate/hash/verify, expiry, resend, lockout
    └── override.ts                      # FR-020/FR-021 escalation logic

jobs/
└── send-whatsapp-message.ts             # pg-boss job handler (retries on transient failure)

tests/
├── contract/
│   └── notifications-api.test.ts
├── integration/
│   ├── completion-notification.test.ts  # US1 + first-Completed-only interpretation
│   ├── notification-failure-alert.test.ts # US2
│   ├── otp-delivery.test.ts             # US3
│   ├── otp-lockout-and-timeout.test.ts  # US4
│   ├── otp-failure-escalation.test.ts   # US5
│   └── template-management.test.ts      # US6
└── e2e/
    └── complete-and-deliver.spec.ts
```

**Structure Decision**: Extends the same single Next.js project. Reads (never writes)
`003-ticket-lifecycle`'s `tickets`/`status_history` and `004`'s bill-calculation output;
writes only to this feature's own five new tables plus triggering `003`'s status
transition to "Delivered" via the same status-transition function `003` already exposes
(not a duplicate status-writing code path).

## Complexity Tracking

*No entries — no Constitution Check violations to justify.*
