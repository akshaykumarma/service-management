# Feature Specification: Ticket Intake, History Lookup & Status Lifecycle

**Feature Branch**: `003-ticket-lifecycle`

**Created**: 2026-09-18

**Status**: Draft

**Input**: User description: "PRD §6.2 Ticket Creation & Intake (customer name, primary/alternate phone, machine model number via searchable dropdown with free-type fallback, issue description, optional estimated pickup date, up to 5 intake photos; ticket ID format SVC-{YYYY}-{5-digit store+year-scoped sequence}, immutable; initial state Open), §6.3 Service History Lookup (query all prior closed tickets for the same machine model number on save; Admin/Super Admin see history across all stores, Store Service Manager sees only their own store's history), and §6.4 Ticket Status Workflow (Open → In Progress → On Hold → Completed → Delivered, plus Cancelled; role-restricted transitions; mandatory reason comments for On Hold, Cancelled, and any backward transition; Cancelled tickets hidden from the active board but retrievable)."

## Clarifications

### Session 2026-09-20

- Q: Should "Delivered" be a true terminal status, or stay subject to the same backward-transition-with-comment rule as every other status? → A: Backward transition out of Delivered stays allowed, but is restricted to Admin/Super Admin (not Store Service Manager), in addition to the existing mandatory comment.
- Q: When two staff members change the same ticket's status at nearly the same moment, what happens to the second, conflicting change? → A: Last write wins — the second change becomes the ticket's current status, and both transitions are recorded in the status history.
- Q: Should a customer be tracked as a distinct, reusable record, or is customer identity purely free-text embedded per ticket? → A: Customer identity is keyed by primary phone number — the system reuses/updates a customer record by phone across tickets, but intake still just asks for name/phone every time (no separate lookup step).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ticket Intake with Model-Based History Lookup (Priority: P1)

A Store Service Manager (or an Admin/Super Admin creating on a store's behalf) records a new service job: customer name, phone number(s), machine model, issue description, and optionally an estimated pickup date and up to 5 intake photos. As soon as it's saved, the system shows any prior service history for machines of that same model, scoped to what the creator's role is allowed to see.

**Why this priority**: This is the entry point of the entire ticket lifecycle — nothing else (status changes, parts, notifications, delivery) can happen without a ticket existing first.

**Independent Test**: Create a ticket for a model with no prior history (shows "no history" state) and for a model with prior closed tickets (shows them), and verify a Store Service Manager only sees same-store history while an Admin/Super Admin sees history across stores.

**Acceptance Scenarios**:

1. **Given** a machine model with no prior closed tickets anywhere, **When** a ticket is created for that model, **Then** the ticket enters status "Open" with a system-generated, immutable ticket ID, and its history panel clearly states there are no previous service records.
2. **Given** a machine model with prior closed tickets at the creating user's own store, **When** a Store Service Manager creates a new ticket for that model, **Then** those same-store prior tickets are shown.
3. **Given** a machine model with prior closed tickets at a different store than the creator's, **When** a Store Service Manager creates a new ticket for that model, **Then** those other-store tickets are NOT shown to them, but WOULD be shown to an Admin or Super Admin creating the same ticket.
4. **Given** the intake form, **When** required fields (customer name, primary phone, machine model, issue description) are missing, **Then** the system rejects the submission and indicates what's missing.
5. **Given** a ticket being created, **When** the creator attaches intake photos, **Then** up to 5 images are accepted and stored against the ticket; a 6th is rejected.

---

### User Story 2 - Status Lifecycle Management (Priority: P2)

Once a ticket exists, a Service Manager or Admin moves it forward through its lifecycle — Open → In Progress → Completed → Delivered — as work actually happens on the machine. Moving a ticket backward (e.g., Completed back to In Progress, to fix a mistake) is allowed but requires an explanation.

**Why this priority**: This is the core progress-tracking mechanism the whole platform is built around, but it depends on a ticket already existing (Story 1).

**Independent Test**: Given an existing "Open" ticket, move it through each forward status and confirm each transition is recorded with who/when; attempt a backward transition and confirm it requires a comment.

**Acceptance Scenarios**:

1. **Given** an "Open" ticket, **When** a Service Manager marks it "In Progress," **Then** the status updates and the change is timestamped and attributed to that Service Manager.
2. **Given** a ticket in any status, **When** a Service Manager or Admin moves it to an earlier status in the sequence (e.g., Completed → In Progress), **Then** the system requires a comment explaining why before accepting the change.
3. **Given** a ticket status change, **When** it is saved, **Then** it is added to that ticket's permanent, ordered status history (from-status, to-status, who, when, comment if any).
4. **Given** a Store Service Manager, **When** they attempt to change the status of a ticket at a store they're not assigned to, **Then** the change is denied (per `002-auth-rbac`).
5. **Given** a "Delivered" ticket, **When** a Store Service Manager attempts to move it backward to any earlier status, **Then** the system denies it regardless of whether a comment is provided; only an Admin or Super Admin may perform that specific transition, still with a mandatory comment.

---

### User Story 3 - Mandatory-Reason Holds & Cancellations (Priority: P3)

When work can't continue (waiting on a part, waiting on the customer), a Service Manager or Admin puts the ticket "On Hold" with a reason. If a job needs to be abandoned entirely (customer withdraws, duplicate entry), only an Admin or Super Admin can cancel it, also with a mandatory reason. Cancelled tickets disappear from the everyday working view but remain retrievable.

**Why this priority**: These are necessary escape hatches for real-world exceptions, but they're less central than the core forward-progress flow (Story 2) and can be added once that exists.

**Independent Test**: Put a ticket "On Hold" without a reason (rejected) and with a reason (accepted); cancel a ticket as a Service Manager (denied) and as an Admin (accepted, hidden from the active board but still retrievable).

**Acceptance Scenarios**:

1. **Given** an "In Progress" ticket, **When** a Service Manager attempts to set it "On Hold" without providing a reason, **Then** the system rejects the change.
2. **Given** the same ticket, **When** they provide a reason, **Then** it moves to "On Hold" with that reason recorded.
3. **Given** any non-terminal ticket, **When** a Store Service Manager (not Admin/Super Admin) attempts to cancel it, **Then** the system denies the action.
4. **Given** the same ticket, **When** an Admin cancels it with a reason, **Then** it moves to "Cancelled," disappears from the default active-tickets view, and remains fully retrievable via an "all tickets" view.

---

### Edge Cases

- What happens when the same machine model is serviced at a different store than before? History lookup results differ by viewer role (see User Story 1, Scenario 3) — this is intentional, not a bug.
- What happens when a customer's machine model isn't in the model dropdown? Intake MUST accept a free-typed model value as a fallback so intake is never blocked by an incomplete model list.
- What happens if two tickets are created for the same store in the same second? Ticket ID generation MUST still produce a unique, sequential ID per store per year with no collisions.
- What happens when a ticket needs to skip a status (e.g., Open directly to Completed)? Out of scope for this spec unless the source PRD's transition table allows it — see Assumptions.
- What happens when a Cancelled ticket needs to be reactivated? Not supported in v1; a new ticket must be created instead (see Assumptions).
- What happens when a "Delivered" ticket needs to be moved backward (e.g., correcting a mistaken OTP confirmation)? Only an Admin or Super Admin may perform this transition, on top of the standard mandatory-comment requirement for backward transitions — a Store Service Manager cannot do this even with a comment (see FR-018).
- What happens when two staff members change the same ticket's status at nearly the same moment (e.g., via the live-refreshing board)? The second change to reach the system wins and becomes the ticket's current status; the first change is not silently discarded from history — both are recorded as separate entries in the ticket's status history (see FR-019).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST require customer name, primary phone number, machine model, and issue description to create a ticket, and MUST reject submissions missing any of them.
- **FR-002**: System MUST accept an optional alternate phone number and an optional estimated pickup date on intake.
- **FR-003**: System MUST allow selecting a machine model from a searchable list, with a free-text fallback when the model isn't listed.
- **FR-004**: System MUST accept up to 5 intake photos per ticket and MUST reject additional photos beyond that limit.
- **FR-005**: System MUST generate a unique, immutable ticket identifier for every ticket, scoped per store and per calendar year, at the time of creation.
- **FR-006**: System MUST set a newly created ticket's status to "Open" automatically and MUST record the creating store, staff member, and timestamp immutably.
- **FR-007**: Upon ticket creation, system MUST look up prior tickets for the same machine model that have reached a closed status (Completed or Delivered).
- **FR-008**: System MUST scope machine-model history results to the viewer's role: a Store Service Manager sees only their own store's matching history; an Admin or Super Admin sees matching history across all stores.
- **FR-009**: If no prior history exists within what the viewer's role can see, system MUST clearly state that rather than showing a blank or ambiguous panel.
- **FR-010**: System MUST support the ticket status sequence Open → In Progress → On Hold → Completed → Delivered, plus a Cancelled status reachable from any non-terminal status.
- **FR-011**: System MUST allow a Service Manager or Admin to move a ticket forward through the status sequence.
- **FR-012**: System MUST require a mandatory reason/comment whenever a ticket is set to "On Hold."
- **FR-013**: System MUST require a mandatory reason/comment whenever a ticket moves to a status earlier in the sequence than its current one.
- **FR-014**: System MUST restrict the "Cancelled" transition to Admin and Super Admin roles only, and MUST require a mandatory reason.
- **FR-015**: System MUST record every status change as an immutable, ordered entry (from-status, to-status, actor, timestamp, comment if provided) on the ticket.
- **FR-016**: System MUST exclude Cancelled tickets from the default active-tickets view while keeping them retrievable through an explicit "all tickets" view or filter.
- **FR-017**: System MUST enforce that only staff assigned to a ticket's store (or Admin/Super Admin per their scope) can change that ticket's status, consistent with `002-auth-rbac`.
- **FR-018**: System MUST restrict any backward transition out of "Delivered" status to Admin and Super Admin roles, in addition to the mandatory comment already required for backward transitions (FR-013); a Store Service Manager MUST NOT be permitted to perform this specific transition even with a comment.
- **FR-019**: When two status changes are submitted for the same ticket in close succession, system MUST apply the one that reaches the system second as the ticket's current status (last write wins), and MUST record both as separate entries in the ticket's status history rather than discarding either.
- **FR-020**: System MUST resolve a ticket's customer by primary phone number at intake: if a customer record for that phone number already exists, this ticket MUST be linked to it and that record's stored name MUST be updated to the value entered on this ticket; otherwise, system MUST create a new customer record with the provided name and phone number.

### Key Entities *(include if feature involves data)*

- **Service Ticket**: The core job record — store, customer name and phone number(s) as entered at intake, machine model, issue description, optional estimated pickup date, current status, immutable ticket ID, creator and creation timestamp.
- **Customer**: A cross-ticket identity keyed by primary phone number, holding that customer's most recently provided name; distinct from the name/phone recorded on any individual historical ticket, which reflects what was entered at that ticket's intake time.
- **Intake Photo**: An image (up to 5 per ticket) attached at intake depicting the machine's condition.
- **Status History Entry**: An immutable record of one status transition on a ticket — from-status, to-status, actor, timestamp, and an optional/mandatory comment depending on the transition type.
- **Machine Model** *(reference)*: The model identifier selected or free-typed at intake; full catalogue maintenance is covered in `007-admin-console`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Service Manager can complete ticket intake (all required fields) in under 2 minutes.
- **SC-002**: Looking up a machine model's service history takes under 30 seconds and requires no manual searching outside the ticket-creation flow.
- **SC-003**: 100% of tickets have a system-generated, unique ticket ID with zero collisions observed.
- **SC-004**: 100% of "On Hold" and "Cancelled" transitions carry a recorded reason; zero occur without one.
- **SC-005**: 100% of status changes are traceable to a specific staff member and timestamp.
- **SC-006**: Cancelled tickets never appear in the default active view — 0% leakage — while remaining 100% retrievable via the all-tickets view.
- **SC-007**: 0% of backward transitions out of "Delivered" status are ever performed by a Store Service Manager; 100% are performed by an Admin or Super Admin with a recorded reason.
- **SC-008**: When two status changes are submitted for the same ticket in close succession, 100% of the time both are preserved in the status history and the ticket's current status matches whichever change was received second — zero silently lost transitions.

## Assumptions

- "Closed" tickets for history-lookup purposes (FR-007) means tickets that reached Completed or Delivered; Cancelled tickets (no service actually performed) are excluded from history results.
- The status sequence does not support skipping directly from Open to Completed/Delivered in v1; each ticket progresses through the defined sequence (forward or, with a comment, backward).
- A Cancelled ticket cannot be reactivated; a new ticket must be created if service is later needed.
- Ticket ID format and generation mechanics (e.g., exact numbering scheme) are a business-visible identifier requirement here; the underlying implementation (e.g., database sequence) is a technical decision for `/speckit-plan`.
- Intake photo storage mechanics (where/how images are stored) are a technical decision deferred to `/speckit-plan`; this spec only requires that up to 5 photos can be attached and later viewed.
- Customer identity is keyed by primary phone number only; if a phone number is later reused by a different person (e.g., reassigned by the carrier) or shared across a household, the system has no way to distinguish them and will treat them as the same customer record. This is an accepted limitation for v1, not a defect.
