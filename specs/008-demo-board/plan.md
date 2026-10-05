# Implementation Plan: Demo Board & Demo Tickets

**Branch**: `claude/zen-shannon-4v50b8` | **Date**: 2026-10-05 | **Spec**: [spec.md](./spec.md)

## Summary

Add demo tickets as a separate entity alongside service tickets: their own tables, ticket
numbers, five-status state machine and API (`/api/demo-tickets/*`), a "Demo services" catalogue
list, and a Demo Board that reuses the Service Board UI by turning the board page into a
configurable component. New Ticket gains a Service/Demo switch with a live serial/invoice history
check. Assigning a technician queues a WhatsApp message (existing pg-boss queue + client) with a
short `/t/{code}` link.

## Technical Context

**Language/Version**: TypeScript 5, Node 20 · **Framework**: Next.js 14 App Router
**Storage**: PostgreSQL via Drizzle ORM (one new migration)
**Jobs/Notifications**: pg-boss `send-whatsapp-message` queue → `lib/whatsapp/client.ts` (mock in dev/test)
**Testing**: Vitest integration/contract tests against a real Postgres; Playwright e2e
**Constraints**: CSRF same-origin check on every mutation; store scoping via `lib/auth/rbac.ts`;
API p95 < 500 ms (single indexed queries, no N+1).

## Constitution Check

| Principle | How this feature complies |
|---|---|
| I. Test-First | Contract/integration tests for every new route and the state machine are part of each task group (tasks.md). |
| II. Simplicity/YAGNI | No generic "ticket kind" abstraction in the data layer; one shared board **component** because two concrete boards now need it. |
| III. Contract-First | `contracts/demo-tickets-api.md` defines every route before code. |
| IV. Security/Observability | Same session, CSRF, RBAC and store-scope checks as service routes; out-of-scope = 404; mutations audit-logged; WhatsApp sends recorded in `notifications`. |
| Domain: explicit state machine | `lib/demo/status-transitions.ts` enumerates every allowed move (data-model.md). |
| Domain: attributable, append-only history | `demo_ticket_status_history` + `audit_log`. |

No violations; Complexity Tracking not needed.

## Project Structure

```
lib/db/schema.ts                         + demo tables, users.phone, notifications.demo_ticket_id
lib/db/migrations/0015_*.sql             generated migration
lib/demo/                                 status-transitions, ticket-number, history, query, create,
                                          edit-details, assign (incl. WhatsApp), activity, short-code
lib/catalogue/demo-services.ts           mirrors lib/catalogue/services.ts
app/api/demo-tickets/**                  routes per contract
app/api/catalogue/demo-services/**       catalogue routes
app/t/[code]/route.ts                    short link redirect
components/ticket-board.tsx              board UI extracted from app/(dashboard)/board/page.tsx
app/(dashboard)/board/page.tsx           Service Board = <TicketBoard config={service}>
app/(dashboard)/demo-board/page.tsx      Demo Board  = <TicketBoard config={demo}>
app/(dashboard)/demo-tickets/[id]/page.tsx  demo ticket page
app/(dashboard)/tickets/new/page.tsx     Service/Demo switch + demo form
app/(dashboard)/admin/catalogue/page.tsx + Demo services section
app/(dashboard)/team/*                   + WhatsApp number field
app/(auth)/login/page.tsx                honour a safe relative `next`
```

## Key design notes

- **Received date** reuses `lib/tickets/received-date.ts`; demo date is a plain date validated
  against it.
- **Board config** carries: API base, detail-page base, columns, status tiles, labels, cancelled
  status, and error messages. Behaviour (filters, tiles, DnD, polling, list view) is shared code.
- **Completed-this-month rule** mirrors the Service Board's Delivered rule, using the latest
  `→ completed` status-history row.
- **WhatsApp**: `jobs/send-whatsapp-message.ts` gains `demoTicketId` and the `demo_assignment`
  type; content is a fixed string (like the invoice message), not an admin-editable template.
