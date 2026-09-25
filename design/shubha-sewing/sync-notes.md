repo: akshaykumarma/service-management
branch: claude/speckit-installation-apij1s

## Last sync
date: 2026-09-25T06:13:52Z

### Updated in this project
- Redesigned the staff service app as a modern, light SaaS UI (Service Desk.dc.html)
- Board, ticket detail, new ticket, reports and login screens rebuilt from repo pages
- Status-transition rules ported from lib/tickets/status-transitions.ts
- Added Team, Stores, Machine models and Catalogue admin screens

## Screen map
| Screen | Repo files |
|---|---|
| Login | app/(auth)/login/page.tsx |
| App shell / nav | app/(dashboard)/nav-header.tsx, app/globals.css |
| Board | app/(dashboard)/board/page.tsx, lib/board/card-shape.ts |
| Ticket detail | app/(dashboard)/tickets/[id]/page.tsx, lib/tickets/status-transitions.ts |
| New ticket | app/(dashboard)/tickets/new/page.tsx |
| Reports | app/(dashboard)/reports/page.tsx |
| Team | app/(dashboard)/team/team-page-client.tsx |
| Stores | app/(dashboard)/admin/stores/stores-page-client.tsx |
| Machine models | app/(dashboard)/admin/(super-admin-only)/machine-models/page.tsx |
| Catalogue | app/(dashboard)/admin/(super-admin-only)/catalogue/page.tsx |
