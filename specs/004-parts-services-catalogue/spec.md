# Feature Specification: Parts & Services Selection, Billing, and Catalogue Maintenance

**Feature Branch**: `004-parts-services-catalogue`

**Created**: 2026-09-18

**Status**: Draft

**Input**: User description: "PRD §6.5 Parts & Services Selection (globally priced parts and services added to an in-progress ticket from a searchable dropdown; each line captures name, quantity, unit cost snapshotted at selection time, and auto-calculated line total; bill = subtotal of all lines + store-configured tax; historical bills unaffected by later price changes) and §6.9.1-6.9.2 Super Admin catalogue maintenance (CRUD for parts — name, optional SKU, unit cost, category, active flag, bulk CSV import; CRUD for services — name, description, unit cost, active flag)."

## Clarifications

### Session 2026-09-20

- Q: Once a ticket reaches "Completed," can line items still be added/changed/removed if the ticket is later moved backward (per `003-ticket-lifecycle`'s backward-transition rule)? → A: No — the bill locks permanently the first time a ticket reaches "Completed," regardless of any later backward transition. A billing correction after that point is a separate mechanism, out of scope for this spec.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Applying Parts & Services with Automatic Bill Calculation (Priority: P1)

While working a ticket, a Service Manager or Admin selects the parts used and/or services performed from the shared catalogue. Each selection captures a quantity, and the system automatically calculates a running bill for the ticket, including tax.

**Why this priority**: This is the core value-delivery step of the service workflow — turning work performed into an accurate bill — and is the reason a catalogue needs to exist at all.

**Independent Test**: Given a ticket in progress and a populated catalogue, add a part and a service with quantities and confirm the ticket's bill (subtotal, tax, total) reflects them correctly.

**Acceptance Scenarios**:

1. **Given** a ticket that is "In Progress" or "On Hold," **When** a Service Manager adds a part with a quantity, **Then** a line item appears showing the part name, quantity, unit cost, and line total (quantity × unit cost).
2. **Given** one or more part/service lines on a ticket, **When** any line is added, changed, or removed, **Then** the ticket's subtotal, tax amount, and total bill recalculate automatically.
3. **Given** a store with a configured tax rate, **When** a ticket's bill is calculated, **Then** tax is computed as the subtotal multiplied by that store's tax rate.
4. **Given** a ticket not yet "In Progress" (still "Open"), **When** an attempt is made to add parts/services, **Then** the system prevents it until the ticket has moved past "Open."
5. **Given** a ticket that has already reached "Completed" at some point, **When** it is later moved backward to "In Progress" or "On Hold" (per `003-ticket-lifecycle`) and an attempt is made to add, change, or remove a line item, **Then** the system prevents it — the bill is permanently locked once "Completed" is first reached.

---

### User Story 2 - Catalogue Maintenance by Super Admin (Priority: P2)

The Super Admin maintains one global list of parts and one global list of services — creating, editing, and deactivating entries, including a bulk CSV import for parts — so every store always selects from the same consistent, up-to-date catalogue.

**Why this priority**: The catalogue must exist and be populated before Story 1 can function, and it's independently valuable/testable as a standalone admin capability.

**Independent Test**: As Super Admin, create a part and a service with costs, confirm both are immediately selectable on a ticket at any store, then deactivate one and confirm it's no longer selectable for new selections.

**Acceptance Scenarios**:

1. **Given** the catalogue maintenance screen, **When** a Super Admin adds a new part (name, optional SKU, unit cost, category) or service (name, description, unit cost), **Then** it becomes immediately available for selection by every store.
2. **Given** an existing catalogue entry, **When** a Super Admin deactivates it, **Then** it no longer appears in the selection dropdown for new ticket lines, while any ticket that already references it is unaffected.
3. **Given** a CSV file of parts, **When** a Super Admin performs a bulk import, **Then** all valid rows are added to the parts catalogue and any invalid rows are reported without silently discarding them.
4. **Given** a Service Manager or Admin (not Super Admin), **When** they attempt to reach the catalogue maintenance screen, **Then** access is denied (per `002-auth-rbac`).

---

### User Story 3 - Historical Price Snapshot Integrity (Priority: P3)

Once a part or service has been applied to a ticket, that ticket's line item keeps the price it was given at that time, even if the Super Admin later changes the catalogue's price.

**Why this priority**: This is a trust and billing-integrity guarantee rather than a day-to-day action, so it's ranked after the core selection and maintenance flows, but it's independently and precisely testable.

**Independent Test**: Apply a part to a ticket at its current price, change that part's catalogue price, and confirm the existing ticket's line item and bill total are unchanged while a new ticket picks up the new price.

**Acceptance Scenarios**:

1. **Given** a part applied to Ticket A at cost X, **When** the Super Admin later changes that part's catalogue cost to Y, **Then** Ticket A's line item and bill total still reflect cost X.
2. **Given** the same price change, **When** a new Ticket B applies the same part afterward, **Then** Ticket B's line item reflects the new cost Y.
3. **Given** a ticket that has reached "Completed," **When** any attempt is made to add, change, or remove one of its line items — regardless of the ticket's current status afterward — **Then** the system refuses, keeping the bill exactly as it was when "Completed" was first reached.

---

### Edge Cases

- What happens when a part/service is deactivated while it's already applied to an open (not-yet-completed) ticket? The existing line item remains valid and priced as applied; only new selections are blocked from choosing the deactivated entry.
- What happens if a CSV bulk import contains a duplicate or malformed row? The system MUST report which rows failed and why, rather than failing the entire import silently or partially importing without explanation.
- What happens if a store's tax rate is changed after some tickets already have a calculated bill? Already-calculated bills are not required to be retroactively recalculated; only new/ongoing bill calculations use the updated rate (see Assumptions).
- What happens if a quantity of zero or a negative quantity is entered for a line item? The system MUST reject it.
- What happens if a ticket that already reached "Completed" is later moved backward (per `003-ticket-lifecycle`) and someone tries to change its parts/services? The system MUST refuse — the bill locked permanently the first time the ticket reached "Completed," and that lock does not lift on a backward transition (see FR-015).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a Service Manager or Admin to add one or more parts and/or services from the active catalogue to a ticket that is "In Progress" or "On Hold," each with a quantity — unless the ticket's line items are already locked per FR-015.
- **FR-002**: System MUST reject a line-item quantity that is zero or negative.
- **FR-003**: System MUST capture, for each ticket line item, the catalogue item's name, the quantity, the unit cost at the moment of selection, and the resulting line total.
- **FR-004**: System MUST lock in ("snapshot") the unit cost on a ticket line item at the time it is added, independent of any later catalogue price change.
- **FR-005**: System MUST calculate a ticket's subtotal as the sum of all its part and service line totals.
- **FR-006**: System MUST calculate a ticket's tax amount as its subtotal multiplied by its store's configured tax rate.
- **FR-007**: System MUST calculate a ticket's total bill as its subtotal plus its tax amount.
- **FR-008**: System MUST recalculate a ticket's subtotal, tax, and total automatically whenever its line items change.
- **FR-009**: System MUST allow only the Super Admin to create, edit, and deactivate parts and services in the shared catalogue.
- **FR-010**: System MUST capture, for each part, a name, optional SKU, unit cost, category, and active/inactive state.
- **FR-011**: System MUST capture, for each service, a name, description, unit cost, and active/inactive state.
- **FR-012**: System MUST exclude deactivated parts/services from selection on new ticket lines while leaving existing ticket lines that reference them unaffected.
- **FR-013**: System MUST support bulk-importing parts from a CSV file, applying all valid rows and reporting any invalid rows with the reason they failed.
- **FR-014**: System MUST deny Service Manager and Admin roles access to catalogue create/edit/deactivate actions.
- **FR-015**: System MUST permanently lock a ticket's line items — no further additions, changes, or removals — the first time the ticket reaches "Completed" status, and MUST keep that lock in effect even if the ticket is later moved to an earlier status.

### Key Entities *(include if feature involves data)*

- **Parts Catalogue Entry**: A part's name, optional SKU, unit cost, category, and active/inactive state — global across all stores.
- **Services Catalogue Entry**: A service's name, description, unit cost, and active/inactive state — global across all stores.
- **Ticket Line Item**: A specific part or service applied to a ticket, with quantity, the unit cost snapshotted at selection time, and the computed line total.
- **Ticket Bill**: The computed subtotal, tax amount, and total for a ticket, derived from its line items and its store's tax rate.
- **Store Tax Rate** *(reference)*: The per-store tax percentage used in bill calculation; configured in `007-admin-console`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of ticket bills equal their line items' subtotal plus tax, with zero calculation discrepancies.
- **SC-002**: 100% of ticket line items retain their originally-applied unit cost after a later catalogue price change — zero retroactive changes to historical bills.
- **SC-003**: A new part or service added by the Super Admin is selectable by every store immediately, with no per-store setup needed.
- **SC-004**: A bulk CSV import of parts reports 100% of failed rows with a specific reason, with zero silent failures.
- **SC-005**: Zero deactivated catalogue entries appear as selectable options for new ticket lines.
- **SC-006**: Zero line-item changes (add, edit, or remove) ever succeed on a ticket that has already reached "Completed," even after a backward transition to an earlier status.

## Assumptions

- Parts and services pricing is global — a single shared price list used identically by every store (per source PRD, confirmed decision OQ-02).
- A ticket's tax amount, once calculated and the ticket has reached a billed state, is not required to be retroactively recalculated if the store's tax rate changes afterward; only ongoing/new calculations use the current rate.
- Bulk import in v1 applies to parts (per source PRD); services are managed one at a time through the catalogue screen.
- The specific file format/parsing mechanics for CSV import are a technical concern for `/speckit-plan`; this spec only requires that valid/invalid rows are both handled visibly.
- A mechanism for correcting a bill after a ticket has already reached "Completed" (e.g., a follow-up ticket, a distinct billing-adjustment record) is not defined here and is out of scope for this spec; the only guarantee made here is that the original bill never silently changes.
