# Shubha Sewing — design export

This directory holds a design-tool export (Claude Design canvas), not application
source code. It has not been wired into the Next.js app in this repo.

- `site/index.html` — standalone, self-contained HTML/CSS/JS prototype. Open it directly
  in a browser (no build step). Covers five customer-facing storefront views: Home, Shop,
  Service, About, Sign in. See `design-notes.md` for what's real vs. illustrative
  (placeholder prices, demo product photography, etc.) and open items for the client.
- `site/*.dc.html` — the design tool's own editable canvas format (`service-desk.dc.html`,
  `shubha-sewing.dc.html`, `product-card.dc.html`), kept alongside `support.js` which they
  depend on to render. `service-desk.dc.html` is a redesign concept for this repo's actual
  internal staff app (board/tickets/team/stores/etc, see `sync-notes.md`'s screen map);
  the other two are the customer storefront concept above.
- `sync-notes.md` — the design tool's own record of which repo files each screen concept
  maps to, as of its last sync.

None of this has been implemented as real changes to `app/`, `lib/`, or any other
application code — it's a design reference for a future implementation pass.
