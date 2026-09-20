# Feature Specification: Kanban Board, Ticket Detail View & Reporting

**Feature Branch**: `006-dashboard-reporting`

**Created**: 2026-09-18

**Status**: Draft

**Input**: User description: "PRD §6.8 Dashboard & Board View (JIRA-style kanban board, one column per ticket status, cards showing Ticket ID/Customer Name/Machine Model/status/created date/days-open, drag between valid adjacent columns, auto-refresh every 30 seconds; filters by Store, Status, Date Range, Ticket ID, Customer Name, Machine Model; Ticket Detail View with Intake Info, Service History, Status Timeline, Parts & Services, Bill Summary, WhatsApp Notification Log, OTP Verification, and Audit Trail sections) and §6.10 Reporting (CSV/PDF export of filtered ticket lists; per-store summary report of total tickets, tickets by status, average resolution time, parts revenue, services revenue; date-range selector on all reports)."

## Clarifications

### Session 2026-09-20

- Q: When a summary report is generated for a date range, which date determines whether a ticket counts toward that period — creation date or completion date? → A: Completion date — a ticket counts toward the period containing when it first reached "Completed" (its bill's lock point); a ticket not yet Completed by period-end isn't counted for that period.
- Q: Does "average resolution time" in the summary report measure Open→Completed, or Open→Delivered? → A: Open → Completed — measures how long the actual service work took, independent of how long the customer takes to collect the machine afterward.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Kanban Board Overview of All Tickets (Priority: P1)

Staff open a board showing every relevant ticket as a card in a column for its current status, giving an at-a-glance view of workload without opening each ticket individually.

**Why this priority**: This is the primary day-to-day working view of the platform — the consolidated visibility promised in `001-overview` starts here.

**Independent Test**: With seeded tickets across multiple statuses, load the board and confirm each ticket appears as a card in the column matching its current status, showing the required summary fields.

**Acceptance Scenarios**:

1. **Given** tickets exist in several different statuses, **When** the board loads, **Then** each ticket appears as a card in the column for its current status, showing Ticket ID, customer name, machine model, creation date, and a running count of days it's been open.
2. **Given** the board is open, **When** 30 seconds pass without user action, **Then** the board refreshes to reflect any changes made elsewhere.
3. **Given** a Store Service Manager, **When** they view the board, **Then** only their store's tickets appear (per `002-auth-rbac`); an Admin sees their assigned stores, and a Super Admin sees all.

---

### User Story 2 - Drag-and-Drop Status Updates (Priority: P2)

From the board, staff move a ticket's card into a different column to change its status, without needing to open the ticket's full detail view for routine transitions.

**Why this priority**: A convenience layer over the status-change capability defined in `003-ticket-lifecycle`; valuable but secondary to simply being able to see the board (Story 1).

**Independent Test**: Drag a card from one column to a status that's a valid transition and confirm the ticket updates; attempt a drag to a status that isn't a valid transition and confirm it's rejected.

**Acceptance Scenarios**:

1. **Given** a ticket card in a column, **When** it is dragged to a column representing a valid next status, **Then** the ticket's status updates accordingly, subject to the same rules (e.g., mandatory comments) defined in `003-ticket-lifecycle`.
2. **Given** the same card, **When** it is dragged to a column that isn't a valid transition from its current status, **Then** the move is rejected and the card returns to its original column.

---

### User Story 3 - Filtered Search Across Tickets (Priority: P3)

Staff narrow the board or a ticket list down by store, status, date range, ticket ID, customer name, or machine model to find exactly the tickets they're looking for.

**Why this priority**: Becomes essential as ticket volume grows, but the board is still usable at low volume without it, so it's ranked after the core board view.

**Independent Test**: With a mixed set of seeded tickets, apply each filter type individually and confirm only matching tickets are shown.

**Acceptance Scenarios**:

1. **Given** an Admin or Super Admin, **When** they filter by store, **Then** only tickets from the selected store(s) (or all, if "All Stores" is chosen) are shown.
2. **Given** any role, **When** they filter by one or more statuses, a date range, ticket ID, customer name, or machine model, **Then** only tickets matching all applied filters are shown.
3. **Given** a Store Service Manager, **When** they use the store filter, **Then** only their own store is available to select (per `002-auth-rbac`).

---

### User Story 4 - Ticket Detail View with Full Audit Trail (Priority: P4)

Opening a single ticket shows everything about it in one place: the original intake info, its service history, every status change, the parts/services applied and resulting bill, the notification log, OTP verification outcome, and a complete audit trail of every change made to the ticket.

**Why this priority**: Necessary for investigating a specific job in depth, but staff spend most of their time on the board (Stories 1-3); detail view is consulted less frequently per ticket.

**Independent Test**: Open a ticket that has gone through intake, status changes, parts/services, a notification, and delivery, and confirm every section shows accurate, complete information consistent with what those other specs recorded.

**Acceptance Scenarios**:

1. **Given** a ticket with a full history of activity, **When** its detail view is opened, **Then** it shows Intake Info, Service History, Status Timeline, Parts & Services with Bill Summary, WhatsApp Notification Log, OTP Verification outcome, and an Audit Trail, each reflecting accurate current data.
2. **Given** the Audit Trail section, **When** it is viewed, **Then** every mutation to the ticket is listed with who made it, when, and what changed.

---

### User Story 5 - Exportable Summary Reports (Priority: P5)

Admins and the Super Admin export a filtered list of tickets, or a per-store summary (total tickets, tickets by status, average resolution time, parts revenue, services revenue) for a chosen date range, as CSV or PDF.

**Why this priority**: A periodic/managerial activity rather than a daily one, so it's ranked last, though it's independently valuable (e.g., for sharing with an accountant).

**Independent Test**: Apply a date range and store filter, export as both CSV and PDF, and confirm the exported content matches what's shown on-screen for that filter.

**Acceptance Scenarios**:

1. **Given** a filtered ticket list, **When** an Admin or Super Admin exports it, **Then** they can choose CSV or PDF and the exported file's contents match the filtered list.
2. **Given** a chosen store and date range, **When** a summary report is generated, **Then** it shows total tickets, a breakdown by status, average resolution time (Open-to-Completed duration, excluding pickup wait), parts revenue, and services revenue for that store and period, counting only tickets that first reached "Completed" within that date range.
3. **Given** a Store Service Manager, **When** they attempt to access reporting/export, **Then** access is denied (reporting is an Admin/Super Admin capability per source PRD §6.10).

---

### Edge Cases

- What happens when a filter combination matches zero tickets? The board/list MUST clearly show an empty result rather than appearing broken or still loading.
- What happens when a drag-and-drop move requires a mandatory comment (e.g., a backward transition or Cancelled)? The system MUST prompt for that comment as part of the drag interaction rather than silently failing or silently skipping the requirement.
- What happens to the "days-open" counter once a ticket reaches a terminal status (Delivered/Cancelled)? It MUST stop incrementing and reflect the final elapsed duration.
- What happens if two staff members view the board at the same time and one changes a ticket? The other's board MUST reflect the change within the next auto-refresh cycle, not indefinitely show stale data.
- What happens to a ticket created in one report period but not completed until a later one? It MUST count toward the period containing its completion date, not its creation date; it is simply excluded from any period's metrics until it first reaches "Completed" (see FR-017).
- What happens to a ticket that reaches "Completed" more than once (e.g., moved backward and re-completed)? Reports MUST use the timestamp it *first* reached "Completed" — matching the permanent bill lock defined in `004-parts-services-catalogue` — not any later re-entry into that status.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display tickets as cards grouped into columns by their current status.
- **FR-002**: System MUST show, on each card, at minimum: Ticket ID, customer name, machine model, creation date, and days-open count.
- **FR-003**: System MUST refresh the board's data automatically at least every 30 seconds.
- **FR-004**: System MUST scope which tickets appear on the board according to the viewer's role and store assignment, consistent with `002-auth-rbac`.
- **FR-005**: System MUST allow moving a ticket to a different status by dragging its card to another column.
- **FR-006**: System MUST reject a drag-to-column move that is not a valid status transition, per the rules defined in `003-ticket-lifecycle`.
- **FR-007**: System MUST prompt for a mandatory comment during a drag-and-drop move when the target transition requires one (per `003-ticket-lifecycle`).
- **FR-008**: System MUST provide filters for store (Admin/Super Admin only), status (multi-select), creation date range, ticket ID, customer name, and machine model.
- **FR-009**: System MUST apply all currently selected filters together (as an AND condition) when narrowing the ticket list/board.
- **FR-010**: System MUST restrict the store filter's available choices to the stores the viewer's role/assignment permits.
- **FR-011**: System MUST provide a ticket detail view containing: intake information, service history, status timeline, parts & services with bill summary, WhatsApp notification log, OTP verification outcome, and an audit trail.
- **FR-012**: System MUST display, in the audit trail, every recorded mutation to the ticket with actor, timestamp, and what changed.
- **FR-013**: System MUST allow Admin and Super Admin roles to export a filtered ticket list as CSV or PDF.
- **FR-014**: System MUST allow Admin and Super Admin roles to generate a per-store summary report for a selected date range, showing total tickets, a breakdown by status, average resolution time, parts revenue, and services revenue.
- **FR-015**: System MUST deny Store Service Managers access to report generation/export.
- **FR-016**: System MUST clearly indicate an empty result set when no tickets match the applied filters.
- **FR-017**: System MUST attribute a ticket to a report's date range based on the timestamp it first reached "Completed" status — not its creation date — and MUST exclude a ticket from all periods' ticket-count and revenue metrics until it first reaches "Completed." If a ticket reaches "Completed" more than once, system MUST use the timestamp of the first occurrence, matching the permanent bill lock defined in `004-parts-services-catalogue`.
- **FR-018**: System MUST calculate a ticket's resolution time as the elapsed duration from its creation ("Open") to the timestamp it first reached "Completed," excluding any time spent afterward waiting for customer pickup/delivery. "Average resolution time" in a summary report MUST be the mean of this duration across the report's included tickets.

### Key Entities *(include if feature involves data)*

- **Board View**: The status-column presentation of tickets scoped to the viewer's role and any applied filters.
- **Ticket Card**: The board's summary representation of one ticket.
- **Filter Selection**: The combination of store/status/date/ticket-ID/customer/machine-model criteria currently narrowing a view.
- **Summary Report**: An aggregated set of metrics (ticket counts by status, average resolution time, parts/services revenue) for a store and date range.
- **Export**: A generated CSV or PDF file reflecting a given filtered ticket list or summary report.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Staff can locate a specific ticket via filters in under 30 seconds, without scrolling through an entire unfiltered list.
- **SC-002**: The board reflects any ticket change made by another staff member within 30 seconds, with no manual refresh required.
- **SC-003**: 100% of drag-and-drop moves that violate the status transition rules are rejected, with zero invalid transitions occurring via the board.
- **SC-004**: An Admin/Super Admin can produce a store's summary report and export it without any manual spreadsheet work.
- **SC-005**: 100% of a ticket's recorded mutations are visible in its audit trail, with no gaps between what other specs record and what's displayed here.
- **SC-006**: 100% of tickets in a summary report are attributed to the period containing their first "Completed" timestamp; 0% are attributed by creation date instead.
- **SC-007**: 100% of "average resolution time" figures measure Open-to-Completed duration only; 0% include post-Completed pickup-wait time.

## Assumptions

- The board and reporting features are read/interaction surfaces over data captured by `002-auth-rbac`, `003-ticket-lifecycle`, `004-parts-services-catalogue`, and `005-customer-notifications`; this spec does not duplicate how that underlying data is captured, only how it's viewed, filtered, and exported.
- Reporting/export access is limited to Admin and Super Admin roles, consistent with the source PRD's framing of reporting as a management activity.
- Exact CSV/PDF file formatting and rendering mechanics are technical decisions deferred to `/speckit-plan`; this spec requires only that exported content matches the filtered/summarized data shown on screen.
- The "resolution time improves by X%" KPI referenced in `001-overview`'s SC-001 is assumed to mean the same Open-to-Completed duration defined here (FR-018); that spec should be updated to reference this definition explicitly if it's revisited.
