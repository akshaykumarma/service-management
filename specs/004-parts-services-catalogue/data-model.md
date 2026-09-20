# Phase 1 Data Model: Parts & Services Selection, Billing, and Catalogue Maintenance

## Entities

### `parts` (spec.md: Parts Catalogue Entry)

| Field | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | required, unique among active parts (research.md §4's dedup check) |
| `sku` | text | optional |
| `unit_cost` | numeric(12,2) | required, ≥ 0 |
| `category` | text | optional, free-form |
| `active` | boolean | default `true` (FR-012) |
| `created_at` / `updated_at` | timestamptz | required |

### `services` (spec.md: Services Catalogue Entry)

| Field | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | required |
| `description` | text | optional |
| `unit_cost` | numeric(12,2) | required, ≥ 0 |
| `active` | boolean | default `true` |
| `created_at` / `updated_at` | timestamptz | required |

**Validation rules (both tables)**:
- Global — no `store_id` column; every store reads the same rows (spec.md Assumptions,
  confirmed decision OQ-02).
- `unit_cost` uses `numeric(12,2)` per `research.md` §2 — never a floating-point column.
- Deactivation only (`active = false`); no delete endpoint (`research.md` §5).

### `ticket_line_items` (spec.md: Ticket Line Item)

| Field | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `ticket_id` | uuid | FK → `tickets.id` (owned by `003-ticket-lifecycle`, read/write from this feature) |
| `item_type` | enum(`part`, `service`) | required |
| `item_id` | uuid | references `parts.id` or `services.id` depending on `item_type` (application-enforced, not a single DB FK since it targets one of two tables) |
| `name_snapshot` | text | the catalogue item's name at selection time (FR-003) — survives even if the catalogue entry is later renamed |
| `quantity` | integer | required, > 0 (FR-002) |
| `unit_cost_snapshot` | numeric(12,2) | locked in at selection time (FR-004) — never re-read from the catalogue after insert |
| `line_total` | numeric(12,2) | `quantity * unit_cost_snapshot`, stored (not recomputed on every read) so a historical row is self-contained |
| `created_at` | timestamptz | required |

**Validation rules**:
- `quantity` rejects 0 and negative values at the application layer before insert (FR-002).
- Every field here is fixed at insert time; **no** field on an existing row is ever updated
  except via an explicit "change quantity" action (which recomputes `line_total` from the
  same `unit_cost_snapshot`, never re-reading the catalogue) — and only while the
  Completed-lock (below) does not apply.
- Insert/update/delete on this table is blocked application-side (not a DB constraint,
  since the rule depends on a cross-table check, not a static condition) once the
  Completed-lock condition is true for `ticket_id` — see `completed-lock.ts` in `plan.md`.

## Derived Concept: The Completed-Lock (FR-015)

Not a stored field. Computed as:

```sql
EXISTS (
  SELECT 1 FROM status_history
  WHERE ticket_id = $1 AND to_status = 'completed'
)
```

Read from `003-ticket-lifecycle`'s `status_history` table (read-only from this feature's
perspective — see `research.md` §1 for why no new column is added anywhere). Once true, it
is true forever for that ticket, since `status_history` is append-only and this check never
un-matches once a matching row exists.

## Derived Concept: Ticket Bill

Not a stored entity — computed on read (and included in ticket-detail/list responses) as:

```text
subtotal   = SUM(ticket_line_items.line_total WHERE ticket_id = $1)
tax_amount = subtotal * stores.tax_rate   -- current rate, read live (research.md §3)
total      = subtotal + tax_amount
```

Once the Completed-lock applies, `subtotal` stops changing (no more line-item writes are
possible), so `tax_amount`/`total` are effectively frozen too, without needing their own
lock flag.

## Relationships

```text
tickets (1, from 003) ───< ticket_line_items >─── (1) parts | services
stores (1, from 007) ──────────────────────────── read for tax_rate, referenced by tickets.store_id
```

## State Transitions

**Parts/services**: `active ⇄ inactive`, Super-Admin-only (FR-009). No other lifecycle.

**Ticket line items**: created → (optionally quantity-updated or removed) → **permanently
frozen** once the owning ticket's Completed-lock becomes true. No state field represents
this — it's the derived lock check applied as a guard before any write.
