# Working agreement for Claude

## Delivering changes

- The default branch is `claude/speckit-installation-apij1s`; the running app is deployed from it.
- When a change is finished and its checks pass (typecheck, lint, tests), push the work
  branch, open a pull request into the default branch, and **merge it without asking
  for confirmation** — the repository owner has pre-approved this. Then tell the owner
  it's merged and remind them to redeploy.
- Still ask first before merging if checks are failing, the PR has a merge conflict,
  or a reviewer has requested changes.
- Design previews: when the owner asks to "show it before implementing", share the
  preview and wait for approval before building it.

## Before deploying to production (owner must confirm)

- **Remove the on-screen OTP test aid.** `SHOW_OTP_ON_SCREEN` (lib/delivery/otp-display.ts,
  the `testOtp` banner on the ticket page, docker-compose.yml, .env.example) shows the
  delivery OTP to staff, which defeats OTP verification. It was added at the owner's request
  for testing only. Before any production deployment, ask the owner to confirm, then remove
  the feature entirely (not just the flag).
- **Remove the WhatsApp message log from Super Admin → Login & activity.** It shows the full
  text of every WhatsApp message the app sends (kind `"message"` in lib/admin/activity-log.ts,
  the "WhatsApp messages only" filter and `.activity-message` text on the activity page, and
  `kind=message` in app/api/admin/activity/route.ts), and the same text on each service and
  demo ticket's Activity (the `detail` field in lib/audit/consolidated-trail.ts and
  lib/demo/activity.ts, rendered as `.activity-message` on both ticket pages). It was added at
  the owner's request for testing only. Before any production deployment, ask the owner to
  confirm, then remove it.

