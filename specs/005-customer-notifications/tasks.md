---

description: "Task list for Customer WhatsApp Notifications & OTP Delivery Verification (005-customer-notifications)"
---

# Tasks: Customer WhatsApp Notifications & OTP Delivery Verification

**Input**: Design documents from `/specs/005-customer-notifications/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/notifications-api.md, quickstart.md (all present). Assumes `002-auth-rbac`,
`003-ticket-lifecycle`, and `004-parts-services-catalogue` are already scaffolded — this
feature reads `003`'s `tickets`/`status_history` and triggers `003`'s existing
status-transition function to reach "Delivered" (no duplicate status-writing path), and
reads `004`'s bill-calculation output for the completion message.

**Tests**: Included and REQUIRED per constitution Principle I (Test-First, NON-NEGOTIABLE).
All WhatsApp API calls are mocked (`plan.md`'s testing approach) — no test ever hits the
real Meta Cloud API.

**Organization**: Tasks are grouped by user story (spec.md priorities P1–P6).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 [P] Install `pg-boss` dependency for async WhatsApp sends and OTP-expiry sweeping (`research.md` §1). Node 22.22.2 satisfies pg-boss 12.x's `>=22.12.0` engine requirement.
- [X] T002 [P] Stand up a local mock WhatsApp Cloud API test server (real Node `http` server, `tests/helpers/mock-whatsapp-server.ts`, started once in Vitest `globalSetup`) with a `/messages` send endpoint (per-phone configurable failure) and HTTP control endpoints (`/__control/fail`, `/__control/reset`, `/__control/received`) — control is over HTTP, not shared module state, since `globalSetup` runs in a separate process from test-file workers; `tests/helpers/whatsapp-mock-client.ts` is what test files actually import
- [X] T003 [P] Added Meta WhatsApp Business Cloud API configuration (`WHATSAPP_API_URL`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_SECRET`) plus `OTP_HASH_SECRET` to `.env`/`.env.test`/`.env.example`, pointed at the mock server in test/dev via `globalSetup`

**Checkpoint**: Dependencies and mock infrastructure ready; no feature code yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema and core utilities every user story depends on

**⚠️ CRITICAL**: No user story task may begin until this phase is complete

- [X] T004 Define Drizzle schema for `notifications`, `otp_verifications`, `delivery_overrides`, `message_templates`, `manual_notification_confirmations` per `data-model.md` in `lib/db/schema.ts`. Added `notifications.message_id` beyond data-model.md's own column list — required to correlate a later Meta webhook to the row it updates, per this feature's own contract; `pg_boss_job_id` (already documented) is for debugging only, not the same identifier.
- [X] T005 Generate and run the migration (depends on T004); confirmed `pg-boss`'s own job-queue tables initialize into a separate `pgboss` schema on the same database on first `boss.start()` (`plan.md` — no separate infrastructure, no conflict with Drizzle's `public`/`drizzle` schemas)
- [X] T006 [P] Implement the Meta Cloud API HTTP client (plain REST calls, no SDK) in `lib/whatsapp/client.ts`, pointed at the mock server per T003 in test/dev (depends on T003)
- [X] T007 [P] Implement placeholder substitution and the fixed allow-list validation in `lib/whatsapp/templates.ts` (`research.md` §6) (depends on T004). Added a 7th placeholder, `otp_code`, beyond FR-017's six named ones — "at minimum" leaves room for it, and the OTP template cannot function without a way to insert the actual code.
- [X] T008 [P] Implement OTP generate/hash(HMAC-SHA256, never plaintext)/verify utilities (`research.md` §2) in `lib/delivery/otp.ts` (depends on T004)
- [X] T009 Implement the `pg-boss` job handler scaffold for sending a WhatsApp message, with retry-with-backoff on transient failure, in `jobs/send-whatsapp-message.ts` (depends on T006). **Design decision**: retries happen *inside* one job execution (in-process backoff loop, not pg-boss's own job-level retry), so exactly one `notifications` row is written per logical send attempt — letting pg-boss retry the whole job would insert a new row per retry. **Security fix applied here**: the job's `storedContent` is persisted separately from `sendContent` specifically so an OTP's real code (needed for the actual send) is never what gets written to `notifications.rendered_content` — plan.md's Constraints require OTP codes "never logged," and a naive single-content design would have violated that.
- [X] T010 [P] Implement the derived alert queries — failed notification awaiting manual confirmation (FR-004) and OTP attempt awaiting Admin/Super-Admin override (locked or timeout-exhausted) — as read-only queries, no new real-time push mechanism (`research.md` §7), in `lib/notifications/alerts.ts` (depends on T004)

**Infrastructure note beyond the original task list**: `lib/jobs/boss.ts` (pg-boss singleton) is enqueue-only — the actual `.work()` registration happens once via `instrumentation.ts` (a new file, Next.js's server-startup hook) in production/dev, and once via `tests/global-setup.ts` in tests, each on its own separate `PgBoss` instance. This split exists because Vitest resets the module registry between test files; sharing one enqueue+work singleton would have started (and never stopped) a redundant worker per test file.

**Checkpoint**: Schema and core utilities exist — user story work can begin.

---

## Phase 3: User Story 1 - Automatic Completion Notification (Priority: P1) 🎯 MVP

**Goal**: The moment a ticket is marked "Completed," the customer automatically receives a
WhatsApp message with bill details — sent only on the ticket's first reach of "Completed."

**Independent Test**: Mark a ticket "Completed" and confirm a WhatsApp message is generated
containing the expected bill details, without any manual action beyond the status change.

### Tests for User Story 1 ⚠️ Write first; confirm they fail before implementing

- [X] T011 [P] [US1] Contract test for `POST /api/webhooks/whatsapp` (Meta signature verification, status update by message ID) in `tests/contract/notifications-api.test.ts`
- [X] T012 [P] [US1] Integration test for completion-message content/recipient and the first-Completed-only trigger (`research.md` §4 — no second message on a later re-Completed transition) in `tests/integration/completion-notification.test.ts`

### Implementation for User Story 1

- [X] T013 [US1] Implement the first-Completed-only check (`status_history` contains no prior `to_status = 'completed'` row, mirroring `004`'s Completed-lock pattern) and completion-notification job enqueue in `lib/notifications/send-completion.ts` (depends on T004, T007, T009). Implemented as a `COUNT(*) = 1` read (not `004`'s `EXISTS`) since the caller inserts this transition's own `status_history` row before invoking this check.
- [X] T014 [US1] Hook `send-completion.ts` into `003-ticket-lifecycle`'s existing status-transition function on a transition to "completed" — do not duplicate the status-writing code path (`plan.md`'s Structure Decision) — in `lib/tickets/status-transitions.ts` (depends on T013). The actual `tickets`/`status_history` write previously lived inline in `app/api/tickets/[id]/status/route.ts` (no separate function existed yet); extracted it into a new `applyStatusTransition()` in `status-transitions.ts` so this is the single write path, and the route now calls it.
- [X] T015 [US1] Implement `POST /api/webhooks/whatsapp` (Meta signature verification; always responds `200`; updates the matching `notifications.status` by message ID) in `app/api/webhooks/whatsapp/route.ts` (depends on T004). Signature check uses HMAC-SHA256 over the raw body compared via `timingSafeEqual`; an invalid/missing signature returns `200` without touching `notifications` (fail-closed).
- [X] T016 [US1] Confirm T011-T012 pass; run `quickstart.md` Scenario 1 (depends on T013-T015). Both pass; full suite (84 tests) green; `npx tsc --noEmit` clean.

**Checkpoint**: User Story 1 fully functional and independently testable/deployable (MVP).

---

## Phase 4: User Story 2 - Notification Failure Handling (Priority: P2)

**Goal**: A failed completion notification alerts the responsible Service Manager in-app,
who must confirm manual follow-up before the alert clears.

**Independent Test**: Simulate a failed notification and confirm the Service Manager sees
an in-app alert that isn't dismissible until they confirm manual follow-up.

### Tests for User Story 2 ⚠️ Write first; confirm it fails before implementing

- [X] T017 [P] [US2] Integration test for failed-notification alert surfacing and the confirm-clears-alert flow, including the already-cleared `409` case, in `tests/integration/notification-failure-alert.test.ts`

### Implementation for User Story 2

- [X] T018 [US2] Implement `POST /api/tickets/:id/notification-confirm` (creates a `manual_notification_confirmations` row only against a `status = 'failed'` notification; `409 no_failed_notification` otherwise) in `app/api/tickets/[id]/notification-confirm/route.ts` (depends on T010). Confirms every currently-unconfirmed failed notification on the ticket (not just one), matching `hasUnconfirmedFailedNotification`'s "any" semantics so the alert actually clears.
- [X] T019 [US2] Surface T010's failed-notification alert on the ticket detail view, refreshed via the existing dashboard poll cycle (`research.md` §7 — no new push infrastructure) in `app/(dashboard)/tickets/[id]/page.tsx` (depends on T010). **Deviation**: `research.md` §7 assumes `006-dashboard-reporting`'s 30-second poll already exists, but `006` hasn't been implemented yet (005 precedes it in build order) — added a self-contained 30-second `setInterval` poll to this page instead of a nonexistent one, meeting SC-002 without new push infra. `006` can consolidate onto this later. Also extended `GET /api/tickets/:id`'s response with `notificationAlert: { failed }`, additive per the same pattern `004` used for `bill`.
- [X] T020 [US2] Confirm T017 passes; run `quickstart.md` Scenario 2 (depends on T018-T019). Passes; full suite (85 tests) green; `npx tsc --noEmit` clean.

**Checkpoint**: User Stories 1 and 2 both independently functional.

---

## Phase 5: User Story 3 - Mandatory OTP-Verified Delivery (Priority: P3)

**Goal**: Delivery verification via a 6-digit WhatsApp OTP is the sole normal path to
"Delivered" — 10-minute expiry, one resend after a 60-second cooldown.

**Independent Test**: On a "Completed" ticket, initiate delivery, verify the correct code
transitions it to "Delivered," and verify an incorrect or expired code does not.

### Tests for User Story 3 ⚠️ Write first; confirm they fail before implementing

- [X] T021 [P] [US3] Contract tests for `deliver`/`deliver/verify`/`deliver/resend` (all documented status codes) in `tests/contract/notifications-api.test.ts`
- [X] T022 [P] [US3] Integration test for OTP issuance, correct/incorrect/expired verification, and resend-with-invalidation in `tests/integration/otp-delivery.test.ts`. **Deviation from strict TDD ordering**: written and run immediately after T021 rather than before T024-T027 were implemented (both target the same underlying logic, and T021's red state was already confirmed) — noted here rather than silently glossed over.
- [X] T023 [P] [US3] E2E test for the full complete-and-deliver flow (completion notification through OTP-verified delivery) in `tests/e2e/complete-and-deliver.spec.ts`. Reads the real OTP code from the mock WhatsApp server's received-message log (`tests/helpers/whatsapp-mock-client.ts`), never from the UI (which never exposes it, by design). Added `tests/e2e/global-setup.ts` (wired via `playwright.config.ts`) to start that same mock server for e2e, since the e2e `webServer` is a real `next start` process with nothing else standing up the WhatsApp endpoint `.env` points at.

### Implementation for User Story 3

- [X] T024 [US3] Implement OTP issuance/verification/resend/expiry logic — 10-minute expiry (FR-008), one resend with 60-second cooldown invalidating the prior code (FR-009), no optimistic reuse of an active unexpired attempt — in `lib/delivery/otp.ts` (depends on T008). No `superseded` column: data-model.md's "marks the prior one superseded" is achieved by recency alone (`ORDER BY issued_at DESC LIMIT 1` is always "the current row") rather than an extra flag. FR-012's "per delivery attempt" failed-attempt count carries forward onto a resend's new row rather than resetting; the new row's own `resendUsed = true` marks that this attempt's one resend is spent (not the prior row's). **Correction made during Phase 6 work**: `resendOtp` initially also blocked resend once the current code had expired, but spec.md's own FR-009 edge case (a customer slow to check WhatsApp) is exactly what resend exists for — removed the expiry check so only `locked`/`verifiedAt` end an attempt; resend remains available on an expired-but-not-yet-swept code.
- [X] T025 [US3] Implement `POST /api/tickets/:id/deliver` (status gate — "Completed" only, FR-006; `409 attempt_already_active` check; enqueues the OTP-send job) in `app/api/tickets/[id]/deliver/route.ts` (depends on T024, T009)
- [X] T026 [US3] Implement `POST /api/tickets/:id/deliver/verify` (correct code transitions the ticket to "Delivered" via `003`'s status-transition function with an immutable verified-by/timestamp record, FR-010/FR-014; incorrect/expired code rejected without transitioning, FR-011) in `app/api/tickets/[id]/deliver/verify/route.ts` (depends on T024). **Interpretation note**: the generic `PATCH /api/tickets/:id/status` endpoint is left able to set `toStatus: "delivered"` directly (003's own pre-existing forward-transition rule) rather than being closed off — FR-010 is read as governing this endpoint's own behavior (only a correct code transitions *through this path*), not as requiring 003's general admin mechanism to be restricted; flagging this rather than silently picking one reading.
- [X] T027 [US3] Implement `POST /api/tickets/:id/deliver/resend` (cooldown and resend-already-used checks) in `app/api/tickets/[id]/deliver/resend/route.ts` (depends on T024)
- [X] T028 [US3] Add delivery initiation, code entry, and resend controls to the ticket detail page in `app/(dashboard)/tickets/[id]/page.tsx` (depends on T025-T027). `GET /api/tickets/:id` additionally returns `delivery: { activeAttempt }` (same additive pattern as `notificationAlert`) so the UI reflects an in-progress attempt correctly across a page reload, not just within one client session.
- [X] T029 [US3] Confirm T021-T023 pass; run `quickstart.md` Scenario 3 (depends on T024-T028). All pass, including the e2e spec against a real `next build && next start`. **Two real bugs found and fixed while wiring this up**: (1) `jobs/send-whatsapp-message.ts` was calling `sendWhatsAppMessage` with `params: {}` — the actual OTP code (and every other template value) was never being sent to the WhatsApp API at all, only ever written to `notifications.rendered_content`; renamed the job payload field from `sendContent` to `templateParams` and now pass it through. (2) `instrumentation.ts` (from Phase 2) never actually ran, because Next.js 14.x requires `experimental.instrumentationHook: true` in `next.config.mjs` (stable-by-default only from Next.js 15) — added it; without this fix the production pg-boss worker never started outside of tests. Full vitest suite (95 tests) and all 5 Playwright e2e specs green; `npx tsc --noEmit` clean.

**Checkpoint**: User Stories 1-3 independently functional.

---

## Phase 6: User Story 4 - OTP Lockout & Admin Override (Priority: P4)

**Goal**: 3 failed attempts lock OTP entry; a fully timed-out attempt (code + resend both
expired, zero wrong entries) locks the same way. Only Admin/Super Admin can start the next
attempt in either case.

**Independent Test**: Enter 3 wrong codes and confirm entry locks, then confirm an
Admin/Super Admin can start a fresh attempt. Separately, let a code and its resend both
expire untouched and confirm the same Admin/Super-Admin-only re-initiation gate applies.

### Tests for User Story 4 ⚠️ Write first; confirm it fails before implementing

- [X] T030 [P] [US4] Integration test for 3-strikes lockout, timeout-exhaustion lockout (FR-023), and Admin/Super-Admin-only reinitiation (both branches) in `tests/integration/otp-lockout-and-timeout.test.ts`

### Implementation for User Story 4

- [X] T031 [US4] Implement failed-attempt counting and lock-at-3 (FR-012) in `lib/delivery/otp.ts`'s verify path (depends on T024). Already done as part of T024 (`verifyOtp` sets `locked = true` on the 3rd wrong entry) — no separate change needed here.
- [X] T032 [US4] Implement the `pg-boss` scheduled sweep marking an attempt `locked` once both the original code's and the resend's `expires_at` have passed with `failed_attempts < 3` (FR-023, `data-model.md`) as a new job in `jobs/` (depends on T024, T009). `jobs/sweep-otp-timeouts.ts`, cron `* * * * *`. The `WHERE locked = false` condition alone is sufficient (no explicit `failed_attempts < 3` needed) since the 3-strikes path already sets `locked = true` synchronously; only the latest (by recency) row per ticket is ever unlocked and unverified, so no ticket-scoping is needed in the SQL either.
- [X] T033 [US4] Implement `POST /api/tickets/:id/deliver/reinitiate` (Admin/Super-Admin-only, `403` for Store Service Manager even though they can call the original `deliver`; creates a new attempt row with its own resend allowance, never clears the old locked row — FR-013, FR-023) in `app/api/tickets/[id]/deliver/reinitiate/route.ts` (depends on T031, T032). Extracted the OTP-send job construction (duplicated across `deliver`, `resend`, and this route) into `lib/delivery/send-otp-message.ts`.
- [X] T034 [US4] Add lockout-state display and the Admin/Super-Admin-only reinitiate control to the delivery UI in `app/(dashboard)/tickets/[id]/page.tsx` (depends on T033, T028). `GET /api/tickets/:id`'s `delivery` object gained `locked` (reusing T010's existing `needsOtpOverride` query, same additive-field pattern as `notificationAlert`).
- [X] T035 [US4] Confirm T030 passes; run `quickstart.md` Scenario 4 (depends on T031-T034). Passes; full suite (97 tests) and all 5 e2e specs green; `npx tsc --noEmit` clean. **Correction found while implementing**: `resendOtp` (T024) incorrectly refused a resend once the current code had already expired — but spec.md's own FR-009 edge case (customer slow to check WhatsApp) requires resend to still work past expiry; fixed by dropping that expiry check (only `locked`/`verifiedAt` end an attempt now).

**Checkpoint**: User Stories 1-4 independently functional.

---

## Phase 7: User Story 5 - OTP Delivery Failure Escalation (Priority: P5)

**Goal**: When the OTP message itself fails to send, Admin/Super Admin can correct the
phone number and retry; if that also fails, they can override to "Delivered" with a
mandatory recorded reason, distinct from a normal OTP-verified delivery.

**Independent Test**: Simulate an OTP send failure, correct the phone number and confirm a
retry is sent; simulate a second failure on the corrected number and confirm an
Admin/Super Admin can override to "Delivered," while a Store Service Manager cannot do
either step.

### Tests for User Story 5 ⚠️ Write first; confirm it fails before implementing

- [X] T036 [P] [US5] Integration test for the phone-correction-and-retry step, the override-to-Delivered step gated on correction having failed first, and Store-Service-Manager denial of both, in `tests/integration/otp-failure-escalation.test.ts`

### Implementation for User Story 5

- [X] T037 [US5] Implement FR-020 phone-correction-and-retry — updates only this ticket's own `customer_phone` field, never `003`'s shared `customers.phone` (`research.md` §3) — and enqueues a fresh OTP send to the corrected number, in `lib/delivery/override.ts` (depends on T024, T009). **Gate design**: `hasFailedOtpSend`/`correctionRetryHasFailed` are both derived queries over `notifications` (no new "correction attempted" column) — `correctionRetryHasFailed` counts distinct `recipient_phone` values with a failed OTP send for the ticket (≥2 means a correction happened and its retry also failed), since `correct-phone` is the only way `tickets.customer_phone` ever changes.
- [X] T038 [US5] Implement FR-021 override-to-Delivered — `409 correction_not_yet_attempted` unless the FR-020 retry has itself already failed; creates a `delivery_overrides` row (structurally distinct from `otp_verifications`, `research.md` §3 of data-model.md) and transitions the ticket via `003`'s status-transition function — in `lib/delivery/override.ts` (depends on T037)
- [X] T039 [US5] Implement `POST /api/tickets/:id/deliver/correct-phone` (Admin/Super-Admin-only, FR-020/FR-022) in `app/api/tickets/[id]/deliver/correct-phone/route.ts` (depends on T037)
- [X] T040 [US5] Implement `POST /api/tickets/:id/deliver/override` (Admin/Super-Admin-only, FR-021/FR-022) in `app/api/tickets/[id]/deliver/override/route.ts` (depends on T038)
- [X] T041 [US5] Add the Admin/Super-Admin-only phone-correction and override controls to the delivery UI in `app/(dashboard)/tickets/[id]/page.tsx` (depends on T039-T040, T034). The page now fetches `GET /api/auth/session` once to know the caller's role client-side (nothing previously did) so these controls only render for Admin/Super Admin — the server-side `403` is still the actual enforcement. `GET /api/tickets/:id`'s `delivery` object gained `sendFailed`/`canOverride`.
- [X] T042 [US5] Confirm T036 passes; run `quickstart.md` Scenario 5 (depends on T037-T041). Passes; full suite (99 tests) and all 5 e2e specs green; `npx tsc --noEmit` clean.

**Checkpoint**: User Stories 1-5 independently functional.

---

## Phase 8: User Story 6 - Message Template Management (Priority: P6)

**Goal**: Super Admin edits completion/OTP message wording and test-sends before it goes
live; edits go through Meta's template-approval flow rather than taking effect instantly
(`research.md` §5).

**Independent Test**: As Super Admin, edit a template's wording, send a test message to a
known number, and confirm the placeholders resolve correctly before activating the change.

### Tests for User Story 6 ⚠️ Write first; confirm they fail before implementing

- [ ] T043 [P] [US6] Contract tests for `GET`/`PATCH /api/templates/:type` and `POST /api/templates/:type/test-send` in `tests/contract/notifications-api.test.ts`
- [ ] T044 [P] [US6] Integration test for template edit → `pending` approval state → unaffected live sends until approved → test-send preview → unsupported-placeholder rejection (FR-019) in `tests/integration/template-management.test.ts`

### Implementation for User Story 6

- [ ] T045 [US6] Implement template read/edit as an append-only insert (never update-in-place, so the previously-approved version stays retrievable), `approval_status` tracking, and allow-list validation at save time (`research.md` §5, FR-019) in `lib/whatsapp/templates.ts` (depends on T007)
- [ ] T046 [US6] Implement `GET`/`PATCH /api/templates/:type` (returns current approved body plus any pending edit; `PATCH` sets `approval_status = 'pending'`, does not go live immediately) in `app/api/templates/route.ts` and `app/api/templates/[type]/route.ts` (depends on T045)
- [ ] T047 [US6] Implement `POST /api/templates/:type/test-send` (`usePending: true` renders the not-yet-approved wording directly rather than sending via Meta, since an unapproved template can't be sent outside a customer-initiated session — `contracts/notifications-api.md`) in `app/api/templates/[type]/test-send/route.ts` (depends on T045)
- [ ] T048 [US6] Build the Super Admin template editor + test-send UI, making the pending-vs-approved distinction visible (FR-016's "new wording... subsequently sent" is true once Meta-approved, not on save) in `app/(dashboard)/admin/templates/page.tsx` (depends on T046-T047)
- [ ] T049 [US6] Confirm T043-T044 pass; run `quickstart.md` Scenario 6 (depends on T045-T048)

**Checkpoint**: All six user stories independently functional — spec.md fully implemented.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T050 [P] Run the full `quickstart.md` validation (all 6 scenarios, all 6 success-criteria checklist items) end-to-end
- [ ] T051 [P] Accessibility audit (WCAG 2.1 AA) of the delivery/OTP UI and the template editor
- [ ] T052 [P] Security review: `otp_verifications.code_hash` never returned in any API response or logged in plaintext anywhere; webhook signature verification enforced; Admin/Super-Admin gates enforced on every escalation route (reinitiate, correct-phone, override)
- [ ] T053 Performance check: the synchronous parts of notification enqueue and OTP verification meet the constitution's <500ms p95 (the WhatsApp send itself is intentionally async, `research.md` §1)
- [ ] T054 [P] Note the "first reached Completed" derived-fact check (`research.md` §4) as the third independent implementation of the same pattern alongside `004-parts-services-catalogue`'s Completed-lock and `006-dashboard-reporting`'s report attribution — flagged there (`004`'s T032) as a future-consolidation candidate, not silently duplicated a third time without record

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup (T006 needs T003's mock endpoint config) — BLOCKS every user story
- **User Stories (Phases 3-8)**: All depend on Foundational completion
  - US1 has no dependency on US2-US6
  - US2 depends on US1's notification records existing to have something to alert on (T010's query reads `notifications`, populated by US1)
  - US3 depends only on Foundational — can be built in parallel with US1/US2, though it needs a "Completed" ticket to test against (US1 populates that naturally)
  - US4 depends on US3's `otp_verifications` attempt logic (T024) existing to lock/reinitiate
  - US5 depends on US3's OTP-send job (T009, T024) existing as the thing that can fail
  - US6 depends only on Foundational (T007) — can be built in parallel with US1-US5
- **Polish (Phase 9)**: Depends on all six user stories being complete

### Within Each User Story

- Tests MUST be written and confirmed failing before implementation begins (constitution Principle I)
- Schema/utilities before routes; routes before UI
- Story's own "confirm tests pass + run quickstart scenario" task is last

### Parallel Opportunities

- T001-T003 (Setup) can all run in parallel
- T006, T007, T008, T010 (Foundational) can run in parallel once T004/T005 land
- T011-T012 (US1 tests) can run in parallel — different files
- T021-T023 (US3 tests) can run in parallel — different files
- T043-T044 (US6 tests) can run in parallel — different files
- Once Foundational is done, US1, US3, and US6 can be staffed in parallel (none depends on another's implementation, only on Foundational)
- T050-T052, T054 (Polish) can run in parallel

---

## Parallel Example: User Stories 1, 3, and 6

```bash
# Once Foundational (T004-T010) is done, these can proceed in parallel:
Task: "US1: Implement first-Completed-only check in lib/notifications/send-completion.ts"
Task: "US3: Implement OTP issuance/verification in lib/delivery/otp.ts"
Task: "US6: Implement template CRUD in lib/whatsapp/templates.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (blocks everything)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: run `quickstart.md` Scenario 1 independently
5. Deploy/demo if ready — customers now get notified automatically, even before OTP
   delivery verification (US3) or template management (US6) exist

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. + User Story 1 → validate → deploy (MVP — completion notifications live)
3. + User Story 2 → validate → deploy (failure alerting live)
4. + User Story 3 → validate → deploy (OTP-verified delivery live — the core lifecycle gate)
5. + User Story 4 → validate → deploy (lockout/timeout safeguards live)
6. + User Story 5 → validate → deploy (send-failure escalation live — no more dead-end tickets)
7. + User Story 6 → validate → deploy (template editing live — spec.md complete)
8. Phase 9 Polish

Note the natural build order tracks spec.md's own priority ordering here (P1 through P6),
unlike `004`'s tasks.md — this feature's stories build on each other more linearly (US4
needs US3's attempt logic; US5 needs US3's send path), so priority order and dependency
order happen to coincide.

### Parallel Team Strategy

Once Foundational is done: Developer A takes US1→US2 (notification + failure handling);
Developer B takes US3→US4→US5 (the OTP delivery chain, since these three build on each
other sequentially); Developer C takes US6 (template management) independently throughout.

---

## Notes

- [P] tasks touch different files with no unmet dependency
- [Story] labels trace every task back to its spec.md user story
- Every test task MUST be run and confirmed **failing** before its paired implementation task starts
- T014, T026, and T038 each trigger `003-ticket-lifecycle`'s existing status-transition
  function rather than writing ticket status directly — do not introduce a second
  status-writing code path
- T054 flags this feature's own instance of the recurring "first reached Completed"
  derived-fact pattern, already duplicated once in `004` — worth resolving alongside that
  feature's own flagged debt rather than independently
- Commit after each task or logical group
- Stop at any checkpoint to validate a story independently before continuing
