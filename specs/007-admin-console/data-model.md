# Phase 1 Data Model: Machine Model & Store Administration Console

## Entities

### `stores` (spec.md: Store) — **existing table, altered by this feature**

| Field | Type | Constraints | Owner |
|---|---|---|---|
| `id` | uuid | PK | pre-existing (created by `003`'s stub) |
| `name` | text | required | pre-existing (or added here if the stub lacked it) |
| `address` | text | required | **added by this feature** |
| `primary_contact` | text | required | **added by this feature** |
| `whatsapp_number` | text | required for `active = true` (FR-007) — display/contact value only, see `research.md` §4 | **added by this feature** |
| `tax_rate` | numeric(5,2) | required, `0 <= tax_rate <= 100`, default `0` | **added by this feature** |
| `active` | boolean | default `true` | **added by this feature** |
| `created_at` / `updated_at` | timestamptz | required | **added by this feature** |

**Validation rules**:
- `whatsapp_number` format-validated (E.164-style) before `active` can be set `true`
  (FR-007) — not validated against Meta's API (`research.md` §4).
- Deactivating (`active = false`) never touches `user_stores` rows referencing this store
  (FR-012) — enforced by simply not including any `user_stores` write in the
  deactivate/reactivate code path at all, rather than a rule that could be violated by a
  future change; there is no code path that writes to `user_stores` from this table's
  own active/inactive toggle.
- This table's `id` and any pre-existing columns are untouched by this feature's
  migration — only new columns are added (`research.md` §1).

### `machine_models` (spec.md: Machine Model) — **new table**

| Field | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `name` | text | required, unique among active rows — the sole identifying value (this spec's clarification: same as `003`'s "machine model number") |
| `manufacturer` | text | required |
| `category` | text | optional, free-form (spec.md Assumptions) |
| `active` | boolean | default `true` |
| `created_at` / `updated_at` | timestamptz | required |

**Validation rules**:
- No FK from `tickets.machine_model` to this table, and none added by this feature
  (`research.md` §2) — `003`'s free-text fallback remains fully unconstrained.
- Deactivation only, consistent with `004`'s precedent for catalogue entries — no delete
  endpoint.

## Relationships

```text
stores (1) ───< user_stores (from 002) >─── (N) users     [assignment; unaffected by stores.active]
stores (1) ───< tickets (from 003)                         [store_id FK, pre-existing]
machine_models — no FK relationship to tickets (informational/selection-list only)
```

## State Transitions

**Store**: `active ⇄ inactive`, Super-Admin-only (FR-005). Neither direction writes to
`user_stores` (FR-012) — this is the entire mechanism by which assignment persistence is
guaranteed; there's no separate "preserve assignment" step because nothing ever removes it.

**Machine Model**: `active ⇄ inactive`, Super-Admin-only (FR-001). No other lifecycle.
