# Phase 1 Data Model: Kanban Board, Ticket Detail View & Reporting

This feature introduces **no new persisted tables** — every Key Entity in spec.md (Board
View, Ticket Card, Filter Selection, Summary Report, Export) is a derived/computed
projection over `002`-`005`'s existing schema. What follows documents those projections
and the one schema change this feature does make (an index).

## Schema Change

### `tickets.customer_name` — new index

```sql
CREATE INDEX idx_tickets_customer_name ON tickets (customer_name);
```

Supports FR-008's Customer Name filter (`research.md` §3). No other column changes to any
existing table.

## Derived Concepts

### Ticket Card (spec.md Key Entity)

Projected from `tickets` (owned by `003`): `id`, `ticket_number`, `customer_name`,
`machine_model`, `status`, `created_at`, and a computed `days_open`:

```text
days_open = DATE_PART('day', LEAST(now(), terminal_at) - created_at)
```

where `terminal_at` is the ticket's `updated_at` if `status IN ('delivered', 'cancelled')`,
else `now()` — this is how FR-002's "days-open count" freezes once a ticket reaches a
terminal status (per spec.md's edge case), read live, never stored.

### Board View (spec.md Key Entity)

Ticket Cards grouped by `status`, scoped by the shared query function
(`lib/board/ticket-query.ts`, `research.md` §2) applying the viewer's role/store
visibility — identical scoping rule for both the board and any filtered list.

### Filter Selection (spec.md Key Entity)

Not persisted — a set of query parameters (`storeId[]`, `status[]`, `dateFrom`, `dateTo`,
`ticketId`, `customerName`, `machineModel`) passed to the same shared query function,
combined with AND (FR-009).

### Summary Report (spec.md Key Entity)

Computed per store + date range:

```sql
-- tickets counted/aggregated: only those whose first-Completed timestamp
-- (research.md §1) falls within [dateFrom, dateTo]
total_tickets       = COUNT(*)
tickets_by_status   = COUNT(*) GROUP BY status  -- current status, not status-at-completion-time
avg_resolution_time = AVG(first_completed_at - tickets.created_at)   -- FR-018
parts_revenue       = SUM(ticket_line_items.line_total) WHERE item_type = 'part'
services_revenue    = SUM(ticket_line_items.line_total) WHERE item_type = 'service'
```

`first_completed_at` comes from `lib/reporting/first-completed.ts` (`research.md` §1) —
joined once per ticket, not recomputed per aggregate row.

### Export (spec.md Key Entity)

Not persisted — a CSV or PDF byte stream generated on-demand from either a Filter
Selection's matching tickets (list export) or a Summary Report's computed aggregates
(summary export), per `contracts/board-reporting-api.md`.

### Consolidated Audit Trail (spec.md: part of Ticket Detail View, FR-011/FR-012)

A merged, chronologically-sorted view assembled from:
- `003`'s `status_history` (status changes)
- `004`'s `ticket_line_items` insert/delete events (parts/services applied — timestamped
  via each row's own `created_at`; there's no separate "line item audit log" since the
  rows themselves, being append-only per `004`'s design, already serve as their own trail)
- `005`'s `notifications`, `otp_verifications`, `delivery_overrides` (notification sends,
  OTP attempts, override records)

Assembled in `lib/audit/consolidated-trail.ts` as a read-time merge (`UNION ALL` across
the four sources, ordered by timestamp) — not a separate stored audit table, since every
underlying event is already immutably recorded by its owning feature (satisfying SC-005's
"no gaps" by construction: this view can only show what those tables already contain,
never less).

## Relationships (read-only, from this feature's perspective)

```text
tickets (003) ──┬─< status_history (003)
                ├─< ticket_line_items (004)
                ├─< notifications (005)
                ├─< otp_verifications (005)
                └─< delivery_overrides (005)
users (002) ─────── actor references throughout, resolved to display names
stores (007) ────── store_id → store name/tax_rate for scoping and reporting
```

No new foreign keys are created — every relationship above already exists from the owning
feature's own schema.
