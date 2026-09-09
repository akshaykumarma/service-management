# Feature Specification: Service Ticket Management Platform

**Feature Branch**: `001-service-ticket-management`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "Service Management Website — Feature Requirements: (1) Ticket Creation capturing customer name, phone number(s), machine model number, and issue description, generating a service ticket. (2) Service History Lookup — on ticket creation, fetch and display any previous service history for that machine, if available. (3) Ticket Status — Work in Progress, updated by the service manager when work begins. (4) Parts & Service Selection — service manager selects parts used and/or services performed and updates these against the ticket. (5) Service Completion Notification — SMS/WhatsApp message sent to the customer with bill details once service is complete. (6) Delivery Verification (OTP) — OTP sent to the customer at delivery time to verify and confirm service delivery. (7) Super Admin Maintenance Page — Super Admin manages parts and service costs, and machine model numbers. (8) Data Access & Hierarchy — tickets are created and maintained at the store level; Super Admin has visibility into data across all stores."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ticket Intake with Machine History Lookup (Priority: P1)

A Service Manager at a store receives a machine for service. They record the customer's name, phone number(s), the machine's model and identifying details, and the reported issue. As soon as the ticket is created, the system shows any prior service history for that exact machine, if the machine has been serviced before (at this store or another), so the Service Manager has context before starting work.

**Why this priority**: This is the entry point to the entire workflow — no ticket exists, and no downstream step (status updates, parts, notifications, delivery) can happen without it. It is also independently valuable on its own: even a store that only ever looked up history and logged intake would get value from this.

**Independent Test**: Can be fully tested by creating a ticket for a machine with no prior history (shows "no history" state) and for a machine with prior tickets (shows the prior records), without any other feature existing yet.

**Acceptance Scenarios**:

1. **Given** a machine that has never been serviced before, **When** a Service Manager creates a ticket with customer name, phone number, machine model, machine identification number, and issue description, **Then** a new ticket is created with status "New" and the history section clearly shows no prior service records.
2. **Given** a machine with two prior completed tickets at any store, **When** a Service Manager creates a new ticket for that same machine (matched by its unique machine identifier, not model number alone), **Then** both prior tickets are displayed to the Service Manager before they begin work.
3. **Given** a ticket creation form, **When** the Service Manager submits it without a required field (e.g., no phone number, no issue description), **Then** the system rejects the submission and indicates which fields are missing.

---

### User Story 2 - Store-Scoped Ticket Access & Admin Oversight (Priority: P2)

A Service Manager only ever sees and acts on tickets created at their own store. A Super Admin can see and search tickets across every store, for oversight and reporting.

**Why this priority**: This access boundary is foundational to trust in the system — once tickets exist, staff must not be able to see or modify another store's data. It's independently testable with seeded ticket data, ahead of the full intake or lifecycle UI being complete.

**Independent Test**: Seed tickets across two stores; verify a Service Manager logged into Store A sees only Store A's tickets, and a Super Admin sees tickets from both.

**Acceptance Scenarios**:

1. **Given** tickets exist at Store A and Store B, **When** a Service Manager assigned to Store A views the ticket list, **Then** only Store A's tickets are shown.
2. **Given** the same data, **When** a Super Admin views the ticket list, **Then** tickets from both Store A and Store B are shown.
3. **Given** a Service Manager assigned to Store A, **When** they attempt to open or modify a ticket belonging to Store B directly, **Then** the system denies access.

---

### User Story 3 - Parts, Service & Machine Model Catalog Maintenance (Priority: P3)

A Super Admin maintains the shared catalog of parts and services (with current cost) and the list of valid machine model numbers, from a maintenance page. This catalog is what Service Managers draw from when working a ticket.

**Why this priority**: Store-level ticket work (applying parts/services, recording a machine model) depends on this catalog existing, but the catalog itself is a self-contained admin capability that can be built and tested before any ticket touches it.

**Independent Test**: Can be tested by a Super Admin creating, updating, and deactivating a part/service and a machine model, and confirming those changes are reflected wherever the catalog is read from — independent of any specific ticket.

**Acceptance Scenarios**:

1. **Given** the maintenance page, **When** a Super Admin adds a new part with a cost, **Then** it becomes available for Service Managers to select on tickets.
2. **Given** an existing part's cost, **When** a Super Admin updates that cost, **Then** new selections use the updated cost while tickets that already applied the old cost are unaffected (see User Story 4, Acceptance Scenario 3).
3. **Given** a part or machine model that is no longer offered, **When** a Super Admin deactivates it, **Then** it no longer appears as selectable for new tickets but remains visible on historical tickets that already reference it.

---

### User Story 4 - Work-in-Progress Status & Parts/Service Application (Priority: P4)

Once a Service Manager begins work on a ticket, they mark it "Work in Progress." As work proceeds, they select the parts used and/or services performed from the catalog and apply them to the ticket, building up a bill.

**Why this priority**: This is the core value-delivery step of the workflow, but it depends on a ticket already existing (Story 1) and a catalog to select from (Story 3).

**Independent Test**: Given an existing "New" ticket and a populated catalog, can be tested by moving the ticket to "Work in Progress," applying two catalog items, and confirming the ticket's bill total reflects them.

**Acceptance Scenarios**:

1. **Given** a ticket with status "New," **When** the Service Manager marks it "Work in Progress," **Then** the ticket's status updates and the change is timestamped and attributed to that Service Manager.
2. **Given** a ticket in "Work in Progress," **When** the Service Manager applies a part and a service from the catalog, **Then** the ticket's bill reflects both line items and their combined cost.
3. **Given** a part already applied to a ticket at its original cost, **When** the Super Admin later changes that part's catalog cost, **Then** the ticket's existing line item still shows the original cost it was applied at.

---

### User Story 5 - Service Completion Notification (Priority: P5)

Once all parts/services are applied and work is finished, the Service Manager marks the ticket "Completed." The customer automatically receives an SMS and/or WhatsApp message with the bill details.

**Why this priority**: This depends on a completed bill existing (Story 4) but is otherwise a self-contained, independently observable action (a message going out) with clear success/failure to test.

**Independent Test**: Given a ticket with applied parts/services, mark it "Completed" and verify a notification is generated with the correct bill details, including the case where the notification fails to send.

**Acceptance Scenarios**:

1. **Given** a "Work in Progress" ticket with parts/services applied, **When** the Service Manager marks it "Completed," **Then** the system sends the customer a notification containing an itemized bill.
2. **Given** a notification that fails to send (e.g., invalid number), **When** the failure occurs, **Then** the ticket still reflects "Completed" status and the Service Manager can see that the notification failed.

---

### User Story 6 - Delivery Verification via OTP (Priority: P6)

When the customer arrives to collect the machine, the system sends them an OTP. The Service Manager enters the OTP the customer provides to confirm and record delivery, closing out the ticket.

**Why this priority**: This is the final step of the ticket lifecycle and depends on the ticket already being "Completed" (Story 5).

**Independent Test**: Given a "Completed" ticket, trigger an OTP send, then test both a correct-code path (ticket becomes "Delivered") and an incorrect/expired-code path (ticket is not marked delivered).

**Acceptance Scenarios**:

1. **Given** a "Completed" ticket, **When** the Service Manager initiates delivery, **Then** an OTP is sent to the customer.
2. **Given** an OTP has been sent, **When** the Service Manager enters the correct code, **Then** the ticket transitions to "Delivered" and the confirmation is timestamped and attributed to that Service Manager.
3. **Given** an OTP has been sent, **When** the Service Manager enters an incorrect or expired code, **Then** the ticket is not marked "Delivered" and an error is shown.
4. **Given** an expired OTP, **When** the Service Manager requests a new one, **Then** a fresh OTP is sent and the previous one is invalidated.

---

### Edge Cases

- What happens when a customer has no prior service history for a machine? The history section MUST show a clear "no prior history" state rather than an error or an empty/ambiguous screen (see User Story 1).
- What happens when the same machine is serviced at a different store than before? History lookup MUST still surface prior records regardless of which store performed them (see User Story 1).
- What happens when a completion notification (SMS/WhatsApp) fails to send? The ticket MUST remain "Completed" and the failure MUST be visible to the Service Manager for manual follow-up (see User Story 5).
- What happens when an OTP expires before the customer confirms delivery? The Service Manager MUST be able to trigger a resend; the ticket MUST NOT be marked "Delivered" on an expired or mismatched code (see User Story 6).
- What happens when a ticket needs to be abandoned before completion (e.g., customer withdraws the machine, or it's a duplicate entry)? The system MUST support cancelling a ticket that is "New" or "Work in Progress," recording a reason.
- What happens when a Super Admin deactivates a part, service, or machine model that is already referenced by existing tickets? Historical tickets MUST continue to display the original reference; only new selections are blocked (see User Story 3).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a Service Manager to create a new service ticket capturing customer name, one or more phone numbers, machine model, a unique machine identifier, and issue description.
- **FR-002**: System MUST require customer name, at least one phone number, machine model, machine identifier, and issue description before a ticket can be created, and MUST reject incomplete submissions with a clear indication of what is missing.
- **FR-003**: Upon ticket creation, system MUST look up and display any prior service tickets recorded for the same machine, matched by its unique machine identifier, regardless of which store originally serviced it.
- **FR-004**: If no prior service history exists for a machine, system MUST clearly indicate "no prior history" rather than leaving the history section blank or showing an error.
- **FR-005**: System MUST assign every new ticket an initial status of "New" and record which store and staff member created it.
- **FR-006**: System MUST allow a Service Manager to transition a ticket's status to "Work in Progress" once work begins.
- **FR-007**: System MUST allow a Service Manager to select one or more parts and/or services from the maintained catalog and apply them to a ticket, including quantity.
- **FR-008**: System MUST calculate and display a running bill total for a ticket based on the parts/services applied to it.
- **FR-009**: System MUST lock in the cost of a part/service on a ticket at the time it is applied, so later catalog price changes do not retroactively alter existing tickets' bills.
- **FR-010**: System MUST allow a Service Manager to transition a ticket to "Completed" once parts/services have been applied and work is finished.
- **FR-011**: Upon a ticket transitioning to "Completed," system MUST send the customer a notification (SMS and/or WhatsApp) containing the itemized bill.
- **FR-012**: System MUST record whether each completion notification succeeded or failed, and MUST make failures visible to the Service Manager.
- **FR-013**: At the time of machine delivery, system MUST generate and send a one-time password (OTP) to the customer to verify delivery.
- **FR-014**: System MUST require the Service Manager to enter the OTP the customer provides and validate it before the ticket can transition to "Delivered."
- **FR-015**: System MUST prevent a ticket from being marked "Delivered" if the entered OTP does not match the one issued or has expired.
- **FR-016**: System MUST allow a Service Manager to request a new OTP if the original expires or is not received, invalidating the previous one.
- **FR-017**: System MUST allow a Service Manager to cancel a ticket that is in "New" or "Work in Progress" status, recording a reason.
- **FR-018**: System MUST allow a Super Admin to create, update, and deactivate parts and services in the shared catalog, including their current cost.
- **FR-019**: System MUST allow a Super Admin to create, update, and deactivate machine model numbers in the shared catalog.
- **FR-020**: System MUST prevent Service Managers from applying a part, service, or machine model that is not active in the Super Admin-maintained catalog to a new ticket.
- **FR-021**: System MUST scope ticket visibility so a Service Manager can only view and act on tickets created at their own store.
- **FR-022**: System MUST allow a Super Admin to view and search tickets across all stores.
- **FR-023**: System MUST record, for every ticket status change and parts/service application, which staff member made the change and when, as an append-only history.
- **FR-024**: System MUST authenticate every staff member individually before allowing ticket creation or updates; ticket-mutating actions MUST always be attributable to a specific staff member, never anonymous or shared-account.
- **FR-025**: System MUST retain a machine's full service history, across tickets and stores, for future lookups even after a ticket is completed or delivered.
- **FR-026**: System MUST allow a customer to have more than one phone number on file, with at least one designated as primary.

### Key Entities *(include if feature involves data)*

- **Customer**: Name and one or more phone numbers (one marked primary); associated with the machines and tickets they've brought in.
- **Machine**: A specific physical unit identified by a unique machine identifier, plus its model; carries its full service history across tickets and stores.
- **Service Ticket**: A single service request — links a customer, a machine, the store it was created at, an issue description, current status (New, Work in Progress, Completed, Delivered, or Cancelled), its applied parts/service line items, and a timestamped, attributed history of every status change.
- **Ticket Line Item**: A specific part or service applied to a ticket, with quantity and the cost locked in at the time it was applied.
- **Parts & Services Catalog Entry**: A part or service Super Admin makes available for selection, with its current cost and active/inactive state.
- **Machine Model**: A model number/description maintained by Super Admin, used to categorize machines at intake.
- **Store**: The location a ticket belongs to; scopes what a Service Manager can see and act on.
- **Staff Account**: An individually authenticated user with a role — Service Manager (scoped to one store) or Super Admin (all stores).
- **Notification**: A record of a completion message sent to a customer (channel, content, delivery outcome), linked to a ticket.
- **OTP Verification**: A one-time code issued for delivery confirmation on a ticket, with its expiry and whether it was successfully verified.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A Service Manager can capture a complete new ticket (customer, machine, issue) in under 2 minutes.
- **SC-002**: When a returning machine is brought in, its prior service history is visible to the Service Manager immediately upon ticket creation, with no manual searching required.
- **SC-003**: 100% of tickets marked "Completed" trigger a customer notification attempt containing bill details.
- **SC-004**: 0% of tickets are ever marked "Delivered" without a successfully matched, unexpired OTP.
- **SC-005**: Service Managers can never view or modify a ticket belonging to a store other than their own; Super Admins can view 100% of tickets across all stores.
- **SC-006**: 100% of previously applied ticket line items retain their original price after a later catalog cost update — historical bills never change retroactively.
- **SC-007**: Every ticket status change and parts/service application is traceable to a specific staff member and timestamp, with zero unattributed changes.

## Assumptions

- Each machine is uniquely identified by a machine identifier (e.g., serial/asset number) captured at intake in addition to its model number, so that service history lookup correctly distinguishes between different customers' units of the same model.
- Staff access the system through individual accounts under two roles: Service Manager (scoped to one store) and Super Admin (all stores) — no shared/anonymous logins for ticket-mutating actions, consistent with the project's audit-trail requirements.
- The ticket status lifecycle is: New → Work in Progress → Completed → Delivered, with a Cancelled state reachable from New or Work in Progress.
- Service history lookup is not restricted by store — a machine's full history is visible regardless of which store originally serviced it, since customers may visit different store locations over time.
- Completion notifications are sent via SMS and/or WhatsApp (at least one channel reaches the customer); the specific messaging provider/integration is a technical decision deferred to the planning phase.
- Delivery OTPs are single-use and time-limited; an expired OTP can be reissued by the Service Manager.
- Parts/service cost changes made by a Super Admin apply only to new selections going forward; costs already applied to a ticket are locked at the value used at that time.
- Deduplicating or merging customer records across visits (e.g., same customer entered with slightly different phone formats) is out of scope for this feature.
