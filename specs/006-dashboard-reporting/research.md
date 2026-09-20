# Phase 0 Research: Kanban Board, Ticket Detail View & Reporting

## 1. Duplicated "first Completed" logic across three features

**Finding**: The exact same derived fact — the timestamp (or mere existence) of a ticket's
first transition into "Completed" — is now needed independently by three features:
- `004-parts-services-catalogue`'s Completed-lock (`EXISTS ... to_status='completed'`)
- `005-customer-notifications`'s once-only completion notification trigger
- `006` (this feature)'s report period attribution and resolution-time calculation
  (FR-017, FR-018), which need the actual **timestamp**, not just existence

**Decision**: This feature implements `lib/reporting/first-completed.ts` as its own
query (`SELECT MIN(created_at) FROM status_history WHERE ticket_id = $1 AND to_status =
'completed'`), functionally consistent with `004`'s and `005`'s independent
implementations of the same underlying fact, but not sharing code with them within this
plan's scope.

**Rationale**: Consolidating this into one shared utility (e.g., a SQL view or a single
`lib/tickets/first-completed.ts` living in `003-ticket-lifecycle` that all three features
import) would be the cleaner long-term design, and is flagged here as a **recommended
follow-up refactor** — but retroactively editing `004`'s and `005`'s already-committed
plans is outside this command's scope (planning `006`). Duplicating a correct, simple
query in three places is a code-quality nit, not a correctness risk (all three compute the
same answer from the same source table), so it doesn't block this plan — but it's real
technical debt worth calling out rather than silently accepting.

**Alternatives considered**:
- **Retroactively refactor `004`/`005` to use a shared utility now** — not done: would mean
  modifying two other features' already-generated plan artifacts as a side effect of
  planning a third, which risks silently changing decisions the user already reviewed and
  accepted for those features without their own review pass.
- **Add a `tickets.first_completed_at` column, backfilled and maintained by a trigger** —
  rejected per the same Simplicity/YAGNI reasoning `004`'s `research.md` §1 already gave:
  a derived query answers this correctly without a new column three features would need to
  agree to maintain.

## 2. One shared scoped-query function for board + filters + list API

**Decision**: `lib/board/ticket-query.ts` is the single function that applies role/store
scoping (via `002`'s `assertAccess()`-equivalent scope resolution) AND the FR-008/FR-009
filter criteria. The board view, the filter-narrowed list, and any future consumer of
"give me the tickets this user can see" all call this one function — there is exactly one
place role-scoping logic for ticket visibility lives in this feature.

**Rationale**: FR-004 (board scoping) and FR-010 (filter's store-choice scoping) describe
the same underlying rule from two angles. Implementing them as two independent code paths
risks one being updated (e.g., a future RBAC change) without the other — a classic
drift-between-duplicates bug. One function, two call sites, closes that risk structurally.

## 3. Customer Name filter performance

**Decision**: Add one index: `CREATE INDEX ON tickets (customer_name)` (or a trigram index
if partial/fuzzy matching is desired — plain prefix/exact matching is what spec.md's
Acceptance Scenario US3.2 describes, so a standard btree index suffices for v1).

**Rationale**: `003-ticket-lifecycle`'s own schema didn't index `customer_name` (it wasn't
needed for that feature's own queries); this feature's filter is the first consumer that
needs to search by it at scale, so the index is added here rather than speculatively by
`003`.

**Alternatives considered**:
- **Full-text search (`tsvector`)** — rejected as unnecessary for v1: spec.md's
  Acceptance Scenario describes a filter match, not a fuzzy/typo-tolerant search; a btree
  index on exact/prefix match is sufficient and simpler.

## 4. Drag-and-drop library

**Decision**: `@dnd-kit/core` (+ `@dnd-kit/sortable` if needed for within-column ordering,
though spec.md doesn't require within-column ordering, only cross-column moves).

**Rationale**: Constitution Non-Functional Service Levels require WCAG 2.1 AA. `@dnd-kit`
ships built-in keyboard sensors and ARIA live-region announcements for drag operations;
raw HTML5 drag-and-drop has no native keyboard equivalent, and `react-beautiful-dnd` (the
other commonly-reached-for option) is unmaintained. The existing ticket-detail status
controls (`003-ticket-lifecycle`'s own UI) remain the keyboard/assistive-tech-friendly
fallback regardless, per this plan's Technical Context constraint.

**Alternatives considered**:
- **`react-beautiful-dnd`** — rejected: unmaintained, a real risk for a project expected to
  receive ongoing feature work across many more specs.
- **Raw HTML5 drag-and-drop API** — rejected: no built-in keyboard accessibility, would
  require building that from scratch to meet the WCAG requirement `@dnd-kit` provides out
  of the box.

## 5. PDF generation

**Decision**: `pdfkit` — programmatic, imperative PDF construction (no headless browser).

**Rationale**: The source PRD's own recommended VPS sizing (2 vCPU / 4GB RAM for up to 10
stores) leaves little headroom for a Puppeteer/headless-Chromium process per PDF export.
`pdfkit` renders directly without spinning up a browser, appropriate for this feature's
actual output (a tabular summary report or a filtered ticket list), not a
pixel-perfect-design document that would justify HTML-to-PDF rendering.

**Alternatives considered**:
- **Puppeteer (HTML → PDF)** — rejected: memory/CPU footprint disproportionate to a
  tabular report, on a deployment target explicitly sized for a small VPS.
- **`@react-pdf/renderer`** — a reasonable alternative (JSX-based PDF composition); not
  chosen only because `pdfkit`'s simpler imperative API is sufficient for this feature's
  report shape and avoids introducing a second rendering paradigm alongside the app's
  normal React components.

## 6. CSV generation

**Decision**: `csv-stringify` (the `csv-parse` package's sibling, same maintainer).

**Rationale**: Already effectively a transitive dependency family via `004`'s and `007`'s
`csv-parse` usage for bulk import; using the matching `csv-stringify` for export keeps CSV
handling consistent across the codebase rather than introducing a different library for
the inverse operation.
