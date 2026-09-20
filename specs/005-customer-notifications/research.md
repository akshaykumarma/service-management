# Phase 0 Research: Customer WhatsApp Notifications & OTP Delivery Verification

## 1. Async job queue for WhatsApp sends

**Decision**: `pg-boss`, a Postgres-backed job queue, running as a worker process (or
in-process worker within the Next.js server for this scale) alongside the app. Ticket
status transitions and OTP initiation enqueue a job rather than calling the WhatsApp API
inline within the HTTP request.

**Rationale**: PRD §10 explicitly recommends `pg-boss` for "async WhatsApp sends, OTP
expiry, and report generation... avoids an extra Redis dependency at small scale." Enqueuing
rather than calling inline also means a transient WhatsApp API failure doesn't fail the
ticket status-change request itself (the status change and the notification attempt are
decoupled), and gives a natural place to implement retry-with-backoff.

**Alternatives considered**:
- **Inline synchronous call during the request** — rejected: couples the ticket
  status-update transaction's success to an external API's availability/latency, and
  offers no retry mechanism for a transient failure.
- **BullMQ (Redis-backed)** — rejected per PRD §10's own stated preference; would add an
  infrastructure dependency (Redis) this project's self-hosted, small-scale deployment
  doesn't need.

## 2. OTP code storage

**Decision**: HMAC-SHA256 (keyed with a server-side secret) of the 6-digit code, not
bcrypt.

**Rationale**: bcrypt's deliberate slowness exists to resist offline brute-forcing of
user-chosen, high-entropy-attempt passwords over an unbounded time window. A 6-digit OTP
is short-lived (10 minutes), single-use, and already rate-limited by FR-012's 3-attempt
lockout — the threat model is different, and a fast keyed hash is the standard,
appropriately-scoped choice for this case. Using bcrypt here would not be wrong, but is
unnecessary compute for no added protection given the lockout already in place.

**Alternatives considered**:
- **bcrypt (cost 12, matching the constitution's password standard)** — not disqualified,
  but the constitution's bcrypt-12 minimum is explicitly about *password* hashing; applying
  it to OTPs would be over-applying that specific constraint to a different threat model.
- **Plaintext storage** — rejected outright: constitution Principle IV forbids storing
  sensitive credentials without protection, and a 6-digit code left in plaintext in the
  database is exactly that.

## 3. Scope of the OTP-failure phone-number correction (FR-020)

**Decision**: Correcting a customer's phone number during OTP-failure escalation updates
**only that ticket's own `customer_phone` field**, never `003-ticket-lifecycle`'s shared
`customers.phone` (the canonical identity key).

**Rationale**: The correction here is fixing what's most likely a typo or an
outdated/unreachable number *for this specific delivery attempt* — it is not evidence that
the customer's real phone number has permanently changed for their canonical identity
record. Propagating it to `customers.phone` risks silently merging or splitting customer
identities (e.g., if the "corrected" number actually belongs to someone else, or the
original number was in fact correct and just temporarily unreachable).

**Alternatives considered**:
- **Also update `customers.phone`** — rejected: a much bigger, riskier side effect
  (identity re-keying) than this narrow escalation flow should trigger; spec.md doesn't
  ask for this and it isn't implied by "correct a ticket's customer phone number."

## 4. When the completion notification fires (interpretation of FR-001)

**Decision**: The completion WhatsApp message sends only on a ticket's **first**
transition into "Completed" — determined the same way `004-parts-services-catalogue`
determines its bill lock: `status_history` contained no prior `to_status = 'completed'`
row before this one. If a ticket is later moved backward and re-reaches "Completed" (per
`003-ticket-lifecycle`'s backward-transition rule), no second completion message is sent.

**Rationale**: spec.md's FR-001 says "when the ticket transitions to Completed" without
addressing repeat transitions. Since `004`'s bill locks permanently at first Completed
(FR-015 there), the bill total in a repeat completion message would always be identical to
the first — re-sending it adds no information and risks confusing the customer (a second
"your machine is ready" message after they may already be aware, or already collected it
in the meantime via a corrected process). This mirrors an existing precedent in this
project (the bill lock) for the same "first Completed is the meaningful event" reasoning.

**This is a plan-level interpretation, not explicit in spec.md** — flagged here and in the
Completion Report for visibility. If the business actually wants a fresh notification on
every re-completion (e.g., because the bill *could* change through some future correction
mechanism), this should go back through `/speckit-clarify` on spec.md rather than being
silently assumed.

**Alternatives considered**:
- **Send on every transition into Completed** — rejected as the default per the reasoning
  above, but not unreasonable; flagged rather than silently decided either way.

## 5. Meta WhatsApp Business Cloud API: message template approval

**Finding** (not a discretionary decision — a real constraint on how User Story 6 can
work): Meta's Cloud API requires **business-initiated** messages (i.e., any message sent
outside a 24-hour window since the customer last messaged the business — which is the
normal case for both the completion notification and the OTP) to use a **pre-approved
message template**. Templates are submitted to Meta with named parameters (e.g.,
`{{1}}`, `{{2}}`) and structure, and Meta's review can take anywhere from minutes to
around a day. Free-text business-initiated messages are rejected by the API outright.

**Decision**: `message_templates` in this system stores the **mapping from this project's
named placeholders (customer_name, ticket_id, etc.) to Meta template parameter positions**,
not arbitrary free text that goes straight to customers. "Editing template wording" (FR-016)
in v1 means:
1. Editing the human-readable copy stored in our system (used for the in-app test-send
   preview and for record-keeping), and
2. Submitting that same wording to Meta for template approval via their API/Business
   Manager, which is **not instant**.

Until a newly-edited template is Meta-approved, the system continues sending the
previously-approved version. This is surfaced explicitly in the template editor UI and in
`quickstart.md` — "new wording used for subsequently sent messages" (spec.md's Acceptance
Scenario US6.1) is true once Meta approval completes, not the instant the Super Admin
clicks save.

**Rationale**: This is a hard external constraint, not an implementation preference — the
Cloud API will simply reject an attempt to send an unapproved free-text template message
outside the 24-hour window. Modeling "edit → approve → active" as the real flow (rather
than pretending edits go live instantly) avoids building something that breaks the first
time it's used against the real API.

**Alternatives considered**:
- **Treat template editing as instant free-text, discover the constraint at
  integration-test time against a sandbox** — rejected: this is a known, documented Cloud
  API behavior; better to design for it now than discover it during `/speckit-implement`.
- **Session/service-window messaging only (no templates)** — rejected: only works within
  24 hours of the customer's own last message, which doesn't fit a proactively-triggered
  completion notification or delivery OTP at an arbitrary time.

## 6. Placeholder substitution and validation

**Decision**: A small, explicit substitution function (regex-extract `{{token}}`, look up
against a fixed allow-list of supported tokens) rather than a general templating engine
(Handlebars, Mustache, etc.).

**Rationale**: FR-017 names exactly six supported placeholders; FR-019 requires rejecting
an unsupported one at save time. A fixed allow-list check is simpler, safer (no risk of a
templating engine's own expression syntax being (mis)used), and fully sufficient —
pulling in a general templating library for six known tokens would be YAGNI.

**Alternatives considered**:
- **Handlebars/Mustache** — rejected per Simplicity & YAGNI: more capability than six
  fixed placeholders need, and a larger dependency/attack surface for template content
  that (per §5 above) has to go through Meta's own approval anyway.

## 7. Failed-notification and OTP-lockout alert surfacing

**Decision**: No new real-time push mechanism. A failed notification needing manual
confirmation (FR-004) or a ticket in an OTP lockout/timeout state needing Admin/Super
Admin override is a **derived query** surfaced wherever `006-dashboard-reporting`'s board
or a ticket's detail view already polls (its existing 30-second refresh cycle).

**Rationale**: SC-002 requires surfacing within 30 seconds — exactly matching
`006-dashboard-reporting`'s existing poll interval, so no new infrastructure (websockets,
SSE) is needed to hit that target.

**Alternatives considered**:
- **WebSocket/SSE push for instant alerting** — rejected: SC-002's 30-second bar is
  already met by the existing poll cycle; building push infrastructure for a tighter
  latency nobody asked for would violate Simplicity & YAGNI.
