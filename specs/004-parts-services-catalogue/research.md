# Phase 0 Research: Parts & Services Selection, Billing, and Catalogue Maintenance

No `NEEDS CLARIFICATION` markers remain. Language/framework/database inherited from
`002-auth-rbac`'s plan and not revisited here.

## 1. Determining the Completed-lock without modifying `tickets`

**Decision**: `lib/billing/completed-lock.ts` checks
`EXISTS (SELECT 1 FROM status_history WHERE ticket_id = $1 AND to_status = 'completed')`
before permitting any line-item add/edit/remove. No new column is added to
`003-ticket-lifecycle`'s `tickets` table.

**Rationale**: `003-ticket-lifecycle`'s `status_history` table already records every status
transition immutably (its own FR-015). "Has this ticket ever reached Completed" is a fact
that table already answers — adding a redundant `first_completed_at` column to `tickets`
would duplicate that fact in two places that could drift out of sync, which Simplicity &
YAGNI weighs against. This also avoids a cross-feature migration touching a table `004`
doesn't own.

**Alternatives considered**:
- **Add `tickets.first_completed_at` column, set on first transition to Completed** —
  rejected: `003-ticket-lifecycle` owns that table; adding a `004`-specific column there
  couples the two features' schemas unnecessarily when a read-only query gets the same
  answer. Also marginally faster (indexed column vs. an EXISTS subquery), but at this
  feature's scale (a handful of status_history rows per ticket) the difference is
  immaterial against the <500ms p95 target.
- **Cache the lock state on `ticket_line_items` itself (a `locked` boolean per row)** —
  rejected: same duplication concern, and would need updating retroactively across every
  existing line item when a ticket first reaches Completed, which is exactly the kind of
  extra write path a derived check avoids entirely.

## 2. Money representation and arithmetic

**Decision**: All monetary columns (`unit_cost`, `line_total`, `subtotal`, `tax_amount`,
`total`) are PostgreSQL `NUMERIC(12,2)`. All arithmetic (line totals, subtotal, tax, total)
is computed in SQL (`NUMERIC` arithmetic) or via a decimal-safe library
(e.g., `decimal.js`) if computed in application code — never native JavaScript floating
point.

**Rationale**: SC-001 requires "zero calculation discrepancies." Floating-point arithmetic
(JS `number`) is well-documented as unsafe for currency (e.g., `0.1 + 0.2 !== 0.3`);
`NUMERIC` and decimal libraries avoid this class of bug entirely rather than requiring
careful rounding discipline everywhere money is touched.

**Alternatives considered**:
- **Store amounts as integer minor units (e.g., paise/cents)** — a legitimate alternative
  (also exact); not chosen only because `NUMERIC(12,2)` reads more directly in query
  results and reports (`006-dashboard-reporting`) without a conversion step, and PostgreSQL
  `NUMERIC` arithmetic is exact regardless. Either would have satisfied SC-001; this is a
  preference, not a functional requirement.
- **Native JS floating point with manual rounding** — rejected: exactly the failure mode
  SC-001 guards against.

## 3. Tax calculation timing

**Decision**: Tax is computed at read/recalculation time (`subtotal × store.tax_rate` as of
right now), not stored as a separately-locked value once a ticket bills. Only once the
Completed-lock (research.md §1) takes effect does the whole bill (subtotal, tax, total)
stop recalculating, because no further line-item changes are possible to trigger a
recalculation.

**Rationale**: spec.md's own Assumptions state a tax-rate change doesn't require
retroactively recalculating an already-billed ticket, but also doesn't require actively
preventing recalculation before that point — the natural behavior (read the store's
current rate whenever the bill is computed) already satisfies this without extra logic,
and becomes moot once FR-015's lock applies.

**Alternatives considered**:
- **Snapshot the tax rate at ticket creation time** — rejected: spec.md doesn't ask for
  this, and it would mean an in-progress ticket's tax never reflects an intentional
  store-tax-rate correction made mid-ticket, which isn't a behavior spec.md describes.

## 4. CSV bulk import

**Decision**: `csv-parse` (streaming parser) reads the uploaded file row-by-row; each row
is validated independently (required fields present, unit cost is a valid non-negative
number, not a duplicate of an existing active part by name) and either inserted or
collected into a per-row failure report with a specific reason — matching FR-013's
"applying all valid rows and reporting any invalid rows with the reason they failed."

**Rationale**: Row-level independent validation (rather than all-or-nothing) is what
FR-013 and the CSV edge case explicitly require; `csv-parse` is a well-maintained,
Node-native streaming parser suited to potentially large files without loading the whole
file into memory at once.

**Alternatives considered**:
- **`papaparse`** — also viable (more commonly browser-oriented); `csv-parse` chosen for
  its Node.js-first streaming API, a better fit for a server-side import route.
- **All-or-nothing import (reject the whole file on any bad row)** — rejected per FR-013.

## 5. Deactivation vs. deletion

**Decision**: Parts/services are never hard-deleted via this feature's API — only
`active`/`inactive` toggled (FR-012). No delete endpoint exists in
`contracts/catalogue-billing-api.md`.

**Rationale**: A ticket line item stores its own snapshotted name/cost (FR-003, FR-004),
so no foreign-key integrity issue would technically block deletion — but spec.md never
describes a delete flow, only deactivation, and inventing one would be scope creep beyond
what US2 asks for.

**Alternatives considered**:
- **Hard delete with snapshot preserving history anyway** — rejected: not asked for; adds
  an operation and its edge cases (e.g., re-adding a "deleted" part under the same name)
  for no requirement it serves.
