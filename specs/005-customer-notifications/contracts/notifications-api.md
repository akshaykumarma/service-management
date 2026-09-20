# API Contract: Notifications & Delivery Verification

Per constitution Principle III. Common error shape and auth requirement as in prior
contracts. All ticket-scoped endpoints require `assertAccess(user, ticket.storeId)`.

---

## `POST /api/tickets/:id/deliver`

Initiates delivery verification. **Requires**: ticket status is "Completed"; no active
(unexpired, unlocked) OTP attempt already exists for this ticket.

**Responses**:
- `202` — an OTP send job has been enqueued (async, `research.md` §1); response doesn't
  wait for the WhatsApp API call itself
- `409 { code: "ticket_not_completed" }` — FR-006
- `409 { code: "attempt_already_active" }` — an unexpired, unlocked attempt exists

---

## `POST /api/tickets/:id/deliver/verify`

**Request**: `{ "code": "123456" }`

**Responses**:
- `200 { "ticket": { "status": "delivered" }, "deliveredAt", "verifiedBy" }` — FR-010, FR-014
- `400 { code: "incorrect_code", attemptsRemaining: number }` — FR-011, FR-012
- `400 { code: "code_expired" }` — FR-011
- `423 { code: "locked" }` — 3rd failure just occurred, or already locked

---

## `POST /api/tickets/:id/deliver/resend`

**Requires**: an active attempt exists and hasn't already used its one resend; 60-second
cooldown since issuance has elapsed.

**Responses**:
- `202` — new code enqueued, prior code invalidated (FR-009)
- `429 { code: "cooldown_active", retryAfterSeconds: number }`
- `409 { code: "resend_already_used" }`

---

## `POST /api/tickets/:id/deliver/reinitiate`

Starts a fresh attempt after a lockout or timeout-exhaustion. **Requires**: Admin or Super
Admin (FR-013, FR-023) — a Store Service Manager gets `403` here even if they could
initiate the *original* `POST .../deliver`.

**Responses**: `202` — new attempt enqueued · `403` for Store Service Manager

---

## `POST /api/tickets/:id/deliver/correct-phone`

**Requires**: Admin or Super Admin (FR-020, FR-022); an OTP send failure has actually
occurred for this ticket's current attempt (not callable at will).

**Request**: `{ "correctedPhone": "string" }`

**Responses**:
- `202` — phone updated **on this ticket only** (`research.md` §3, not `customers.phone`),
  fresh OTP enqueued to the corrected number
- `409 { code: "no_send_failure_to_correct" }`
- `403` — Store Service Manager

---

## `POST /api/tickets/:id/deliver/override`

**Requires**: Admin or Super Admin; the FR-020 phone-correction retry has itself already
failed to send.

**Request**: `{ "reason": "string" }`

**Responses**:
- `200 { "ticket": { "status": "delivered" }, "override": { "reason", "overriddenBy", "createdAt" } }` — FR-021
- `409 { code: "correction_not_yet_attempted" }` — the two-step escalation (`research.md`
  intent) hasn't been followed — override isn't reachable as a first resort
- `403` — Store Service Manager

---

## `POST /api/tickets/:id/notification-confirm`

Clears a failed-notification alert. **Requires**: any role with access to this ticket
(FR-005 says "the Service Manager," but per `research.md`'s reassignment-edge-case
reading, this is store-scoped access, not a single named individual — see spec.md's edge
case on reassignment).

**Responses**: `200` — confirmation recorded, alert cleared · `409 { code: "no_failed_notification" }`

---

## `GET /api/templates` / `PATCH /api/templates/:type`

Super-Admin-only (FR-016). `GET` returns the current approved body plus any pending edit;
`PATCH` submits a new body (validated against the placeholder allow-list, FR-019) and sets
it to `pending` (`research.md` §5 — **does not go live immediately**).

**Responses**:
- `200 { "approved": {...}, "pending": {...} | null }`
- `400 { code: "unsupported_placeholder", token: "string" }` — FR-019

---

## `POST /api/templates/:type/test-send`

**Request**: `{ "phone": "string", "usePending": boolean }` — `usePending: true` tests the
not-yet-approved wording directly (bypassing Meta send, rendering only — see
`quickstart.md`), since an unapproved template can't actually be sent to a real number
outside a customer-initiated session.

**Responses**: `200 { "renderedContent": "string" }` — FR-018

---

## `POST /api/webhooks/whatsapp`

Meta's delivery-receipt callback (not called by this app's own frontend). Verifies Meta's
signature header before processing.

**Request** (Meta's shape, abbreviated): `{ "entry": [{ "changes": [{ "value": { "statuses": [{ "id", "status": "sent|delivered|failed" }] } }] }] }`

**Responses**: `200` always (per Meta's own integration requirement — non-200 triggers
their retry storm); updates the matching `notifications.status` by the message ID Meta
returned when the job originally sent it.
