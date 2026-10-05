# Feature Specification: Demo Board & Demo Tickets

**Feature Branch**: `claude/zen-shannon-4v50b8` (spec directory `008-demo-board`)

**Created**: 2026-10-05

**Status**: Implemented

**Input**: User description: "Add one more board called the Demo Board. Call the existing board
Service Board and show the new Demo Board under it. All other features same as the Service Board.
The Demo Board holds demo tickets with statuses New, Assigned, In Progress, Cancelled and
Completed. Tickets are created from the existing New Ticket option, which asks whether it is a
Service Ticket or a Demo Ticket; the service ticket flow stays as it is. Demo ticket inputs:
Customer Name, Phone Number, Model Number, Serial Number, Invoice Number, Demo Service (a
drop-down whose values are maintained in the Catalogue under a new Demo option with the same
fields as Services), Store, Received Date and Demo Date. While creating a demo ticket, show the
demo ticket history found by Invoice Number or Serial Number, and warn when this would be the
3rd demo on the same machine/serial number/invoice. When a demo ticket is assigned to a
technician, the technician receives a WhatsApp message with a short URL to the ticket."

## Clarifications & decisions

Decisions taken where the request left room, recorded so they can be revisited:

- **D1 — Separate demo entity.** Demo tickets are their own records (own table, own ticket
  numbers, own status history), not a flag on service tickets. Service-only behaviour (parts &
  billing, OTP delivery, invoice, completion WhatsApp to the customer, Reports) never sees a
  demo ticket, so the service flow is untouched (FR-001).
- **D2 — Ticket numbers.** `{STORE CODE}-DEMO-{YEAR}-{5-digit sequence}`, e.g.
  `BLP-DEMO-2026-00001`, with its own per-store/per-year counter.
- **D3 — Status workflow.** New → Assigned → In Progress → Completed, with Cancelled reachable
  from any non-terminal status. A ticket becomes **Assigned automatically when a technician is
  assigned** and returns to **New** if the technician is removed while it is still Assigned; a
  ticket cannot be moved to Assigned without a technician. Backward moves (and Cancelled) need a
  comment; Cancelled is Admin/Super Admin only and terminal — the same rules as service tickets.
- **D4 — "3rd demo" warning.** Counts existing *non-cancelled* demo tickets whose serial number
  **or** invoice number matches (case/space-insensitive). With 2 or more, the form shows a
  warning before saving; it does not block creation. Matching is limited to the stores the user
  can see, like service history.
- **D5 — Technician WhatsApp number.** Users gain an optional "WhatsApp number" (set on the Team
  page). If an assigned technician has none, the assignment still saves and the page says the
  message could not be sent.
- **D6 — Short URL.** Each demo ticket gets a random short link `/t/{code}`; opening it goes to
  the ticket (via login first if needed, returning to the ticket afterwards).
- **D7 — Board parity.** The Demo Board reuses the Service Board as-is: Board/List views, status
  tiles as filters, filters, search, drag-and-drop with the same comment prompts, 30-second
  refresh, and only the current month's terminal-success tickets (Completed) on the board.
- **D8 — Out of scope for this release.** Demo tickets in Reports/exports; WhatsApp to
  technicians for *service* ticket assignment; a customer-facing demo message.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a demo ticket from New Ticket (Priority: P1)

A Service Manager opens **New ticket**, chooses **Demo ticket**, and fills in Store, Customer
name, Phone, Model, Serial number, Invoice number, Demo service, Received date and Demo date.
Before saving, the form shows earlier demo tickets for the same serial or invoice number, and a
warning if this would be the 3rd (or later) demo. Saving creates a `…-DEMO-…` ticket in **New**.

**Why this priority**: Without demo tickets there is nothing for the Demo Board to show.

**Independent Test**: Create a demo ticket; it appears on the Demo Board under New and nowhere on
the Service Board.

**Acceptance Scenarios**:

1. **Given** the New Ticket page, **When** the user picks "Demo ticket", **Then** the demo fields
   are shown and the service fields are not; picking "Service ticket" shows today's form unchanged.
2. **Given** two earlier non-cancelled demos with serial `SN-1`, **When** the user enters `SN-1`,
   **Then** both are listed and a "this will be the 3rd demo" warning is shown; saving still works.
3. **Given** a missing required field or a Demo date before the Received date, **When** saving,
   **Then** the ticket is not created and the problem is named.

---

### User Story 2 - Work demo tickets on the Demo Board (Priority: P1)

The sidebar shows **Service Board** (the existing board, renamed) and **Demo Board** under it.
The Demo Board offers everything the Service Board does, with columns New, Assigned, In Progress,
Completed (and Cancelled when included).

**Why this priority**: The board is how demos are tracked day to day.

**Independent Test**: Drag a demo from Assigned to In Progress to Completed; status tiles filter;
List view and search work; a Technician sees only demos assigned to them.

**Acceptance Scenarios**:

1. **Given** a New demo, **When** it is dragged to Assigned without a technician, **Then** the move
   is refused with a message to assign a technician.
2. **Given** an In Progress demo, **When** it is dragged back to Assigned, **Then** a comment is
   requested, as on the Service Board.
3. **Given** a Service Manager of store A, **When** viewing the Demo Board, **Then** only store A's
   demos are shown.

---

### User Story 3 - Assign a technician and notify them on WhatsApp (Priority: P2)

On the demo ticket page, a Service Manager assigns a technician. The ticket moves to Assigned and
the technician receives a WhatsApp message with the ticket number, customer, model, demo date and
a short link to the ticket.

**Why this priority**: Technicians need to know about a demo without watching the board.

**Independent Test**: Assign a technician with a WhatsApp number; a `demo_assignment` message to
that number containing `/t/{code}` is recorded; opening the link lands on the ticket.

**Acceptance Scenarios**:

1. **Given** a New demo, **When** a technician is assigned, **Then** status becomes Assigned and one
   message is queued to the technician's WhatsApp number.
2. **Given** an assigned demo, **When** it is reassigned to a different technician, **Then** the new
   technician is messaged; re-saving the same technician sends nothing.
3. **Given** a technician without a WhatsApp number, **When** assigned, **Then** the assignment
   saves and the page states the message could not be sent.

---

### User Story 4 - Maintain Demo services in the Catalogue (Priority: P2)

Admins see a **Demo services** section in the Catalogue with the same fields and actions as
Services (name, description, price; add, edit, deactivate). Active demo services populate the
Demo service drop-down.

**Independent Test**: Add a demo service; it appears in the New Ticket demo drop-down; deactivate
it; it disappears from the drop-down while existing tickets keep its name and price.

---

### User Story 5 - View and edit a demo ticket (Priority: P3)

The demo ticket page mirrors the service ticket page layout: header, Overview (editable details,
status, technician, demo history) and Activity (status changes, edits, assignment messages).

### Edge Cases

- Demo date in the past is allowed (logging a demo already done) but not before the Received date.
- Received date cannot be in the future (same rule as service tickets).
- Deactivated demo services cannot be chosen for new tickets.
- Completed/Cancelled demo tickets' details are locked (same rule as Delivered/Cancelled service tickets).
- A short link with an unknown code returns "not found"; a user without access to the ticket's
  store gets the same "not found" as any other out-of-scope ticket.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Service tickets, their board, details page, billing, delivery, invoices,
  notifications and Reports MUST behave exactly as before.
- **FR-002**: The sidebar MUST label the existing board "Service Board" and list "Demo Board"
  directly under it, for every role that can see the Service Board.
- **FR-003**: New Ticket MUST offer a Service ticket / Demo ticket choice; Service is the default.
- **FR-004**: A demo ticket MUST capture Store, Customer name, Phone, Model, Serial number, Invoice
  number, Demo service, Received date and Demo date — all required. Model uses the same
  saved-models-or-type-your-own picker as service tickets.
- **FR-005**: Demo tickets MUST use the statuses New, Assigned, In Progress, Completed, Cancelled
  with the transition rules in D3, enforced server-side.
- **FR-006**: The Demo Board MUST provide the same features as the Service Board (D7) over demo
  tickets, with the same role/store scoping (Technicians see only demos assigned to them).
- **FR-007**: While entering a demo ticket, the system MUST list earlier demo tickets matching the
  serial number or invoice number, and MUST warn when 2 or more non-cancelled ones exist (D4).
  The same history MUST appear on the demo ticket page.
- **FR-008**: The Catalogue MUST provide "Demo services" with the same fields and actions as
  Services; the Demo service drop-down MUST list active demo services only, and a ticket MUST keep
  the name and price it was created with.
- **FR-009**: Assigning (or reassigning to a different) technician MUST queue one WhatsApp message
  to that technician containing the ticket number, customer, model, demo date and the ticket's
  short URL, and record it with the ticket.
- **FR-010**: Each demo ticket MUST have a unique short URL `/t/{code}` that opens the ticket,
  through login if necessary.
- **FR-011**: Users MUST have an optional WhatsApp number, editable on the Team page.
- **FR-012**: Every demo ticket mutation (creation, status change, detail edit, assignment) MUST
  be attributable and timestamped, and shown in the ticket's Activity.

### Key Entities

- **Demo ticket**: number, store, customer name/phone, model, serial number, invoice number, demo
  service (reference + name/price snapshot), received date, demo date, status, assigned
  technician, short code, created by.
- **Demo ticket status history**: append-only from/to status, actor, comment, time.
- **Demo service**: name, description, price, active — the "Demo" catalogue list.
- **User** (extended): optional WhatsApp number.
- **Notification** (extended): may belong to a demo ticket; new type `demo_assignment`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A demo ticket can be created in under a minute from New Ticket.
- **SC-002**: 100% of demo tickets appear only on the Demo Board, and 0 on the Service Board.
- **SC-003**: The 3rd-demo warning appears for every qualifying serial/invoice before saving.
- **SC-004**: A technician with a WhatsApp number receives the assignment message within 2 minutes.
- **SC-005**: Existing service-ticket automated tests pass unchanged in behaviour.

## Assumptions

- Demo tickets are free of charge to the customer in the app's terms: no bill, OTP or invoice;
  the demo service price is informational.
- Store scoping, roles and session rules are the existing ones (002-auth-rbac, 007-admin-console).
- WhatsApp sends go through the existing queue/mock/Meta client used for customer notifications.
