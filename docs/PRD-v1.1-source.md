<!--
Source: SVC_MGMT_BRD_PRD_v1.1.docx, provided by the user (Akshay Kumar) 2026-09-18.
Extracted verbatim (text content only; formatting/images not preserved) for traceability from
specs/001-overview through specs/007-admin-console, all of which decompose this document.
See each spec's Input/Assumptions/Notes for how its sections map here.
-->

# Service Management Web App
Business & Product Requirements Document


| Document Type | BRD / PRD (Constitution) |
| --- | --- |
| Version | 1.1 — All open questions resolved |
| Date | September 2026 |
| Author | Akshay Kumar |
| Collaborator | Nav |
| Status | Approved — ready for spec.md decomposition |
| Project Code | SVC-MGMT-001 |


## 1. Executive Summary
This document defines the business and product requirements for a Service Management Web Application designed to digitise and streamline machine-servicing workflows across one or more retail / service stores. The system replaces ad-hoc, paper-based job-card processes with a structured, role-governed ticketing platform that captures customer intake, tracks work-in-progress, manages parts and service costs, and orchestrates customer communications via WhatsApp.
The application follows a multi-tenant, store-scoped model. A Super Admin (the application developer/owner) controls global configuration; store Admins manage one or more stores and can also create tickets; and Store Service Managers handle day-to-day ticket operations. The platform is a JIRA-style kanban board at its core, adapted specifically for machine-servicing contexts.
The system will be built on PostgreSQL and deployed on a self-hosted infrastructure. WhatsApp Business API is the primary customer communication channel. Expected volume is approximately 1,000 tickets per store per month.
## 2. Problem Statement
Current pain points in the target stores include:
- Service jobs are tracked on paper job-cards or in spreadsheets, making it difficult to query history, track status in real time, or share information across staff.
- No structured record of parts used per machine means repeat jobs may miss known problem history.
- Customers are not proactively notified when their machine is ready, leading to unnecessary follow-up calls.
- Delivery verification is informal, creating disputes about whether a machine was actually returned.
- Store owners have no consolidated view of jobs across multiple branches.

## 3. Goals & Success Metrics
### 3.1 Business Goals
- Replace paper-based job cards with a structured digital workflow.
- Give store owners real-time visibility into every open job across all branches.
- Reduce "machine ready" follow-up calls to near-zero by automating WhatsApp notifications.
- Create a defensible delivery audit trail via mandatory OTP verification.
- Provide a unified maintenance console for parts, services, and pricing — globally consistent across stores.
### 3.2 Success Metrics (KPIs)


| KPI | Baseline | Target (6 months) |
| --- | --- | --- |
| Average ticket resolution time | Unknown (paper) | ≤ 20% improvement after digitisation |
| Customer notification latency | Ad hoc phone call | < 2 minutes from status change to WhatsApp delivery |
| Delivery disputes | Untracked | Zero un-OTP-verified deliveries |
| Repeat-service lookup time | 5–10 min manual | < 30 seconds in-system |
| Admin report generation | Manual spreadsheet | Real-time dashboard, zero manual effort |


## 4. Scope
### 4.1 In Scope — v1
- User authentication and role-based access control (Super Admin, Admin, Store Service Manager).
- Service ticket lifecycle management (Create → In Progress → On Hold → Completed → Delivered).
- Machine service history lookup at ticket creation.
- Global parts and services catalogue management (single price list across all stores).
- Automated WhatsApp notification on service completion.
- Mandatory OTP-based delivery confirmation.
- Super Admin maintenance console (parts costs, services, machine models, store management).
- Multi-store data isolation with consolidated Admin and Super Admin view.
- Basic reporting and CSV/PDF export.
### 4.2 Out of Scope — v1
- Customer-facing self-service portal or mobile app.
- Payment processing or invoicing integrations (e.g. Razorpay, Stripe).
- Inventory management / automatic stock deduction.
- Employee time-tracking or productivity analytics.
- Offline / PWA mode.
- Third-party CRM or ERP integration.
- Intake photos at ticket creation: up to 5 images (JPEG/PNG ≤ 5 MB each), stored in object storage.
- Multi-language / localisation (English only in v1).

## 5. Stakeholders & User Roles
### 5.1 Stakeholder Map


| Stakeholder | Role | Interest / Concern |
| --- | --- | --- |
| Akshay Kumar | Super Admin / Developer | Full system control; global config; platform health |
| Store Owner / Franchisee | Admin | Visibility and ticket creation across stores; financial overview |
| Service Staff | Store Service Manager | Daily ticket workflow; parts selection; customer comms |
| End Customer | External (no login) | Timely WhatsApp notification; smooth OTP delivery experience |

### 5.2 User Role Definitions


| Role | Scope | Key Permissions |
| --- | --- | --- |
| Super Admin | Global (all stores) | All CRUD on all entities; user management; maintenance console; system config; can impersonate any role; view all tickets across all stores |
| Admin | Assigned store(s) | Create tickets for any assigned store; view & filter all tickets across assigned stores; manage Store Service Managers; read-only on parts/services catalogue; no system config access |
| Store Service Manager | One store only | Create, update and close tickets for their store only; select parts & services; trigger WhatsApp notifications; run OTP verification; cannot manage users or catalogue |



## 6. Functional Requirements
### 6.1 Authentication & User Management
#### 6.1.1 Login
- The system shall provide an email/password login page with server-side session management.
- Sessions shall expire after a configurable idle timeout (default: 8 hours).
- Failed login attempts shall be rate-limited — account locked for 15 minutes after 5 consecutive failures.
- Password reset supported via tokenised email link (token expires in 30 minutes).
#### 6.1.2 User Management (Super Admin)
- Super Admin can create, edit, deactivate and delete users of any role.
- Super Admin assigns each Admin to one or more stores.
- Super Admin assigns each Store Service Manager to exactly one store.
- A deactivated user cannot log in; their ticket history and audit records are preserved.
#### 6.1.3 Role-Based Access Control (RBAC)
- Every API route and UI view shall be guarded by server-side role assertions.
- A Store Service Manager must not see or create tickets outside their assigned store.
- An Admin must not access the maintenance console or user management screens.
- Role elevations must only be performed by Super Admin.

### 6.2 Ticket Creation & Intake
#### 6.2.1 Who Can Create Tickets
- Store Service Manager: can create tickets for their assigned store.
- Admin: can create tickets for any store they are assigned to.
- Super Admin: can create tickets for any store.
#### 6.2.2 Intake Form Fields


| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| Customer Name | Text | Yes | Free text; max 100 chars |
| Primary Phone Number | Phone | Yes | E.164 validated; destination for WhatsApp & OTP |
| Alternate Phone | Phone | No | Optional second contact number |
| Machine Model Number | Lookup / Text | Yes | Searchable dropdown from model master; free-type fallback for unlisted models |
| Issue Description | Textarea | Yes | Min 10 chars; max 1,000 chars |
| Estimated Pickup Date | Date | No | Informational; displayed on ticket card |
| Intake Photos | File Upload | No | Up to 5 images (JPEG/PNG, max 5 MB each); stored in object storage; displayed on ticket detail for condition-at-intake evidence |

#### 6.2.3 Ticket ID Generation
- Format: SVC-{YYYY}-{5-digit zero-padded sequence, store-scoped and year-scoped}.
- Example: SVC-2026-00001 (first ticket of 2026 in a given store).
- Ticket ID is system-generated and immutable after creation.
#### 6.2.4 Initial State
- Newly created tickets enter the "Open" state.
- The creating user, store, and creation timestamp are recorded automatically and immutably.

### 6.3 Service History Lookup
- Immediately after a ticket is saved, the system queries all prior closed tickets for the same machine model number.
- Matching records are displayed in a collapsible "Service History" panel on the ticket detail view, sorted by date descending.
- Each history entry shows: Ticket ID, date, issue description, parts used, services performed, resolution notes.
- No prior history → panel shows "No previous service records for this machine model."
- Super Admin and Admin see history across all stores. Store Service Managers see only their store's history.

### 6.4 Ticket Status Workflow


| Status | Description | Who Can Set | Notes |
| --- | --- | --- | --- |
| Open | Ticket created; awaiting work | System (auto on create) | Starting state for all new tickets |
| In Progress | Work has begun on the machine | Service Manager / Admin | Manual transition |
| On Hold | Work paused — awaiting parts or customer input | Service Manager / Admin | Must add a reason comment |
| Completed | Service done; bill finalised; WhatsApp sent | Service Manager / Admin | Triggers automatic WhatsApp notification to customer |
| Delivered | Machine handed back; OTP verified | Service Manager / Admin | Requires successful OTP confirmation — mandatory, cannot be bypassed |
| Cancelled | Job abandoned | Admin or Super Admin only | Requires mandatory reason; soft-deleted from active board |


- Kanban board renders each status as a column. Cards are draggable between valid columns.
- Backward transitions (e.g. Completed → In Progress) are allowed with a mandatory comment.
- Cancelled tickets are hidden from the active board but accessible via "All Tickets" filter.

### 6.5 Parts & Services Selection
#### 6.5.1 Parts — Globally Priced
- Parts prices are global — a single unit cost per part applies across all stores.
- While a ticket is In Progress (or On Hold), the Service Manager or Admin adds parts from a searchable dropdown.
- Each line captures: Part Name, Quantity, Unit Cost (read from global master at time of selection), Line Total (auto-calculated).
- The unit cost is snapshotted onto the ticket line at selection time; subsequent master-price changes do not retroactively alter closed tickets.
#### 6.5.2 Services — Globally Priced
- Labour / diagnostic services are selected from the global services catalogue.
- Each line captures: Service Name, Quantity (default 1), Unit Cost, Line Total.
- Same cost-snapshot rule applies as for parts.
#### 6.5.3 Bill Calculation
- Subtotal = Σ Part line totals + Σ Service line totals.
- Tax = Subtotal × configured tax rate (set per store in Super Admin console; default 0%).
- Total Bill = Subtotal + Tax.
- Bill is shown on the ticket detail page and included verbatim in the WhatsApp completion message.

### 6.6 Customer Notifications — WhatsApp
#### 6.6.1 Service Completion Message
- When a ticket is moved to Completed, the system automatically sends a WhatsApp message to the customer's primary phone number.
- The message is sent via the WhatsApp Business API.
- Message content (configurable template) includes: customer name, ticket ID, machine model, total bill amount, store name, store contact number.
- Delivery status (Sent / Delivered / Failed) is logged against the ticket with a timestamp.
- If the WhatsApp message fails to deliver, the Store Service Manager receives an in-app alert and must confirm they notified the customer by another means.
#### 6.6.2 OTP Delivery
- OTPs for delivery verification (§6.7) are also sent via WhatsApp to the customer's primary number.
#### 6.6.3 Template Management
- Super Admin can edit message templates from the maintenance console.
- Supported placeholders: {{customer_name}}, {{ticket_id}}, {{machine_model}}, {{bill_total}}, {{store_name}}, {{store_phone}}.
- A test-send button allows Super Admin to verify a template against a given phone number before activating it.

### 6.7 OTP-Based Delivery Verification (Mandatory)
- Delivery verification via OTP is mandatory — a ticket cannot transition to Delivered without a successful OTP confirmation.
- The Service Manager initiates "Deliver Machine" from the ticket detail page.
- The system sends a 6-digit OTP via WhatsApp to the customer's primary phone number.
- OTP is valid for 10 minutes; resend is available once after a 60-second cooldown.
- The Service Manager enters the OTP provided by the customer. On success → ticket transitions to Delivered.
- After 3 failed attempts, the system locks OTP entry and requires Admin or Super Admin override to proceed.
- Delivery timestamp, verifying user, and OTP confirmation record are stored immutably.

### 6.8 Dashboard & Board View
#### 6.8.1 Kanban Board
- Main view is a JIRA-style kanban board with one column per ticket status.
- Each card displays: Ticket ID, Customer Name, Machine Model, status, date created, days-open counter.
- Cards are draggable to valid adjacent columns (respects the transition rules in §6.4).
- Board auto-refreshes every 30 seconds.
#### 6.8.2 Filters


| Filter | Roles | Options |
| --- | --- | --- |
| Store | Admin, Super Admin | "All Stores" aggregate or individual store selector |
| Status | All | Multi-select per status column |
| Date Range | All | Created date from/to picker |
| Ticket ID | All | Exact or partial match |
| Customer Name | All | Free-text partial match |
| Machine Model | All | Searchable dropdown |

#### 6.8.3 Ticket Detail View
- Sections: Intake Info | Service History Panel | Status Timeline | Parts & Services | Bill Summary | WhatsApp Notification Log | OTP Verification | Audit Trail.
- Audit trail at the bottom records every mutation (actor, timestamp, before/after).

### 6.9 Super Admin — Maintenance Console
#### 6.9.1 Parts Catalogue
- CRUD: Part Name, SKU (optional), Unit Cost, Category, Active/Inactive flag.
- Inactive parts do not appear in ticket part-selection dropdowns.
- Bulk import via CSV.
#### 6.9.2 Services Catalogue
- CRUD: Service Name, Description, Unit Cost, Active/Inactive flag.
#### 6.9.3 Machine Models
- CRUD: Model Name, Manufacturer, Category (e.g. Washing Machine, Refrigerator, AC).
- Bulk import via CSV.
#### 6.9.4 Stores Management
- CRUD: Store Name, Address, Primary Contact, WhatsApp Number, Tax Rate (%), Active/Inactive.
- Assign Admin users to stores from this screen.
#### 6.9.5 Notification Configuration
- Edit WhatsApp message templates (completion + OTP).
- Configure WhatsApp Business API credentials (API key, phone number ID, access token).
- Test-send a message to a given phone number.
#### 6.9.6 User Management
- Create, edit, deactivate, and delete users of all roles.
- Assign stores to Admins and Store Service Managers.

### 6.10 Reporting — v1 (Basic)
- Admin and Super Admin can export filtered ticket lists as CSV or PDF.
- Summary report per store: total tickets, tickets by status, average resolution time, parts revenue, services revenue.
- Date-range selector on all reports.


## 7. Non-Functional Requirements


| Category | Requirement |
| --- | --- |
| Performance | Page load < 2s on broadband; API response < 500ms (p95) for all ticket CRUD operations. |
| Scalability | Baseline: 1,000 tickets/month/store. Design for 10 stores = 10,000 tickets/month (~120,000/year). Must handle 50 concurrent users without degradation. PostgreSQL with appropriate indexing is sufficient at this scale. |
| Availability | 99.5% uptime target on self-hosted infrastructure. Scheduled maintenance windows communicated 24 h in advance via in-app banner. |
| Security | TLS 1.2+ for all data in transit. bcrypt (cost ≥ 12) for passwords. HttpOnly + Secure cookies for sessions. CSRF protection on all state-changing endpoints. OWASP Top-10 mitigations in place. |
| Data Retention | Ticket data retained indefinitely. Deleted stores trigger soft-delete and archive. OTP logs retained 90 days. Audit logs retained 2 years. |
| Auditability | All data mutations logged: actor, timestamp, before/after state snapshot stored in audit_log table. |
| Browser Support | Latest 2 versions of Chrome, Firefox, Safari, and Edge. Responsive layout down to 768px (tablet). No native mobile app in v1. |
| Accessibility | WCAG 2.1 Level AA for all interactive elements. |
| Language | English only in v1. Architecture shall externalise UI strings to an i18n config file to enable future localisation without code changes. |
| Notifications | WhatsApp messages delivered within 2 minutes of trigger. Failed deliveries surface an in-app alert within 30 seconds. |


## 8. User Stories
### 8.1 Store Service Manager
- As a Store Service Manager, I want to create a new service ticket in under 2 minutes so I can quickly move to the next customer.
- As a Store Service Manager, I want to see any previous jobs on the same machine model so I can inform my diagnostic.
- As a Store Service Manager, I want to add parts and services to the ticket so the bill is calculated automatically.
- As a Store Service Manager, I want the customer to receive a WhatsApp message automatically when their machine is ready, so I do not need to make a phone call.
- As a Store Service Manager, I want to confirm machine delivery with an OTP so there is proof the machine was collected by the right person.
### 8.2 Admin (Store Owner)
- As an Admin, I want to create a ticket for any of my stores so I can handle walk-ins even when my service manager is busy.
- As an Admin, I want a kanban board across all my stores so I can see total workload at a glance.
- As an Admin, I want to filter by store, status, and date so I can investigate issues quickly.
- As an Admin, I want to export a monthly revenue report as PDF so I can share it with my accountant.
### 8.3 Super Admin
- As the Super Admin, I want to add parts, services, and machine models without touching code so store operations are never blocked.
- As the Super Admin, I want to create and deactivate accounts so access is controlled when staff change.
- As the Super Admin, I want to update the WhatsApp message template so communications stay relevant.

## 9. High-Level Data Model (PostgreSQL)
All entities stored in a single PostgreSQL database. Multi-tenancy enforced at the application layer via store_id scoping. Detailed column specs and migration files will be in spec.md/db-schema.md.


| Entity | Key Columns | Notes |
| --- | --- | --- |
| users | id, name, email, password_hash, role (enum), active, created_at | role: super_admin | admin | service_manager |
| user_stores | user_id, store_id | Many-to-many: Admins may have multiple stores; Service Managers exactly one |
| stores | id, name, address, phone, whatsapp_number, tax_rate, active | Each store has its own tax rate (default 0%) |
| machine_models | id, name, manufacturer, category, active | Global master; managed by Super Admin |
| parts | id, name, sku, unit_cost, category, active | Global pricing; cost snapshotted onto ticket line at selection |
| services | id, name, description, unit_cost, active | Global pricing; cost snapshotted onto ticket line at selection |
| tickets | id, ticket_number, store_id, created_by, status (enum), customer_name, phone_primary, phone_alt, machine_model_id, issue_description, estimated_pickup, bill_subtotal, bill_tax, bill_total, created_at, updated_at | Core entity; ~1,000/month/store |
| ticket_parts | id, ticket_id, part_id, quantity, unit_cost_snapshot, line_total | Immutable after ticket reaches Completed |
| ticket_services | id, ticket_id, service_id, quantity, unit_cost_snapshot, line_total | Immutable after ticket reaches Completed |
| status_history | id, ticket_id, from_status, to_status, changed_by, comment, changed_at | Full state machine audit trail |
| notifications | id, ticket_id, type (completion|otp), channel (whatsapp), recipient_phone, message_body, status, sent_at, delivered_at | Log of all outbound messages |
| otp_verifications | id, ticket_id, otp_hash, issued_at, expires_at, verified_at, attempts, success | One active OTP per ticket at a time |
| audit_log | id, actor_id, entity_type, entity_id, action, before_json, after_json, ts | Catch-all mutation log |


## 10. Tech Stack & Deployment
No specific framework was mandated (OQ-08: any stack is acceptable). The following is the recommended baseline given PostgreSQL (OQ-09) and self-hosted deployment (OQ-10). Teams may substitute equivalent tools.


| Layer | Recommended Choice | Rationale |
| --- | --- | --- |
| Frontend | Next.js 14+ (App Router) with TypeScript | Full-stack in one repo; server components reduce client JS; excellent TypeScript support; easy to self-host via Node process or Docker |
| Backend / API | Next.js API Routes or a separate Express/Fastify service | If complexity grows, extract to a dedicated Node.js API. Keep simple at start. |
| Database | PostgreSQL 15+ | Confirmed (OQ-09). Relational model suits ticket/parts/history schema well. Use connection pooling (PgBouncer or pg pool). |
| ORM / Query | Drizzle ORM or Prisma | Type-safe queries; auto-generates migration files; plays well with PostgreSQL. |
| Auth | NextAuth.js (Auth.js) or custom JWT | Email/password + session management; minimal setup; extensible for future SSO. |
| WhatsApp API | Meta WhatsApp Business API (Cloud API) | Confirmed (OQ-01). Free Cloud API tier; messages via HTTPS. Requires Meta Business verification and approved message templates. |
| Background Jobs | pg-boss or BullMQ (Redis) | For async WhatsApp sends, OTP expiry, and report generation. pg-boss avoids an extra Redis dependency at small scale. |
| Deployment | Docker + Docker Compose on a Linux VPS | Confirmed self-hosted (OQ-10). Single compose file runs app + PostgreSQL + job worker. Recommended: 2 vCPU / 4 GB RAM VPS (e.g. Hetzner CX21) for up to 10 stores. |
| Reverse Proxy | Nginx | TLS termination via Certbot/Let's Encrypt; proxy to Next.js container. |
| Backups | pg_dump cron + off-site upload (S3 / B2) | Daily automated PostgreSQL dumps; retain 30 days. |
| Monitoring | Uptime Kuma (self-hosted) + app-level logs | Lightweight uptime monitoring; structured JSON logs to stdout, rotated by Docker. |


## 11. System Integrations


| Integration | Purpose | Decision | Notes |
| --- | --- | --- | --- |
| WhatsApp Business API (Meta Cloud) | Completion notifications + OTP delivery | Confirmed (OQ-01) | Requires Meta Business account, phone number verification, and approved message templates. Webhook for delivery receipts. |
| Email (SMTP) | Password reset links only | Any SMTP provider | Minimal use; single transactional template. Can use SendGrid free tier or self-hosted Postfix. |
| Object Storage (v1) | Intake photo uploads (up to 5 per ticket) | Confirmed in v1 | JPEG/PNG max 5 MB each. Pre-signed URL pattern. AWS S3 or self-hosted MinIO. |


## 12. Assumptions
- Each store has reliable internet connectivity; no offline support required in v1.
- All store staff have a browser-capable device (desktop or tablet); no native mobile app in v1.
- All customers have a WhatsApp-capable phone number (primary requirement for notifications and OTP).
- Parts and machine model data will be seeded by the Super Admin before store go-live.
- Parts and services pricing is global (single price list across all stores) — confirmed by OQ-02.
- Expected volume: ~1,000 tickets/month/store — confirmed by OQ-05. System designed to handle 10 stores comfortably.
- Self-hosted on a Linux VPS managed by the Super Admin (Akshay) — confirmed by OQ-10.
- WhatsApp Business API (Meta) will be registered and verified by the Super Admin before go-live — OQ-01.

## 13. Decisions Log (Resolved Open Questions)
All open questions from v1.0 have been resolved. The table below records each decision for traceability.


| # | Question | Decision | Affects |
| --- | --- | --- | --- |
| OQ-01 | Which messaging provider? | WhatsApp Business API (Meta Cloud API) | Resolved |
| OQ-02 | Store-specific or global parts pricing? | Global — single price list across all stores | Resolved |
| OQ-03 | Can Admin create tickets? | Yes — Admin can create tickets for assigned stores | Resolved |
| OQ-04 | Multi-language support for notifications? | English only in v1; i18n-ready architecture | Resolved |
| OQ-05 | Expected data volume? | ~1,000 tickets / store / month | Resolved |
| OQ-06 | Intake photos in v1? | Yes — up to 5 images per ticket in v1 | Resolved |
| OQ-07 | Is OTP mandatory for delivery? | Yes — OTP is mandatory; cannot be bypassed | Resolved |
| OQ-08 | Tech stack? | Any acceptable; recommended: Next.js + PostgreSQL | Resolved |
| OQ-09 | Database? | PostgreSQL | Resolved |
| OQ-10 | Hosting? | Self-hosted (Linux VPS + Docker) | Resolved |


## 14. Suggested spec.md Decomposition
When converting this document to spec.md files, the recommended module breakdown is:


| spec.md file | Covers BRD section(s) | Priority |
| --- | --- | --- |
| spec/00-overview.md | §1 Executive Summary, §4 Scope, §12 Assumptions | P0 |
| spec/01-auth-rbac.md | §5 Roles, §6.1 Auth & RBAC | P0 |
| spec/02-tickets.md | §6.2 Ticket Creation, §6.4 Status Workflow, §6.3 History | P0 |
| spec/03-parts-services.md | §6.5 Parts & Services, §6.9.1–6.9.2 Catalogue | P0 |
| spec/04-notifications.md | §6.6 WhatsApp Notifications, §6.7 OTP Delivery | P0 |
| spec/05-dashboard.md | §6.8 Dashboard & Board, §6.10 Reporting | P1 |
| spec/06-admin-console.md | §6.9 Super Admin Console | P1 |
| spec/07-db-schema.md | §9 Data Model — full column list, indexes, constraints | P0 |
| spec/08-tech-stack.md | §10 Tech Stack & Deployment | P1 |
| spec/09-integrations.md | §11 Integrations — WhatsApp API setup, SMTP | P1 |
| spec/10-nfr.md | §7 Non-Functional Requirements | P1 |


## 15. Glossary


| Term | Definition |
| --- | --- |
| BRD | Business Requirements Document. |
| PRD | Product Requirements Document. |
| Ticket | A single service job record, from intake through delivery. |
| Kanban Board | A visual board where columns represent statuses and cards represent tickets. |
| OTP | One-Time Password — a 6-digit code sent to the customer's WhatsApp to verify delivery identity. |
| Super Admin | The application owner (Akshay) with unrestricted access to all data and configuration. |
| Admin | A store owner with ticket creation and visibility across their assigned stores. |
| Store Service Manager | Staff member who creates and manages tickets for a single assigned store. |
| Machine Model | The make/model identifier of a machine brought in for service. |
| Parts Catalogue | Global master list of spare parts with costs; managed by Super Admin. |
| Services Catalogue | Global master list of labour/diagnostic services with costs; managed by Super Admin. |
| WhatsApp Business API | Meta's API for sending template messages to customers via WhatsApp programmatically. |
| Cost Snapshot | The unit cost of a part or service copied onto the ticket line at selection time, so price changes do not alter historical billing. |
| RBAC | Role-Based Access Control — permissions enforced by user role. |
| VPS | Virtual Private Server — the self-hosted cloud machine running the application. |



Service Management Web App — BRD/PRD v1.1 | All open questions resolved | Ready for spec.md decomposition