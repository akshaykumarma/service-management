# Data Model: Demo Board & Demo Tickets (008)

All additions are new tables/columns via one Drizzle migration; no existing column changes type
and no service-ticket table gains demo rows (spec.md D1).

## New enum `demo_ticket_status`

`new`, `assigned`, `in_progress`, `completed`, `cancelled`

## New table `demo_services` (the Catalogue's "Demo services")

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text NOT NULL | |
| description | text NULL | |
| unit_cost | numeric(12,2) NOT NULL | ≥ 0, same validation as services |
| active | boolean NOT NULL default true | deactivate instead of delete |
| created_at / updated_at | timestamptz | |

## New table `demo_tickets`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| ticket_number | text NOT NULL UNIQUE | `{storeCode}-DEMO-{year}-{seq:05}` |
| store_id | uuid FK stores NOT NULL | store scoping |
| customer_id | uuid FK customers NOT NULL | same find-or-create-by-phone as service intake |
| customer_name / customer_phone | text NOT NULL | ticket's own snapshot |
| machine_model | text NOT NULL | "Model number" in the UI |
| serial_number | text NOT NULL | history key |
| invoice_number | text NOT NULL | history key |
| demo_service_id | uuid FK demo_services NOT NULL | |
| demo_service_name | text NOT NULL | snapshot at creation/edit |
| demo_service_price | numeric(12,2) NOT NULL | snapshot at creation/edit |
| demo_date | date NOT NULL | ≥ received date |
| status | demo_ticket_status NOT NULL default `new` | |
| assigned_technician_id | uuid FK users NULL | |
| short_code | text NOT NULL UNIQUE | 8 random base62 chars, for `/t/{code}` |
| created_by | uuid FK users NOT NULL | |
| created_at | timestamptz NOT NULL | the **received date** (back-datable, like service tickets) |
| updated_at | timestamptz NOT NULL | |

Indexes: `(store_id)`, `lower(trim(serial_number))`, `lower(trim(invoice_number))`.

## New table `demo_ticket_status_history` (append-only)

`id`, `demo_ticket_id` FK cascade, `from_status` NULL (creation), `to_status`, `actor_id` FK users,
`comment` NULL, `created_at`.

## New table `demo_ticket_number_counters`

`store_id` FK, `year` int, `seq` int; PK (`store_id`, `year`). Same atomic upsert as
`ticket_number_counters`.

## Changed: `users`

`+ phone text NULL` — the user's WhatsApp number (FR-011).

## Changed: `notifications`

- `+ demo_ticket_id uuid NULL` FK `demo_tickets` (cascade). A demo assignment message sets this and
  leaves `ticket_id` NULL.
- enum `notification_type` `+ 'demo_assignment'`.

## Audit

Detail edits and (re)assignments are written to the existing `audit_log` with
`entity_type = 'demo_ticket'` and actions `demo_ticket_details_updated` / `demo_ticket_assigned`
(before/after JSON). Status changes live in `demo_ticket_status_history`.

## State machine (FR-005)

```
new ──(assign technician)──▶ assigned ──▶ in_progress ──▶ completed
 ▲                              │  ▲            │              │
 └──(technician removed)────────┘  └─(comment)──┘◀──(comment)──┘
any of new/assigned/in_progress ──(comment, Admin+)──▶ cancelled (terminal)
```

- `→ assigned` only with a technician set; `→ new` only by removing the technician.
- Backward moves need a comment; `cancelled` needs a comment and Admin/Super Admin; `cancelled`
  is terminal; `new → in_progress/completed` and `assigned → completed` skip steps and are refused.
