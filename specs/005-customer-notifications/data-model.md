# Phase 1 Data Model: Customer WhatsApp Notifications & OTP Delivery Verification

## Entities

### `notifications` (spec.md: Notification)

| Field | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `ticket_id` | uuid | FK → `tickets.id` (nullable — null for a Super Admin test-send, `research.md` §5 doesn't tie a test-send to a real ticket) |
| `type` | enum(`completion`, `otp`) | required |
| `channel` | text | `"whatsapp"` (only value in v1) |
| `recipient_phone` | text | required |
| `rendered_content` | text | the actual sent text, post-placeholder-substitution |
| `status` | enum(`sent`, `delivered`, `failed`) | required, updated by the Meta webhook (`research.md` §1 job posts it, webhook updates it) |
| `pg_boss_job_id` | text | nullable — for correlating with the job queue during debugging |
| `sent_at` / `status_updated_at` | timestamptz | required |

**Validation rules**:
- `status` starts `sent` (job successfully handed the message to Meta's API) and later
  transitions to `delivered` or `failed` via the webhook (FR-003); it is never set directly
  by application code outside those two paths.

### `otp_verifications` (spec.md: OTP Verification)

| Field | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `ticket_id` | uuid | FK → `tickets.id` |
| `code_hash` | text | HMAC-SHA256 of the 6-digit code (`research.md` §2) — plaintext never stored |
| `issued_at` / `expires_at` | timestamptz | `expires_at = issued_at + 10 minutes` (FR-008) |
| `resend_used` | boolean | default `false`; flips to `true` on the one allowed resend (FR-009) |
| `failed_attempts` | integer | default `0`; increments on each wrong-code entry, locks at `3` (FR-012) |
| `locked` | boolean | default `false`; `true` after 3 failed attempts OR after both code and resend expire untouched (FR-023) |
| `verified_at` | timestamptz | nullable; set on successful verification (FR-014) |
| `verified_by` | uuid | FK → `users.id`; nullable until verified |

**Validation rules**:
- Only one **active** (non-expired, non-superseded-by-resend) row per `ticket_id` at a
  time — a resend inserts a new row and marks the prior one superseded rather than
  mutating the code in place, preserving an audit trail of every code issued.
- `locked` is set by application logic (not a DB trigger) at the moment the 3rd failed
  attempt is recorded, or by a `pg-boss` scheduled sweep that marks an attempt `locked`
  once both `expires_at` (original) and the resend's `expires_at` have passed with
  `failed_attempts < 3` — this is what FR-023 governs (timeout exhaustion, distinct from
  the 3-strikes case, but resulting in the same `locked = true` state and the same
  Admin/Super-Admin-only re-initiation gate).
- Re-initiation after `locked = true` (by Admin/Super Admin) creates a **new** row; it does
  not clear `locked` on the existing one (append-only history of attempts).

### `delivery_overrides` (spec.md: Delivery Override Record)

| Field | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `ticket_id` | uuid | FK → `tickets.id`, unique (at most one override per ticket) |
| `reason` | text | required (FR-021) |
| `overridden_by` | uuid | FK → `users.id` |
| `created_at` | timestamptz | required |

**Validation rules**:
- Existing as its **own table** (rather than a flag on `otp_verifications`) is a
  deliberate structural choice: a ticket delivered via override has **no** row here that
  could be confused with a successful `otp_verifications.verified_at` — querying "was this
  ticket delivered via override" is `EXISTS (SELECT 1 FROM delivery_overrides WHERE
  ticket_id = $1)`, structurally distinct from a normal OTP-verified delivery, satisfying
  FR-021/SC-004's distinguishability requirement by construction rather than by a flag that
  could be misread.
- Creating a row here is only reachable after the FR-020 phone-correction-and-retry path
  has itself failed (enforced in `lib/delivery/override.ts`, not left to the caller to
  self-police).

### `message_templates` (spec.md: Message Template)

| Field | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `type` | enum(`completion`, `otp`) | unique — exactly one active template per type |
| `body` | text | the human-readable wording, with `{{placeholder}}` tokens |
| `meta_template_name` | text | nullable — the name of the Meta-approved template this maps to; null while `approval_status = 'pending'` |
| `approval_status` | enum(`approved`, `pending`) | see `research.md` §5 — a `pending` template's `body` is not yet what's actually sent |
| `updated_by` | uuid | FK → `users.id` |
| `updated_at` | timestamptz | required |

**Validation rules**:
- `body` is validated at save time to contain only tokens from the fixed allow-list
  (customer_name, ticket_id, machine_model, bill_total, store_name, store_phone) — FR-019.
- Saving a new `body` sets `approval_status = 'pending'` and (out of band, via the Meta
  Business API/console per `research.md` §5) triggers submission for approval; the
  previously-approved `body`/`meta_template_name` remains what's actually used for sends
  until approval completes — this requires keeping the previously-approved version
  retrievable, so an edit **inserts a new row** rather than updating in place, with the
  most recent `approved` row per `type` being the one used for real sends and the most
  recent row overall (approved or pending) being what the editor UI displays.

### `manual_notification_confirmations` (spec.md: Manual Notification Confirmation)

| Field | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `notification_id` | uuid | FK → `notifications.id`, unique (one confirmation clears one failed notification) |
| `confirmed_by` | uuid | FK → `users.id` |
| `created_at` | timestamptz | required |

**Validation rules**:
- Only creatable for a `notifications` row with `status = 'failed'` (FR-005).
- Its existence is exactly what clears the FR-004 alert — the alert itself is not a stored
  entity, just the derived query in `research.md` §7: `notifications WHERE status =
  'failed' AND NOT EXISTS (matching manual_notification_confirmations row)`.

## Relationships

```text
tickets (1, from 003) ───< notifications
tickets (1, from 003) ───< otp_verifications
tickets (1, from 003) ─── 0..1 delivery_overrides
notifications (1) ─── 0..1 manual_notification_confirmations
users (N, from 002) ─── actor on otp_verifications.verified_by, delivery_overrides.overridden_by,
                          manual_notification_confirmations.confirmed_by, message_templates.updated_by
```

## State Transitions

**Notification delivery status**: `sent → delivered` or `sent → failed` (webhook-driven,
one-way, terminal either way).

**OTP verification attempt** (per `otp_verifications` row):
```text
issued ──(correct code before expiry)──► verified [terminal]
issued ──(wrong code, <3 total)────────► issued (failed_attempts++)
issued ──(3rd wrong code)───────────────► locked [terminal for this row]
issued ──(both code+resend expire, 0 wrong entries)──► locked [terminal for this row]
```
A `locked` row never transitions further; re-initiation always creates a **new** row
(Admin/Super-Admin-gated per FR-013/FR-023).

**Message template**: `pending → approved` (external, via Meta's review — not a
system-internal transition this codebase triggers or controls the timing of).
