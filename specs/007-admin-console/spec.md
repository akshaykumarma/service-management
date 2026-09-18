# Feature Specification: Machine Model & Store Administration Console

**Feature Branch**: `007-admin-console`

**Created**: 2026-09-18

**Status**: Draft

**Input**: User description: "PRD §6.9.3 Machine Models (Super Admin CRUD for Model Name, Manufacturer, Category, with bulk CSV import) and §6.9.4 Stores Management (Super Admin CRUD for Store Name, Address, Primary Contact, WhatsApp Number, Tax Rate %, Active/Inactive, and assigning Admin users to stores from this screen)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Machine Model Catalogue Maintenance (Priority: P1)

The Super Admin maintains the master list of machine models (name, manufacturer, category) that staff select from during ticket intake, including bulk-loading a large list via CSV.

**Why this priority**: Ticket intake (`003-ticket-lifecycle`) depends on a usable model list existing; this is a self-contained admin capability that can be built and tested independently.

**Independent Test**: As Super Admin, add a machine model and confirm it's immediately selectable at intake; deactivate it and confirm it no longer appears for new tickets; bulk-import a CSV of models and confirm valid rows are added.

**Acceptance Scenarios**:

1. **Given** the machine model screen, **When** a Super Admin adds a model with name, manufacturer, and category, **Then** it becomes immediately available in the intake model dropdown (per `003-ticket-lifecycle`).
2. **Given** an existing model, **When** a Super Admin deactivates it, **Then** it no longer appears in the intake dropdown, while tickets that already reference it are unaffected.
3. **Given** a CSV file of machine models, **When** a Super Admin bulk-imports it, **Then** all valid rows are added and any invalid rows are reported with the reason they failed.
4. **Given** an Admin or Store Service Manager, **When** they attempt to reach the machine model screen, **Then** access is denied (per `002-auth-rbac`).

---

### User Story 2 - Store Setup & Configuration (Priority: P2)

The Super Admin creates and configures each store — name, address, primary contact, WhatsApp number, tax rate, and active/inactive state — so a store can begin taking tickets and billing customers correctly.

**Why this priority**: A store must exist and be configured before any ticket, billing, or notification activity tied to it can happen, but it's a self-contained, independently testable admin action.

**Independent Test**: As Super Admin, create a store with a specific tax rate, confirm a ticket created at that store bills using that rate (per `004-parts-services-catalogue`), then deactivate the store and confirm it can no longer be selected for new activity.

**Acceptance Scenarios**:

1. **Given** the store management screen, **When** a Super Admin creates a store with name, address, primary contact, WhatsApp number, and tax rate, **Then** the store becomes available for ticket creation and its tax rate is used in that store's bill calculations.
2. **Given** an existing store, **When** a Super Admin updates its tax rate, **Then** subsequently calculated bills at that store use the new rate.
3. **Given** an existing store, **When** a Super Admin marks it inactive, **Then** it is no longer available for new ticket creation, while its historical tickets remain accessible per each role's normal visibility rules.

---

### User Story 3 - Assigning Admins to Stores (Priority: P3)

From the store management screen, the Super Admin assigns which Admin user(s) are responsible for a given store, as part of setting the store up.

**Why this priority**: This is a convenience entry point onto the store-assignment capability already required by `002-auth-rbac`; it's ranked last here since the underlying access-control behavior is specified there, not here.

**Independent Test**: From a store's configuration screen, assign an existing Admin to it and confirm that Admin's ticket visibility (per `002-auth-rbac`) immediately includes that store.

**Acceptance Scenarios**:

1. **Given** a store's configuration screen, **When** a Super Admin assigns an Admin user to it, **Then** that Admin gains visibility into the store's tickets (per `002-auth-rbac`).
2. **Given** the same screen, **When** a Super Admin removes an Admin's assignment to a store, **Then** that Admin loses visibility into that store's tickets.

---

### Edge Cases

- What happens when a machine model is deactivated while referenced by existing tickets? Existing tickets keep the reference; only new intake selections are blocked (see User Story 1).
- What happens when a store is deactivated while it has open (non-terminal) tickets? Those tickets remain accessible and workable by staff already assigned to it; the store simply stops being available for creating new tickets (see Assumptions).
- What happens if a CSV of machine models contains a duplicate model already in the catalogue? The system MUST report it as a skipped/invalid row rather than silently creating a duplicate.
- What happens if a store's WhatsApp number is left blank or invalid? Notifications for that store's tickets cannot be sent (per `005-customer-notifications`), so the system MUST validate this field before allowing the store to go active.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow only the Super Admin to create, edit, and deactivate machine models.
- **FR-002**: System MUST capture, for each machine model, a name, manufacturer, and category.
- **FR-003**: System MUST exclude deactivated machine models from the intake selection dropdown while leaving existing ticket references to them unaffected.
- **FR-004**: System MUST support bulk-importing machine models from a CSV file, applying valid rows and reporting invalid/duplicate rows with the reason they failed.
- **FR-005**: System MUST allow only the Super Admin to create, edit, and deactivate stores.
- **FR-006**: System MUST capture, for each store, a name, address, primary contact, WhatsApp number, tax rate, and active/inactive state.
- **FR-007**: System MUST validate that a store has a usable WhatsApp number before it can be made active.
- **FR-008**: System MUST use a store's currently configured tax rate for any bill calculated at that store going forward, per `004-parts-services-catalogue`.
- **FR-009**: System MUST exclude a deactivated store from selection when creating new tickets, while preserving access to its historical tickets per each role's normal visibility.
- **FR-010**: System MUST allow the Super Admin to assign or remove an Admin's association with a store from the store management screen, applying the access effect defined in `002-auth-rbac`.
- **FR-011**: System MUST deny Admin and Store Service Manager roles access to machine model and store management screens.

### Key Entities *(include if feature involves data)*

- **Machine Model**: A make/model/category reference entry selectable at ticket intake, with an active/inactive state.
- **Store**: A service location's configuration — name, address, contact info, WhatsApp number, tax rate, and active/inactive state — plus its assigned Admin user(s).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The Super Admin can fully configure a new store (all required fields) and have it ready to take tickets in under 10 minutes, without developer involvement.
- **SC-002**: 100% of bills calculated at a store use that store's currently configured tax rate.
- **SC-003**: Zero deactivated machine models or stores are selectable for new ticket/intake activity.
- **SC-004**: A bulk CSV import of machine models reports 100% of failed/duplicate rows with a specific reason, with zero silent failures.
- **SC-005**: An Admin's store assignment change (add or remove) takes effect immediately, with no delay before their ticket visibility updates.

## Assumptions

- A deactivated store's already-created tickets remain fully accessible and workable by staff who already have visibility into them; deactivation only prevents new ticket creation at that store.
- Machine model categories (e.g., Washing Machine, Refrigerator, AC) are free-form or a maintained short list; the exact category taxonomy is a content decision for the Super Admin, not a fixed enumeration in this spec.
- Store-to-Admin assignment shown here is the same underlying capability required by `002-auth-rbac`; this spec only adds a convenient entry point for it from the store screen.
