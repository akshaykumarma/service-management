# Feature Specification: Customer WhatsApp Notifications & OTP Delivery Verification

**Feature Branch**: `005-customer-notifications`

**Created**: 2026-09-18

**Status**: Draft

**Input**: User description: "PRD §6.6 Customer Notifications (automatic WhatsApp message to the customer's primary number when a ticket is marked Completed, containing customer name/ticket ID/machine model/bill total/store name/store contact; delivery status Sent/Delivered/Failed logged with timestamp; failed delivery raises an in-app alert requiring the Service Manager to confirm they notified the customer another way; Super Admin manages message templates with placeholders and a test-send function) and §6.7 OTP-Based Delivery Verification (mandatory 6-digit OTP sent via WhatsApp when delivery is initiated, valid 10 minutes, one resend after a 60-second cooldown, 3 failed attempts locks entry and requires Admin/Super Admin override, successful verification transitions the ticket to Delivered with an immutable record)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatic Completion Notification (Priority: P1)

The moment a Service Manager marks a ticket "Completed," the customer automatically receives a WhatsApp message with their bill details — no phone call needed.

**Why this priority**: This is the platform's primary answer to the "unnecessary follow-up calls" business problem (see `001-overview`) and the most frequent notification event.

**Independent Test**: Mark a ticket "Completed" and confirm a WhatsApp message is generated containing the expected bill details, without any manual action beyond the status change.

**Acceptance Scenarios**:

1. **Given** a ticket with a calculated bill, **When** it is marked "Completed," **Then** the customer's primary phone number receives a WhatsApp message containing customer name, ticket ID, machine model, total bill amount, store name, and store contact number.
2. **Given** the message was sent, **When** its delivery outcome becomes known, **Then** the ticket's notification log records the outcome (Sent, Delivered, or Failed) with a timestamp.

---

### User Story 2 - Notification Failure Handling (Priority: P2)

If the automatic WhatsApp message fails to reach the customer, the Service Manager is alerted in-app and must confirm they've notified the customer some other way, so no customer is silently left uninformed.

**Why this priority**: Ensures the automation's failure mode doesn't quietly regress to the old "customer never finds out" problem; depends on Story 1's send attempt happening first.

**Independent Test**: Simulate a failed notification and confirm the Service Manager sees an in-app alert that isn't dismissible until they confirm manual follow-up.

**Acceptance Scenarios**:

1. **Given** a completion message fails to deliver, **When** the failure is detected, **Then** the assigned Service Manager receives an in-app alert.
2. **Given** that alert, **When** the Service Manager has not yet confirmed they notified the customer another way, **Then** the alert remains outstanding/visible.
3. **Given** the Service Manager confirms manual notification, **When** they submit that confirmation, **Then** the alert is cleared and the confirmation is recorded on the ticket.

---

### User Story 3 - Mandatory OTP-Verified Delivery (Priority: P3)

When the customer arrives to collect their machine, the Service Manager initiates delivery, the system sends a one-time code to the customer via WhatsApp, and the Service Manager enters the code the customer reads out to confirm the handoff. The ticket only becomes "Delivered" once the code is verified.

**Why this priority**: This is the platform's core answer to the "informal, disputed delivery" business problem (see `001-overview`), and the single mandatory gate on the ticket lifecycle's final transition.

**Independent Test**: On a "Completed" ticket, initiate delivery, verify the correct code transitions it to "Delivered," and verify an incorrect or expired code does not.

**Acceptance Scenarios**:

1. **Given** a "Completed" ticket, **When** the Service Manager initiates "Deliver Machine," **Then** a 6-digit one-time code is sent via WhatsApp to the customer's primary number, valid for 10 minutes.
2. **Given** an active code, **When** the Service Manager enters the correct code, **Then** the ticket transitions to "Delivered" and an immutable record captures the delivery timestamp and the verifying staff member.
3. **Given** an active code, **When** the Service Manager enters an incorrect code, **Then** the ticket does not transition and the attempt is counted.
4. **Given** a code older than 10 minutes, **When** it is entered, **Then** it is rejected as expired.
5. **Given** an expired or unreceived code, **When** the Service Manager requests a resend, **Then** a new code is sent after a 60-second cooldown and the previous code is invalidated; only one resend is available per delivery attempt.
6. **Given** no successful code entry has occurred, **When** any other means is attempted to mark the ticket "Delivered," **Then** the system refuses — there is no way to bypass OTP verification.

---

### User Story 4 - OTP Lockout & Admin Override (Priority: P4)

After 3 failed code attempts, entry locks to prevent guessing, and only an Admin or Super Admin can clear the lock to let delivery verification proceed.

**Why this priority**: A necessary safeguard against brute-forcing the delivery code, but only relevant in the exceptional case where Story 3's normal path repeatedly fails.

**Independent Test**: Enter 3 wrong codes in a row and confirm entry locks for the Service Manager, then confirm an Admin/Super Admin can override and unlock it.

**Acceptance Scenarios**:

1. **Given** 2 prior failed attempts on the current code, **When** a 3rd incorrect code is entered, **Then** OTP entry locks for that ticket.
2. **Given** a locked ticket, **When** the assigned Service Manager attempts to enter another code, **Then** the system refuses until an override occurs.
3. **Given** a locked ticket, **When** an Admin or Super Admin overrides the lock, **Then** OTP entry becomes available again (e.g., via a fresh code).

---

### User Story 5 - Message Template Management (Priority: P5)

The Super Admin can edit the wording of the completion and OTP WhatsApp messages using placeholders for ticket-specific details, and can send a test message to a chosen phone number before making a template live.

**Why this priority**: Necessary for the business to keep messaging accurate and on-brand over time, but it's an occasional admin task rather than a per-ticket action, and the system can launch with sensible default templates.

**Independent Test**: As Super Admin, edit a template's wording, send a test message to a known number, and confirm the placeholders resolve correctly before activating the change.

**Acceptance Scenarios**:

1. **Given** the notification template screen, **When** a Super Admin edits the completion or OTP message template, **Then** the new wording is used for subsequently sent messages of that type.
2. **Given** a template using supported placeholders (customer name, ticket ID, machine model, bill total, store name, store phone), **When** a message is sent, **Then** each placeholder is replaced with the correct ticket-specific value.
3. **Given** an edited template, **When** the Super Admin sends a test message to a specified phone number, **Then** they can verify its rendered content before it goes live for real customers.

---

### Edge Cases

- What happens if the customer's phone number is invalid or unreachable at all (not just a delivery failure)? It MUST still be treated as a failed notification requiring the Service Manager's manual-follow-up confirmation (see User Story 2).
- What happens if a Service Manager tries to initiate a second delivery/OTP attempt while one is already active and unexpired? The system MUST reuse or explicitly invalidate the existing attempt rather than issuing conflicting codes.
- What happens if the OTP lock is triggered but the ticket is later reassigned to a different Service Manager? The lock and its override requirement persist with the ticket, not with the staff member.
- What happens to a message template edit that has a malformed/unsupported placeholder? The system MUST reject saving it rather than sending a broken message to a customer later.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST automatically send a WhatsApp message to a ticket's customer's primary phone number when the ticket transitions to "Completed."
- **FR-002**: System MUST include customer name, ticket ID, machine model, total bill amount, store name, and store contact number in the completion message.
- **FR-003**: System MUST record each notification's delivery outcome (Sent, Delivered, or Failed) with a timestamp against the ticket.
- **FR-004**: System MUST raise an in-app alert to the ticket's Service Manager when a completion notification fails to deliver.
- **FR-005**: System MUST require the Service Manager to explicitly confirm they've notified the customer by another means before a failed-notification alert is cleared.
- **FR-006**: System MUST allow a Service Manager to initiate delivery verification only on a ticket that has reached "Completed."
- **FR-007**: System MUST send a 6-digit one-time code via WhatsApp to the customer's primary phone number when delivery verification is initiated.
- **FR-008**: System MUST treat a one-time code as valid for 10 minutes from issuance.
- **FR-009**: System MUST allow exactly one resend of a one-time code per delivery attempt, gated by a 60-second cooldown, and MUST invalidate the prior code upon resend.
- **FR-010**: System MUST transition a ticket to "Delivered" only upon entry of the currently valid, unexpired one-time code.
- **FR-011**: System MUST reject an expired or incorrect code without transitioning the ticket.
- **FR-012**: System MUST count failed code-entry attempts per delivery attempt and lock further entry after 3 consecutive failures.
- **FR-013**: System MUST restrict clearing an OTP lock to Admin and Super Admin roles.
- **FR-014**: System MUST record, for a successful delivery verification, the timestamp and the verifying staff member, immutably.
- **FR-015**: System MUST provide no path to mark a ticket "Delivered" other than a successful code verification.
- **FR-016**: System MUST allow the Super Admin to edit the wording of the completion and OTP message templates.
- **FR-017**: System MUST support at minimum the placeholders: customer name, ticket ID, machine model, bill total, store name, and store phone number in templates, resolving each to the correct per-ticket value when a message is sent.
- **FR-018**: System MUST allow the Super Admin to send a test message using a given template to a specified phone number before activating a template change.
- **FR-019**: System MUST reject a template edit containing a placeholder it does not support.

### Key Entities *(include if feature involves data)*

- **Notification**: A record of one outbound customer message — type (completion or OTP), channel, recipient, rendered content, delivery status, and timestamps — linked to a ticket.
- **OTP Verification**: A one-time code issued for a ticket's delivery — code, issuance/expiry timestamps, number of failed attempts, lock state, and successful-verification record if applicable.
- **Message Template**: Editable wording (with supported placeholders) for the completion and OTP message types, maintained by the Super Admin.
- **Manual Notification Confirmation**: A record that a Service Manager confirmed notifying a customer by another means after an automated notification failed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of tickets marked "Completed" trigger a WhatsApp notification attempt within 2 minutes of the status change.
- **SC-002**: A failed notification surfaces an in-app alert to the responsible Service Manager within 30 seconds of the failure being known.
- **SC-003**: 0% of tickets are ever marked "Delivered" without a successful, unexpired OTP verification.
- **SC-004**: 100% of successful deliveries have an immutable record of who verified them and when.
- **SC-005**: A Super Admin can update a message template and confirm its correctness via test-send without needing developer involvement.

## Assumptions

- WhatsApp is the sole notification channel for both completion messages and OTP delivery (per source PRD, confirmed decision OQ-01); no SMS or email fallback channel is required in v1.
- "Delivered" (WhatsApp delivery receipt) vs. "Sent" vs. "Failed" are the three notification outcomes tracked; finer-grained provider-specific statuses are a technical concern for `/speckit-plan`.
- The specific WhatsApp messaging provider/integration mechanics (API credentials, webhook handling) are a technical decision deferred to `/speckit-plan`; this spec only requires the business-visible behavior described above.
- An OTP lock, once cleared by Admin/Super Admin override, requires a fresh code to be issued rather than reusing the locked-out one.
