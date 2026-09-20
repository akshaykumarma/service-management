# Quickstart: Validating Customer Notifications & OTP Delivery Verification

Validation guide — see `data-model.md` and `contracts/notifications-api.md` for exact
shapes. Assumes `002`, `003`, `004` are running. **All scenarios below use a mocked
WhatsApp Cloud API** (a local fake HTTP server returning canned responses) — never the real
Meta endpoint, per `plan.md`'s testing approach.

## Prerequisites

- A ticket with a calculated bill (from `004`), in "Completed" status
- `pg-boss` worker running (or in-process, per `research.md` §1)
- Mock WhatsApp API server configured at the URL `lib/whatsapp/client.ts` points to

## Scenario 1 — Automatic completion notification (User Story 1)

```bash
curl -b sm-cookies.txt -X PATCH .../api/tickets/<id>/status -d '{"toStatus":"completed"}'
# (this triggers 003's status transition, which — per research.md §4 — enqueues a
# completion notification job only because this is the FIRST time this ticket reached Completed)

# Poll the mock WhatsApp server's received-messages log, or check:
curl .../api/tickets/<id>
# Expect: a notification record with type=completion, status starting "sent"
```

Simulate the mock server returning a delivery-failure webhook for that message ID — confirm
`notifications.status` becomes `failed`.

**First-Completed-only check**: move the same ticket backward to "In Progress" (Admin, per
`003`) and forward to "Completed" again — confirm **no second** completion notification is
sent. This is `research.md` §4's plan-level interpretation; if this isn't the desired
behavior, it should go back through `/speckit-clarify`, not be silently changed here.

## Scenario 2 — Failed-notification alert (User Story 2)

Following the failure simulated above:

```bash
# As the responsible Service Manager, check for the alert (surfaced via the existing
# dashboard poll per research.md §7 — no separate "alerts" endpoint):
curl .../api/tickets/<id>
# Expect: notification.status = "failed", no manual_notification_confirmation yet

curl -X POST .../api/tickets/<id>/notification-confirm
# Expect: 200, alert now cleared
curl -X POST .../api/tickets/<id>/notification-confirm
# Expect: 409 no_failed_notification (already cleared)
```

## Scenario 3 — Mandatory OTP-verified delivery (User Story 3)

```bash
curl -X POST .../api/tickets/<id>/deliver
# Expect: 202; mock WhatsApp server received a 6-digit code

curl -X POST .../api/tickets/<id>/deliver/verify -d '{"code":"<correct code>"}'
# Expect: 200, ticket.status = "delivered"

# On a fresh attempt, try a wrong code:
curl -X POST .../api/tickets/<id>/deliver/verify -d '{"code":"000000"}'
# Expect: 400 incorrect_code, attemptsRemaining: 2

# Wait 10+ minutes (or fast-forward in a test environment), then try the original code:
# Expect: 400 code_expired

curl -X POST .../api/tickets/<id>/deliver/resend
# Expect: 202, new code issued, old one now rejected even if otherwise valid
```

## Scenario 4 — OTP lockout and timeout re-initiation (User Story 4)

```bash
# 3 wrong codes in a row:
for i in 1 2 3; do curl -X POST .../api/tickets/<id>/deliver/verify -d '{"code":"000000"}'; done
# Expect: 3rd response is 423 locked

curl -X POST .../api/tickets/<id>/deliver -b sm-cookies.txt
# Expect: still blocked — a Service Manager cannot self-initiate past a lock

curl -X POST .../api/tickets/<id>/deliver/reinitiate -b admin-cookies.txt
# Expect: 202, fresh code with its own resend allowance
```

Separately: let a code and its resend both expire with zero wrong entries — confirm
`POST .../deliver` (Service Manager) is refused and `POST .../deliver/reinitiate` (Admin)
succeeds — this is the FR-023 timeout case, distinct from the 3-strikes case but gated the
same way.

## Scenario 5 — OTP send-failure escalation (User Story 5)

```bash
# Configure the mock WhatsApp server to fail the send for this ticket's phone number
curl -X POST .../api/tickets/<id>/deliver
# (job runs, fails)

curl -X POST .../api/tickets/<id>/deliver/correct-phone -b admin-cookies.txt -d '{"correctedPhone":"+91..."}'
# Expect: 202, retry enqueued to the corrected number

# Configure the mock server to fail AGAIN even for the corrected number:
curl -X POST .../api/tickets/<id>/deliver/override -b admin-cookies.txt -d '{"reason":"customer confirmed number is unreachable, verified identity in person"}'
# Expect: 200, ticket.status = "delivered"

curl .../api/tickets/<id>
# Expect: a delivery_overrides record exists, distinct from otp_verifications.verified_at
# (which should be null/absent for this ticket)

# As Store Service Manager, attempt either step above — expect 403 for both
```

## Scenario 6 — Message template management (User Story 6)

```bash
curl -b super-admin-cookies.txt -X PATCH .../api/templates/completion \
  -d '{"body":"Hi {{customer_name}}, your {{machine_model}} is ready! Total: {{bill_total}}. - {{store_name}}"}'
# Expect: 200, approvalStatus: "pending" (research.md §5 — not live yet)

curl -X POST .../api/templates/completion/test-send -d '{"phone":"+91...","usePending":true}'
# Expect: 200, renderedContent shows placeholders correctly substituted

curl -b super-admin-cookies.txt -X PATCH .../api/templates/completion \
  -d '{"body":"Hi {{unsupported_token}}"}'
# Expect: 400 unsupported_placeholder
```

**Important**: until the pending template is marked `approved` (an out-of-band step via
Meta's Business Manager/API, not something this app's UI can instantly flip), real
completion notifications continue using the previously-approved wording. Don't expect
Scenario 1's real send to reflect a just-edited template immediately.

## Success criteria checklist (from spec.md)

- [ ] SC-001: Scenario 1's notification job is enqueued within 2 minutes of the status change
- [ ] SC-002: Scenario 2's alert appears within 30 seconds (bounded by the existing dashboard poll)
- [ ] SC-003: every "Delivered" ticket across Scenarios 3-5 has either `otp_verifications.verified_at` or a `delivery_overrides` row — never neither
- [ ] SC-004: Scenario 5's override record is structurally distinct from a normal verification (separate table, not a flag)
- [ ] SC-005: Scenario 6 completes without developer involvement (test-send validates correctness pre-approval)
- [ ] SC-006: Scenario 4 passes in both branches — zero Service-Manager-initiated re-attempts after lockout or timeout
