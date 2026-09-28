# Shubha Sewing — design export

This directory holds a design-tool export (Claude Design canvas), not application
source code — kept here for reference. Unlike the storefront concept below, the internal
staff-app concept (`service-desk.dc.html` / `service-desk-v2.dc.html`) **has** been
implemented as real changes to the Next.js app — see "Implementation status" below.

- `site/index.html` — standalone, self-contained HTML/CSS/JS prototype. Open it directly
  in a browser (no build step). Covers five customer-facing storefront views: Home, Shop,
  Service, About, Sign in. See `design-notes.md` for what's real vs. illustrative
  (placeholder prices, demo product photography, etc.) and open items for the client.
  Not implemented in the app.
- `site/*.dc.html` — the design tool's own editable canvas format, kept alongside
  `support.js` which they depend on to render:
  - `service-desk.dc.html` — the first internal-staff-app redesign concept (flat
    gray/red/black "minimal SaaS" look).
  - `service-desk-v2.dc.html` — a later iteration of the same concept (Plus Jakarta Sans,
    a dark purple/gradient sidebar, glowing gradient CTAs, board KPI tiles, richer card
    shadows). **This is the version actually implemented** in `app/globals.css`,
    `app/(dashboard)/nav-header.tsx`, and `app/(dashboard)/board/page.tsx`.
  - `shubha-sewing.dc.html`, `product-card.dc.html` — the customer storefront concept
    above. Not implemented.
- `sync-notes.md` — the design tool's own record of which repo files each screen concept
  maps to, as of its last sync.

## Implementation status (internal staff app only)

Both `service-desk.dc.html` and its v2 revision were built into the real app's shared
design tokens/components (`app/globals.css`, `app/(dashboard)/nav-header.tsx`,
`app/(dashboard)/board/page.tsx`), which is why Team/Stores/Machine models/Catalogue/
Reports/ticket detail all picked up each pass automatically — they share the same
`main > section` / `form` / button styles rather than needing per-page changes. Known,
deliberate gaps between the mocks and the real app (kept to avoid touching working,
tested behavior for a visual-only pass):

- Ticket detail stays a full page at `/tickets/[id]`, not the mock's right-side slide-over
  panel.
- Board cards don't show a store name or technician avatar — that data isn't in the
  board API's card shape; adding it needs a schema/API change, not just a restyle.
- The login screen's decorative right-hand hero panel (ticket-preview cards / gradient
  scene) was skipped both times — the shared `AuthLayout` covers login, forgot-password,
  and reset-password, and building a real per-screen split layout for one screen's
  decorative flourish wasn't worth the churn. The updated colors/typography/button
  treatment were still applied to the existing single-column layout.
- The board KPI row (Active tickets / In progress / Ready for pickup / Waiting 7+ days)
  is computed client-side from the same already-fetched, already-scoped ticket list the
  columns render — no new endpoint.
