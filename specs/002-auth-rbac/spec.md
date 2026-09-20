# Feature Specification: Authentication & Role-Based Access Control

**Feature Branch**: `002-auth-rbac`

**Created**: 2026-09-18

**Status**: Draft

**Input**: User description: "PRD §5 Stakeholders & User Roles and §6.1 Authentication & User Management: three roles — Super Admin (global, all stores), Admin (one or more assigned stores, can create tickets, read-only on catalogue, no system config), Store Service Manager (exactly one store, full ticket operations, cannot manage users or catalogue). Email/password login with server-side sessions, configurable idle timeout (default 8h), rate-limited failed logins (lock 15 min after 5 failures), tokenized password reset (30 min expiry). Super Admin creates/edits/deactivates/deletes users and assigns stores. Every API route and UI view guarded by server-side role checks; deactivated users keep their history but cannot log in."

## Clarifications

### Session 2026-09-20

- Q: When a user is deactivated (or their role/store assignment changes) while holding an active session, does the change apply on their very next request, or only once their session naturally expires or they log in again? → A: Live re-check on every request — deactivation/role/store changes take effect on the account's very next request; no explicit session termination is needed since access is never cached at login.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Secure Login & Session Management (Priority: P1)

Any staff member (Store Service Manager, Admin, or Super Admin) logs in with an email and password to access the system. Their session stays active while they're working and expires automatically after a period of inactivity.

**Why this priority**: Nothing else in the system can happen without staff being able to authenticate. This is the entry point to every other feature.

**Independent Test**: Can be tested by logging in with valid credentials, confirming access to a role-appropriate view, then leaving the session idle past the timeout and confirming it's no longer valid.

**Acceptance Scenarios**:

1. **Given** a staff member has valid credentials, **When** they log in, **Then** they reach a view appropriate to their role.
2. **Given** a logged-in session, **When** it sits idle longer than the configured timeout (default 8 hours), **Then** the session is no longer valid and the user must log in again.
3. **Given** a staff member enters the wrong password 5 times in a row, **When** they attempt a 6th time, **Then** the account is locked for 15 minutes, even with the correct password.

---

### User Story 2 - Role-Scoped Access Enforcement (Priority: P2)

A Store Service Manager can only see and act on their one assigned store's data. An Admin can only see and act on the store(s) they're assigned to, and cannot reach system configuration or user management screens. A Super Admin can see and do everything, everywhere.

**Why this priority**: This is the access boundary that makes the multi-store, multi-role model trustworthy — without it, the platform's data isolation promise (see `001-overview`) is meaningless. It's independently testable with seeded users and data.

**Independent Test**: Log in as each of the three roles against the same seeded multi-store dataset and confirm each sees exactly what their role and store assignment entitle them to, no more and no less.

**Acceptance Scenarios**:

1. **Given** a Store Service Manager assigned to Store A, **When** they attempt to view or act on a ticket at Store B, **Then** access is denied.
2. **Given** an Admin assigned to Stores A and B (not C), **When** they browse tickets, **Then** they see Stores A and B but not Store C.
3. **Given** an Admin, **When** they attempt to open the maintenance console or user management screens, **Then** access is denied.
4. **Given** a Super Admin, **When** they access any store's data or any configuration screen, **Then** access is granted.
5. **Given** any role, **When** they attempt to perform an action their role doesn't permit by directly invoking the underlying operation (not just hiding a button in the UI), **Then** the system still denies it.

---

### User Story 3 - Self-Service Password Reset (Priority: P3)

A staff member who forgets their password can reset it themselves via an emailed link, without needing an administrator to intervene.

**Why this priority**: Reduces support burden and keeps staff unblocked, but the system is still usable without it (an admin could otherwise reset passwords manually), so it ranks below core login and access enforcement.

**Independent Test**: Trigger a password reset for a known account and confirm the emailed link allows setting a new password, and that an expired or already-used link does not.

**Acceptance Scenarios**:

1. **Given** a staff member has forgotten their password, **When** they request a reset, **Then** they receive an email with a reset link.
2. **Given** a valid, unused reset link, **When** the staff member follows it within 30 minutes, **Then** they can set a new password and log in with it.
3. **Given** a reset link older than 30 minutes, **When** the staff member attempts to use it, **Then** it is rejected and they must request a new one.

---

### User Story 4 - Super Admin User Provisioning (Priority: P4)

The Super Admin creates staff accounts, assigns Admins to one or more stores and Store Service Managers to exactly one store, and deactivates accounts when staff leave — without needing developer/code changes.

**Why this priority**: Necessary for onboarding real stores and staff, but it's an administrative capability that can be exercised (with a handful of seed accounts) even before every other feature is complete.

**Independent Test**: As Super Admin, create a new Store Service Manager, assign them to a store, confirm they can log in and only see that store, then deactivate them and confirm they can no longer log in while their past actions remain visible in ticket history.

**Acceptance Scenarios**:

1. **Given** the Super Admin, **When** they create a new user and assign a role and store(s), **Then** that user can immediately log in with access matching their assignment.
2. **Given** an existing Admin, **When** the Super Admin assigns them an additional store, **Then** the Admin immediately gains visibility into that store.
3. **Given** an active user with a history of actions on tickets, **When** the Super Admin deactivates them, **Then** they can no longer log in, but their name still appears correctly on the historical tickets/actions they performed.
4. **Given** a Store Service Manager account, **When** the Super Admin attempts to assign it to a second store, **Then** the system enforces the one-store-only rule for that role.
5. **Given** a user with an active, unexpired session, **When** the Super Admin deactivates them or changes their role/store assignment, **Then** their very next request is evaluated against the new state — an active session does not keep operating under the old permissions for the rest of its normal duration.

---

### Edge Cases

- What happens when a user's role is changed (e.g., Store Service Manager promoted to Admin)? Only the Super Admin can perform a role change, and it must take effect immediately for future access decisions.
- What happens when a deactivated user's name needs to appear on historical records? Their identity and past attribution MUST remain visible even though they can no longer log in.
- What happens when a password reset is requested for an email that isn't a registered account? The system must not reveal whether the account exists (respond the same way either way).
- What happens if a Store Service Manager tries to be assigned to zero stores, or an Admin to zero stores? The system MUST require at least one store assignment for these roles at creation time.
- What happens after an account lockout expires? The account MUST become usable again automatically after 15 minutes, without requiring Super Admin intervention.
- What happens to a user's already-active session when they are deactivated or their role/stores change mid-session? The change MUST take effect on their very next request — access and scope are re-evaluated live each time, never cached from login (see FR-019).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support exactly three roles: Super Admin, Admin, and Store Service Manager.
- **FR-002**: System MUST scope a Store Service Manager to exactly one store at all times.
- **FR-003**: System MUST allow an Admin to be assigned to one or more stores.
- **FR-004**: System MUST grant a Super Admin visibility and configuration authority across every store, with no assignment needed.
- **FR-005**: System MUST provide an email/password login mechanism with a server-managed session.
- **FR-006**: System MUST expire an idle session after a configurable timeout, defaulting to 8 hours.
- **FR-007**: System MUST lock an account for 15 minutes after 5 consecutive failed login attempts.
- **FR-008**: System MUST allow a staff member to request a password reset via a tokenized link sent to their registered email, valid for 30 minutes.
- **FR-009**: System MUST reject an expired or already-used password reset link and require a new request.
- **FR-010**: System MUST NOT reveal whether a given email is a registered account when a password reset is requested.
- **FR-011**: System MUST allow only the Super Admin to create, edit, deactivate, and delete user accounts of any role.
- **FR-012**: System MUST allow only the Super Admin to assign or change a user's store assignment(s) and role.
- **FR-013**: System MUST prevent a deactivated user from logging in, while preserving their historical ticket actions and attribution unchanged.
- **FR-014**: System MUST enforce role and store-scope checks on every operation that reads or changes data, not only in what the user interface displays.
- **FR-015**: System MUST deny a Store Service Manager or Admin any access to stores outside their assignment, for both viewing and modifying data.
- **FR-016**: System MUST deny an Admin access to the maintenance console (parts/services/machine-model/store configuration) and to user management screens.
- **FR-017**: System MUST require at least one store assignment when creating an Admin or Store Service Manager account.
- **FR-018**: System MUST record which staff member performed every access-controlled action, for use in the audit trail (see `003-ticket-lifecycle`).
- **FR-019**: System MUST re-evaluate a staff member's active/deactivated state, role, and store assignment(s) on every request, not only at login, so that a deactivation or role/store change takes effect on that account's very next request without requiring session termination or re-login.

### Key Entities *(include if feature involves data)*

- **Staff Account**: An individual login identity with a name, email, password credential, role (Super Admin / Admin / Store Service Manager), active/deactivated state, and store assignment(s).
- **Session**: A staff member's authenticated working period, with an idle-timeout expiry.
- **Password Reset Request**: A time-limited, single-use token tied to a staff account, used to set a new password.
- **Role**: One of the three fixed permission levels governing what a Staff Account can see and do.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of attempts by a role to access data or screens outside its permitted scope are denied, with zero exceptions found in testing.
- **SC-002**: A staff member can complete a self-service password reset in under 5 minutes without contacting an administrator.
- **SC-003**: An account locked out after failed login attempts becomes usable again automatically within 15 minutes, with no administrator action required.
- **SC-004**: 100% of deactivated accounts are immediately unable to log in while 100% of their historical actions remain correctly attributed.
- **SC-005**: The Super Admin can onboard a new store's staff (create accounts, assign roles and stores) without any code change or developer involvement.
- **SC-006**: 100% of deactivation and role/store-assignment changes take effect on the affected account's very next request; 0% of active sessions continue operating under superseded permissions.

## Assumptions

- Only the three named roles exist in v1; no custom or additional roles are supported.
- Session and lockout policy values (8-hour timeout, 5-attempt/15-minute lockout, 30-minute reset token expiry) are business requirements fixed in this spec, though their configurability (e.g., an adjustable idle timeout) is confirmed per the source PRD.
- Email delivery for password reset is assumed available and reliable; the specific email-sending mechanism is a technical decision deferred to `/speckit-plan`.
- Single sign-on (SSO) or third-party identity providers are out of scope for v1; only email/password authentication is required.
