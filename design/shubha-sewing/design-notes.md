# Shubha Sewing — UI concept 01

Open index.html in a browser. Five responsive views: Home, Shop, Service, About, Sign in. Use header links to switch pages.

## Design direction
Warm white #FAF9F6, charcoal #242522, muted grey #696A63, accent red #BD281B, sand #EEEBE4. Arial body and headings, Georgia italic for editorial emphasis. Restrained borders and square buttons. The supplied logo is preserved with transparency; the supplied hero is used without modifying the asset.

## Review and handoff
- Desktop: review at 1440px. Mobile: review at 390px. Main breakpoint: 800px.
- Product grid: three desktop columns, two mobile columns; mobile category navigation scrolls horizontally.
- Navigation, category selection, search, sorting, concept bag count, password visibility and form validation are interactive.
- Forms do not transmit or persist any information. Authentication, cart/checkout pages, account creation and password recovery are outside these five screens.
- All prices are illustrative, not verified product prices. Product models are from the old website. EM-1010 uses the supplied hero as a placeholder, not verified model photography.
- Other product images are loaded from the image URLs found on the existing website and require internet access. Missing images show a placeholder.
- Service offerings and editorial copy are proposed. Client must verify offerings before production. Locations derive from the old homepage and require reconfirmation. About story needs final client copy.
- The supplied logo PNG should be checked in-browser because the attachment preview does not render its transparency reliably.
- This is an HTML/CSS UI prototype, not an editable native Figma file. Layout, styles and behaviour are available in index.html for developer reference.

## Next design review
Approve homepage hierarchy, logo scale, typography and colour restraint. Then refine real catalogue photography, service copy and company story within the same component system.

## Homepage video refinement
- Added only the Watch & Learn section after the existing support/value band and before the unchanged footer and its closing links. No new sales CTA or changes to existing sections.
- Existing typography (Arial, occasional Georgia italic), palette, square image treatment, 64px/40px section padding, 20px grid gaps and 800px breakpoint retained. Three equal desktop columns; one mobile column. Small circular play affordance only; no card rounding or shadows.
- Edit `assets/videos-data.js` to replace demo records. Fields: `videoId`, `title`, `thumbnail`, `category`, optional `duration`, `youtubeUrl`, `source`, `demo`.
- The current three records are real third-party tutorials, explicitly marked as demo content. They are not the client's channel. Their original thumbnails are temporary and require internet access. Duration is omitted because it has not been verified.
- `assets/videos.js` exposes `renderStudioVideos(records)`. A developer can supply selected or latest records from a CMS/API adapter using the same shape; the first three valid records appear in source order. No channel API or auto-refresh has been connected.
- Set `demo: false` on real client videos; the preview note disappears once all displayed records are real content. Supply custom editorial thumbnails via `thumbnail` if available. Use a valid 11-character YouTube ID; a title is required. Optional category/duration can be blank.
- Invalid entries are omitted; an empty collection hides the section. Missing thumbnail uses the video's YouTube thumbnail; load failure preserves the neutral 16:9 frame, title and watch link. Titles/metadata are escaped; playback links are validated against the matching YouTube ID.
- Cards are keyboard-accessible native links and open YouTube in a new tab with accessible labels and noopener/noreferrer. No fake player, autoplay, iframe tracking or custom playback controls.
- Verified: loaded thumbnails; three equal columns at 1280px; stacked cards at 390px; 16:9 frames; no horizontal overflow; correct YouTube link destinations. Scope comparison confirms original HTML/CSS/JS is unchanged apart from stylesheet/script imports and the video section render call.

Demo sources:
- https://www.youtube.com/watch?v=5p617lj0pIs
- https://www.youtube.com/watch?v=f8LPyY0_ly0
- https://www.youtube.com/watch?v=eOu6bTQSv9U

## Current revision — client videos and visual refinement
This revision supersedes the earlier demo-video notes. The three featured videos now come from Shubha Enterprises (@shubhasewing), verified on its Videos page on 2026-09-15. Durations are verified; website display titles are shortened editorial summaries, with originals retained as sourceTitle. The collection remains manually curated, not a connected YouTube API feed.

Refinements preserve the original page structure, colour tokens, navigation destinations, grid columns, section padding and sans-serif/italic-serif pairing. A separate assets/refinement.css adjusts heading measures, letter spacing, secondary text, product image scale and purchase-row alignment. The repeated homepage support photograph now uses an intentional detail crop; its source asset is unchanged. The video introduction uses the existing two-column editorial alignment on desktop and stacks on mobile. A quiet More from the studio link opens the client channel.

Verified at desktop and 390px mobile: three client-video links, loaded thumbnails, demo note removed, stacked mobile cards, no horizontal overflow. Product prices remain illustrative as before. Original product photos and channel thumbnails still vary in quality; consistent high-resolution product photography and dedicated website video covers would have a greater visual impact than additional decorative UI.


## Current revision — client shop reference
Home and Shop now follow the supplied Shop Page.png: Shop Your Next Stitch hero, four original line SVG category icons on circular ivory backgrounds, a four-column/eight-item product presentation, subtly rounded white cards, pale cart buttons, wishlist toggles, and four icon-led benefits. Mobile categories and products use two columns; benefits use a two-by-two layout. Search/sort remain on Shop. Original client-video section and support band remain on Home. Service, About and Sign in page bodies were not redesigned. Existing logo, source hero image and brand palette are retained. The script hero accent uses Segoe Script where available and falls back to Brush Script MT/Georgia; the developer should choose a licensed cross-platform web font before final production.

Assets/reference-layout.js contains reusable SVG icons, category configuration and presentation functions. Assets/reference-layout.css contains scoped reference styles. Original routes and data filtering are reused. Wishlist and cart are session-only UI demos. Two models from the old catalogue (Brother JA-20 and Ricoma TC-8S Series) complete the eight-card composition; their prices, like the rest, are illustrative. EM-1010 now uses its old-site product photograph rather than the hero placeholder. Product imagery still loads from old-site URLs. The exact reference products are not assumed to be the current catalogue. No unverified founding date, free-shipping promise or warranty claim is added.

Verified: desktop visual alignment, two mobile product columns at 390px with no horizontal overflow, category filtering, search for Q5, wishlist toggle state and cart counter.
