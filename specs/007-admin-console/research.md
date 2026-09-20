# Phase 0 Research: Machine Model & Store Administration Console

## 1. Reconciling the `stores` table stub

**Decision**: This feature's migration is an `ALTER TABLE stores ADD COLUMN ...`
(address, primary_contact, whatsapp_number, tax_rate, active — everything spec.md's FR-006
requires beyond whatever minimal columns `003-ticket-lifecycle`'s stub created), never a
`CREATE TABLE` or a competing table.

**Rationale**: `002-auth-rbac`'s `user_stores` and `003-ticket-lifecycle`'s `tickets` both
carry a `store_id` FK into `stores.id` already. Since this feature is planned after both,
the table already exists with at least an `id` (and possibly `name`) column. Recreating it
would break those existing foreign keys; altering it is the only option that doesn't
require touching two other features' already-planned schemas.

**Alternatives considered**:
- **Drop and recreate `stores`** — rejected: would orphan `002`'s and `003`'s existing FK
  columns; a real, avoidable migration hazard.
- **A separate `store_details` table joined 1:1 to the stub** — rejected: pure
  over-engineering for a handful of columns on what is conceptually one entity; violates
  Simplicity & YAGNI for no benefit over a direct `ALTER`.

## 2. `machine_models` has no stub to reconcile

**Finding**: `003-ticket-lifecycle` deliberately stores `tickets.machine_model` as free
text with **no foreign key** to any catalogue table (that spec's own `research.md` §1,
required to satisfy its free-text-fallback requirement, FR-003 there). So this feature's
`machine_models` table is a genuinely new table — no `ALTER`, no cross-feature migration
hazard, unlike `stores` above.

**Decision**: `CREATE TABLE machine_models` fresh; `tickets.machine_model` remains
unconstrained free text exactly as `003` decided — this feature does **not** retroactively
add an FK, since doing so would break `003`'s explicit free-text-fallback requirement
(a ticket must always save even for a model absent from this catalogue).

## 3. Admin-store assignment writes to `002`'s existing table

**Decision**: The store screen's "assign/remove Admin" action (FR-010, User Story 3)
writes directly to `002-auth-rbac`'s existing `user_stores` table via that feature's own
insert/delete pattern — no new assignment table or duplicate join table is created here.

**Rationale**: spec.md's own Assumptions state this explicitly: "the same underlying
capability required by `002-auth-rbac`; this spec only adds a convenient entry point."
Creating a second table for the same fact (which Admin is assigned to which store) would
let the two go out of sync — exactly what Simplicity & YAGNI and the single-source-of-truth
principle behind it warn against.

**Alternatives considered**:
- **A `007`-owned assignment table, synced to `002`'s `user_stores`** — rejected: sync
  logic between two tables holding the same fact is unnecessary complexity spec.md doesn't
  ask for.

## 4. Meaning of a store's "WhatsApp Number" (FR-006, FR-007)

**Decision**: A store's `whatsapp_number` is **contact/display information** — it appears
as the `{{store_phone}}` placeholder in customer-facing message content
(`005-customer-notifications`) — not a separate Meta-registered sending identity per
store. Actual message sending in `005`'s plan uses **one** Meta WhatsApp Business Cloud
API account/number for the whole platform. FR-007's "usable WhatsApp number" validation is
therefore a **well-formed phone number format check** (E.164-style), not a check against
Meta's API that the number is itself verified/onboarded.

**Rationale**: Registering a separate Meta WABA-verified sending number per store would be
a materially more expensive and operationally heavier architecture (Meta Business
verification per store) than anything spec.md or the source PRD describes; `005`'s plan
already committed to a single-account Cloud API integration. Interpreting "store WhatsApp
number" as display/contact content, not a sending identity, is the only reading consistent
with that.

**Alternatives considered**:
- **Per-store Meta-verified sending numbers** — rejected: no spec.md or PRD text supports
  this materially heavier setup, and it would contradict `005`'s already-planned
  single-account architecture; revisit only if the business explicitly asks for
  store-branded sending numbers in a future spec.

## 5. Tax rate representation

**Decision**: `numeric(5,2)` percentage (e.g., `18.00` for 18%), range-checked to `[0, 100]`
at the application layer.

**Rationale**: Matches `004-parts-services-catalogue`'s precedent of using `numeric` (never
floating point) for anything that flows into a bill calculation (constitution-adjacent
correctness concern, consistent with that feature's SC-001).

## 6. Machine model CSV import

**Decision**: Reuses the exact `csv-parse` + per-row independent validation pattern
`004-parts-services-catalogue` established for parts import (`lib/catalogue/csv-import.ts`
there), applied here to columns `name, manufacturer, category`. Duplicate detection is by
`name` (this spec's Model Name is the sole identifying value, per this spec's own
clarification).

**Rationale**: Identical shape of problem (`004`'s FR-013 vs. this spec's FR-004) — no
reason to design a second CSV-import mechanism when one already exists and fits.
