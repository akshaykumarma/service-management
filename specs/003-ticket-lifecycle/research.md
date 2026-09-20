# Phase 0 Research: Ticket Intake, History Lookup & Status Lifecycle

No `NEEDS CLARIFICATION` markers remain — all items below were resolved during planning.
Language/framework/database were already fixed by `002-auth-rbac`'s plan and are not
revisited here.

## 1. Collision-free ticket ID generation under concurrent creation

**Decision**: A dedicated `ticket_number_counters` table (`store_id`, `year`, `seq`),
incremented via a single atomic upsert per creation:
`INSERT ... ON CONFLICT (store_id, year) DO UPDATE SET seq = ticket_number_counters.seq + 1
RETURNING seq`. The ticket ID is formatted from the returned `seq` as
`SVC-{year}-{seq zero-padded to 5 digits}`.

**Rationale**: spec.md's own edge case ("What happens if two tickets are created for the
same store in the same second?") requires zero collisions. A single atomic SQL statement
guarantees this without application-level locking, retry loops, or a distributed lock —
the database's own row-level locking on the upsert serializes concurrent increments for
free.

**Alternatives considered**:
- **Read-then-write (`SELECT MAX(seq)`, then `INSERT seq+1`)** — rejected: a classic
  race condition between the read and the write under concurrent requests; would need
  a transaction-level `SELECT ... FOR UPDATE` to be safe, which is strictly more complex
  than the single-statement upsert for no benefit.
- **UUID or random ticket IDs** — rejected: spec.md's format (`SVC-{YYYY}-{5-digit
  sequence}`) is a business requirement, not a technical detail up for revision.

## 2. Concurrency control on `tickets.status` (FR-019)

**Decision**: Plain `UPDATE tickets SET status = ... WHERE id = ...` with **no** optimistic
concurrency check (no `version` column, no `WHERE status = <expected-previous>` guard).
Every status-change request also unconditionally inserts a `status_history` row.

**Rationale**: This spec's own clarification (FR-019) explicitly requires last-write-wins:
the second concurrent change becomes the current status, and both are preserved in history.
Optimistic locking would do the opposite — reject the second write as a conflict — which is
a reasonable pattern in general but would directly violate this spec's resolved behavior.
This is flagged explicitly (also in `plan.md`'s Constitution Check) because optimistic
locking is common enough that an implementer might add it by habit.

**Alternatives considered**:
- **Optimistic locking (version column or conditional `WHERE`)** — rejected per FR-019, as above.
- **Row-level pessimistic lock (`SELECT ... FOR UPDATE`) held across the whole request** —
  rejected: would serialize concurrent updates into a queue rather than letting the second
  one simply win immediately, adding latency for no behavior spec.md asks for.

## 3. Customer identity storage (FR-020)

**Decision**: A `customers` table keyed by a unique `phone` column. On ticket creation:
find-or-create by phone, then unconditionally update the matched (or new) customer's `name`
to the value entered on this ticket. The ticket itself still stores its own `customer_name`
and `customer_phone` columns as entered at intake time (not a foreign-key-only reference) —
this is what `006-dashboard-reporting`'s Customer Name filter searches, per that spec's own
clarification.

**Rationale**: Directly implements FR-020 and keeps this ticket's historical display
immutable (never retroactively changed by a later name correction), while still giving
`customers.phone` a single canonical identity for any future cross-ticket customer-level
feature.

**Alternatives considered**:
- **No separate `customers` table; ticket fields only** — rejected: this is exactly what
  FR-020 overrides; a phone number must resolve to one reusable identity.
- **Ticket stores only a `customer_id` FK, name looked up live from `customers`** —
  rejected: would make a ticket's displayed name silently change after a later correction,
  contradicting `006-dashboard-reporting`'s explicit resolution that ticket-level name search
  uses the ticket's own historical value, not the live customer record.

## 4. Intake photo storage

**Decision**: Self-hosted **MinIO** (S3-compatible object storage), added as a
`docker-compose.yml` service. The client requests a presigned upload URL from
`POST /api/tickets/photo-upload-url`, uploads the file directly to MinIO, then submits the
resulting object key(s) with ticket creation. Only object keys are stored in Postgres
(`ticket_photos` table), never image bytes.

**Rationale**: spec.md defers storage mechanics to `/speckit-plan`. The source PRD §11
names "AWS S3 or self-hosted MinIO" as the intended pattern; since the constitution commits
this project to self-hosted deployment, MinIO is the natural fit and needs no external
account. The presigned-URL pattern (also named in PRD §11) keeps large file uploads off the
Next.js server's own request path.

**Alternatives considered**:
- **Store images directly in Postgres (bytea)** — rejected: poor fit for binary blobs at
  this volume (up to 5 × 5MB per ticket, ~1,000 tickets/store/month), bloats database
  backups unnecessarily.
- **Direct-to-server multipart upload (no object storage)** — rejected: ties file storage
  to a single app server's local disk, incompatible with the constitution's scalability
  target (≥10 stores) and complicates backups.

## 5. Photo validation limits

**Decision**: Enforce JPEG/PNG only, max 5MB per file, max 5 files per ticket — both at
presigned-URL issuance (reject unsupported content-type/size upfront) and re-validated
server-side once the object exists (reject and delete on mismatch).

**Rationale**: This limit is in the source PRD (§6.2.2) even though spec.md's FR-004 only
states the count limit, not size/type. Since intake photos are a real storage-cost and
abuse vector (arbitrary large uploads), this plan carries the PRD's original limit forward
as a technical constraint, consistent with the constitution's OWASP Top-10 baseline.

**Alternatives considered**:
- **No size/type limit, rely on FR-004's count limit alone** — rejected: an unbounded file
  size on an otherwise-legitimate upload path is exactly the kind of gap OWASP Top-10
  (resource exhaustion) flags.

## 6. History-lookup query shape

**Decision**: A single indexed query: `SELECT ... FROM tickets WHERE machine_model = $1 AND
status IN ('completed', 'delivered') AND (store_id = $2 OR $3 = true) ORDER BY created_at
DESC`, where `$2`/`$3` encode the caller's role-based scope (own store only, or "all
stores" for Admin/Super Admin) — composed in `lib/tickets/history.ts`, not left to
route-level ad-hoc filtering.

**Rationale**: Keeps SC-002 ("under 30 seconds," effectively instant) trivially achievable
via a single composite index on `(machine_model, status, store_id)`, and centralizes the
role-scoping logic (FR-008) in one tested function rather than duplicating it per call site.

**Alternatives considered**:
- **Fetch all matching-model tickets, filter by scope in application code** — rejected:
  pulls unnecessary rows over the wire (especially for Admin/Super Admin's cross-store
  case at scale) and duplicates the scoping decision outside the database.
