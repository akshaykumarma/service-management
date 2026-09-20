# Phase 1 Data Model: Ticket Intake, History Lookup & Status Lifecycle

## Entities

### `tickets` (spec.md: Service Ticket)

| Field | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `ticket_number` | text | unique, immutable, format `SVC-{YYYY}-{5-digit}` (FR-005) |
| `store_id` | uuid | FK → `stores.id` (owned by `007-admin-console`; stub table created here if absent — see `plan.md`) |
| `customer_name` | text | required; as entered at *this* ticket's intake (FR-001) |
| `customer_phone` | text | required; as entered at *this* ticket's intake |
| `customer_alt_phone` | text | optional (FR-002) |
| `customer_id` | uuid | FK → `customers.id` — resolved at creation time (FR-020); never changes after creation even if `customers.phone` is later reused differently (accepted limitation, spec.md Assumptions) |
| `machine_model` | text | required (FR-001); **no FK** — free-text fallback is a hard requirement (FR-003), see `research.md` §1 |
| `issue_description` | text | required |
| `estimated_pickup_date` | date | optional (FR-002) |
| `status` | enum(`open`,`in_progress`,`on_hold`,`completed`,`delivered`,`cancelled`) | default `open` (FR-006, FR-010) |
| `created_by` | uuid | FK → `users.id` (from `002-auth-rbac`); immutable (FR-006) |
| `created_at` | timestamptz | immutable (FR-006) |
| `updated_at` | timestamptz | updated on every write |

**Validation rules**:
- `ticket_number` generation is atomic per `research.md` §1 — never assigned by the
  application reading-then-writing a max value.
- No optimistic-concurrency column on this table (`research.md` §2) — a plain `UPDATE`
  is correct and required by FR-019.
- `machine_model` accepts any text; a UI may suggest values from `007-admin-console`'s
  catalogue, but the database never rejects a value absent from it.

### `customers` (spec.md: Customer)

| Field | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `phone` | text | unique (FR-020's key) |
| `name` | text | overwritten on every ticket intake tied to this phone (FR-020) |
| `created_at` | timestamptz | required |
| `updated_at` | timestamptz | updated whenever `name` changes |

**Validation rules**:
- Find-or-create by `phone` happens inside the same transaction as ticket creation, so a
  ticket and its (possibly newly-created) customer record are consistent even under
  concurrent intake of two tickets for a never-before-seen phone number.

### `status_history` (spec.md: Status History Entry)

| Field | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `ticket_id` | uuid | FK → `tickets.id` |
| `from_status` | enum (same set as `tickets.status`) | nullable only for the initial `open` creation event |
| `to_status` | enum (same set as `tickets.status`) | required |
| `actor_id` | uuid | FK → `users.id` |
| `comment` | text | nullable; **required at the application layer** (not a DB constraint, since requiredness depends on the transition type — see below) for On Hold, Cancelled, and any backward transition (FR-012, FR-013, FR-014) |
| `created_at` | timestamptz | required, append-only |

**Validation rules**:
- Append-only — no updates or deletes, ever (constitution Technology & Domain
  Constraints: "history MUST be append-only").
- A row is inserted for **every** status-change request, including the second of two
  near-simultaneous ones (FR-019/SC-008) — this table is never itself the source of the
  "last write wins" resolution; `tickets.status` (simply overwritten in commit order) is.
- Comment requiredness (On Hold, Cancelled, any backward transition, and specifically any
  transition out of "Delivered") is enforced in `lib/tickets/status-transitions.ts` before
  the insert is attempted, not as a nullable-with-a-CHECK-constraint at the DB layer, since
  the rule depends on the transition pair, not a single column value.

### `ticket_photos` (spec.md: Intake Photo)

| Field | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `ticket_id` | uuid | FK → `tickets.id` |
| `object_key` | text | required — the MinIO object key; image bytes never touch Postgres |
| `content_type` | text | required; `image/jpeg` or `image/png` only (`research.md` §5) |
| `size_bytes` | integer | required; ≤ 5,242,880 (5MB) |
| `created_at` | timestamptz | required |

**Validation rules**:
- Application enforces max 5 rows per `ticket_id` (FR-004) at upload-URL issuance time,
  re-checked at ticket-creation time in case of a race between two upload requests.

### `ticket_number_counters` (implementation detail supporting FR-005)

| Field | Type | Constraints |
|---|---|---|
| `store_id` | uuid | part of composite PK |
| `year` | smallint | part of composite PK |
| `seq` | integer | last-issued sequence number for this store+year |

**Validation rules**:
- Only ever touched via the single atomic upsert in `research.md` §1 — no other code path
  reads or writes `seq`.

## Relationships

```text
stores (1) ───< tickets >─── (1) customers
tickets (1) ───< status_history
tickets (1) ───< ticket_photos
tickets (N) >─── (1) users [created_by, and status_history.actor_id]
stores (1) ───< ticket_number_counters [via store_id]
```

## State Transitions

**Ticket status** (spec FR-010, FR-011, FR-012, FR-013, FR-014, FR-018):

```text
Open ──────────► In Progress ──────────► On Hold ──────────► Completed ──────────► Delivered
  │                    │                     │                     │
  └────────────────────┴─────────────────────┴─────────────────────┴──► Cancelled
```

- Forward transitions along the top row: Service Manager or Admin, no comment required
  except entering On Hold (always requires a comment, regardless of direction).
- Any backward transition (moving left along the top row): Service Manager or Admin,
  comment required — **except** leaving "Delivered," which additionally requires
  Admin/Super Admin (Store Service Manager denied even with a comment — FR-018).
- Cancelled: reachable from any non-terminal status (Open, In Progress, On Hold); Admin or
  Super Admin only, comment required (FR-014); no transition out of Cancelled (spec.md
  Assumptions — a new ticket is created instead).
- Every arrow above is one `status_history` row; FR-019 governs what happens when two
  arrows are submitted for the same ticket at nearly the same time (last write to
  `tickets.status` wins; both rows recorded regardless).
