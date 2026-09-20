# Feature Specification: Platform Overview, Scope & Business Goals

**Feature Branch**: `001-overview`

**Created**: 2026-09-18

**Status**: Draft

**Input**: User description: "Service Management Web App — Business & Product Requirements Document v1.1 (Executive Summary, Problem Statement, Goals & Success Metrics, and Scope sections): a Service Management Web Application to digitise and streamline machine-servicing workflows across one or more retail/service stores, replacing paper-based job-cards with a structured, role-governed ticketing platform. Multi-tenant, store-scoped model with Super Admin (global), Admin (one or more stores), and Store Service Manager (one store) roles. Core is a JIRA-style kanban board adapted for machine servicing. WhatsApp is the primary customer communication channel. Expected volume ~1,000 tickets/store/month."

## Clarifications

### Session 2026-09-20

- Q: Should this spec's business-facing term "job"/"jobs" be normalized to "ticket"/"tickets", matching the source PRD's glossary and specs 002-007? → A: Yes — replaced throughout this spec and added "Service Ticket" to Key Entities, cross-referencing `003-ticket-lifecycle` for full detail.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Digitized Ticket Tracking Replaces Paper Cards (Priority: P1)

A store that currently tracks service tickets on paper job-cards or spreadsheets instead records every ticket in the system, so history can be queried, status is visible in real time, and information is shared across staff without relying on physical paper or one person's memory.

**Why this priority**: This is the foundational value proposition — every other capability (history lookup, notifications, delivery verification, reporting) only matters because tickets are now digital records instead of paper.

**Independent Test**: Can be tested by recording a service ticket in the system and confirming any authorized staff member can retrieve its full details later without needing the original paper card.

**Acceptance Scenarios**:

1. **Given** a store has just gone live on the system, **When** a new machine comes in for service, **Then** the ticket is recorded digitally with no paper job-card created.
2. **Given** a ticket was recorded by one staff member, **When** a different authorized staff member at the same store looks it up later, **Then** they see the complete, current record.

---

### User Story 2 - Consolidated Multi-Store Visibility for Owners (Priority: P2)

A store owner (Admin) who operates more than one store location can see every open ticket across all of their stores from a single consolidated view, rather than having no visibility beyond what each store manager tells them.

**Why this priority**: This directly targets a named business pain point (owners have no consolidated view across branches) and is independently valuable and testable once any tickets exist, ahead of the full workflow being built out.

**Independent Test**: Seed tickets across two stores assigned to the same Admin; confirm that Admin's consolidated view shows tickets from both, while a single-store Service Manager's view does not.

**Acceptance Scenarios**:

1. **Given** an Admin is assigned to two stores with open tickets in each, **When** they open their view, **Then** tickets from both stores are visible together.
2. **Given** a Super Admin, **When** they open the same kind of view, **Then** tickets from every store in the system are visible, not just those of one Admin's assigned stores.

---

### User Story 3 - Automated Customer Communication Reduces Follow-Up Calls (Priority: P3)

Instead of staff manually phoning customers to say a machine is ready, the system automatically notifies the customer once service is complete.

**Why this priority**: Directly targets the "unnecessary follow-up calls" pain point and the goal of reducing such calls to near-zero. Full notification mechanics are specified separately (see `005-customer-notifications`); this story establishes the business outcome this platform commits to.

**Independent Test**: Complete a service ticket and confirm a customer notification is generated automatically, with no staff member placing a phone call.

**Acceptance Scenarios**:

1. **Given** a service ticket is finished, **When** staff mark it complete, **Then** the customer is notified automatically without a manual phone call being required.

---

### User Story 4 - Defensible Delivery Audit Trail (Priority: P4)

When a machine is handed back to a customer, the system creates a verifiable record that the correct customer received it, removing the "he said/she said" disputes that occur with informal handoffs.

**Why this priority**: Directly targets the named pain point of informal, disputed delivery verification. Full mechanics are specified separately (see `005-customer-notifications`); this story establishes the business outcome.

**Independent Test**: Complete a delivery handoff and confirm a verifiable record (who, when, confirmed how) exists afterward that can be produced in a dispute.

**Acceptance Scenarios**:

1. **Given** a machine is ready for pickup, **When** it is handed back to the customer, **Then** a verifiable delivery record is created that did not exist under the old informal process.

---

### User Story 5 - Unified Parts, Services & Pricing Console (Priority: P5)

Instead of each store tracking its own inconsistent parts/services pricing, a single person (Super Admin) maintains one global, consistent price list that every store automatically uses.

**Why this priority**: Directly targets the "unified maintenance console" goal and consistent global pricing across stores. Full mechanics are specified separately (see `004-parts-services-catalogue` and `007-admin-console`); this story establishes the business outcome.

**Independent Test**: Confirm that a pricing change made once by the Super Admin is immediately reflected as the price used by every store, without any store maintaining its own separate list.

**Acceptance Scenarios**:

1. **Given** two different stores, **When** they both select the same part or service, **Then** both use the identical current price maintained by the Super Admin.

---

### Edge Cases

- What happens if a store loses internet connectivity? The system is not required to provide offline support in v1; work simply cannot proceed digitally until connectivity is restored (see Assumptions).
- What happens if the business grows beyond the initially planned scale? The system must comfortably support at least 10 stores at ~1,000 tickets/store/month without requiring a redesign.
- What happens if a feature request falls into an explicitly out-of-scope area (e.g., a customer wants to pay online through the platform)? It MUST be declined for v1 and tracked separately as potential future scope, not silently absorbed into this platform's v1 requirements.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST operate as a multi-tenant, store-scoped platform where every service ticket belongs to exactly one store.
- **FR-002**: System MUST support a Super Admin role with visibility and configuration authority spanning every store, distinct from store-level roles (detailed in `002-auth-rbac`).
- **FR-003**: System MUST support at least 10 stores operating concurrently, each generating on the order of 1,000 service tickets per month, without requiring architectural redesign.
- **FR-004**: System MUST present its primary working view as a status-column board (kanban-style), adapted to the machine-servicing ticket lifecycle (detailed in `003-ticket-lifecycle` and `006-dashboard-reporting`).
- **FR-005**: System MUST use a single messaging channel (WhatsApp) as the primary means of automated customer communication (detailed in `005-customer-notifications`).
- **FR-006**: System MUST NOT provide a customer-facing self-service portal or mobile app in v1.
- **FR-007**: System MUST NOT process payments or integrate with payment/invoicing systems in v1.
- **FR-008**: System MUST NOT perform inventory management or automatic stock deduction in v1.
- **FR-009**: System MUST NOT provide employee time-tracking or productivity analytics in v1.
- **FR-010**: System MUST NOT require or provide an offline/PWA mode in v1.
- **FR-011**: System MUST NOT integrate with third-party CRM or ERP systems in v1.
- **FR-012**: System MUST present its interface in English only in v1.
- **FR-013**: System MUST allow a service ticket to carry up to 5 intake photos as supporting evidence of the machine's condition (mechanics detailed in `003-ticket-lifecycle`).

### Key Entities *(include if feature involves data)*

- **Service Ticket**: The core unit of work this platform is built around — one machine-servicing job from intake through delivery; full attributes and lifecycle are detailed in `003-ticket-lifecycle`.
- **Store**: A single service location; the unit of data scoping for day-to-day operations.
- **Business/Platform**: The overall multi-store system operated by the Super Admin, spanning all stores.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Average service ticket resolution time improves by at least 20% within 6 months of going live, compared to the pre-digitization baseline.
- **SC-002**: Customer "machine ready" follow-up phone calls drop to near-zero within 6 months of going live.
- **SC-003**: 100% of machine deliveries have a verifiable confirmation record; zero deliveries are disputed for lack of any record.
- **SC-004**: Looking up a machine's repeat-service history takes under 30 seconds, down from 5-10 minutes of manual searching.
- **SC-005**: An owner/Admin can generate a consolidated, real-time view of tickets across all their stores with zero manual spreadsheet effort.
- **SC-006**: The system operates correctly at a load of at least 10 stores and ~10,000 tickets/month platform-wide without visible slowdown to users.

## Assumptions

- Each store has reliable internet connectivity; no offline support is required in v1.
- All store staff use a browser-capable device (desktop or tablet); no native mobile app is required in v1.
- All customers have a WhatsApp-capable phone number, since WhatsApp is the sole notification channel in v1.
- Parts, services, and machine model reference data are seeded by the Super Admin before a store's first day of use.
- Initial planning scale is ~1,000 tickets/store/month, with the system expected to comfortably support up to 10 stores.
- The detailed mechanics behind each business goal in this spec (notifications, delivery verification, pricing console, board view) are specified in their own dedicated feature specs, not repeated here.
