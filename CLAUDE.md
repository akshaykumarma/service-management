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

## Owner decisions to keep

- **The WhatsApp message log is permanent** (owner, 2026-10-19): every WhatsApp message's
  full text stays in each service and demo ticket's Activity and in Super Admin → Login &
  activity. OTP codes are always shown redacted there.
