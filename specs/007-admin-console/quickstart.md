# Quickstart: Validating Machine Model & Store Administration

Validation guide — see `data-model.md` and `contracts/admin-console-api.md` for exact
shapes. Assumes `002-auth-rbac` is running (this feature's `stores` table extends what
`003-ticket-lifecycle` already stubbed, so `003` should exist too for the tax-rate-flows-
into-billing check in Scenario 2 to be meaningful, though not strictly required to exercise
this feature's own CRUD).

## Scenario 1 — Machine model catalogue maintenance (User Story 1)

```bash
curl -b super-admin-cookies.txt -X POST http://localhost:3000/api/admin/machine-models \
  -d '{"name":"LG-FHM1207ZDL","manufacturer":"LG","category":"Washing Machine"}'
# Expect: 201

curl -b super-admin-cookies.txt -X POST http://localhost:3000/api/admin/machine-models \
  -d '{"name":"LG-FHM1207ZDL","manufacturer":"LG","category":"Washing Machine"}'
# Expect: 409 duplicate_name

curl -b super-admin-cookies.txt -X PATCH .../api/admin/machine-models/<id> -d '{"active": false}'
# Then confirm 003-ticket-lifecycle's intake dropdown no longer offers it, while an
# existing ticket already referencing it (by free-text match) is unaffected.
```

CSV import: submit a file with one valid row and one duplicate-of-existing row — expect
`{ "imported": 1, "failed": [{ "row": 2, "reason": "duplicate_name" }] }`.

**RBAC**: repeat the `POST` as Admin or Store Service Manager — expect `403`.

## Scenario 2 — Store setup flowing into billing (User Story 2)

```bash
curl -b super-admin-cookies.txt -X POST http://localhost:3000/api/admin/stores \
  -d '{"name":"Koramangala","address":"...","primaryContact":"...","whatsappNumber":"+91XXXXXXXXXX","taxRate":18.00}'
# Expect: 201, active: false

curl -b super-admin-cookies.txt -X PATCH .../api/admin/stores/<id> -d '{"active": true}'
# Expect: 200 (whatsappNumber already valid, so activation succeeds)

# Create a ticket at this store (003), apply a part (004), and confirm:
curl .../api/tickets/<ticket-id>
# Expect: bill.taxAmount = subtotal * 0.18
```

**Activation guard**: create a second store with `whatsappNumber: ""`, then attempt
`{"active": true}` — expect `409 whatsapp_number_required_to_activate`.

**Tax rate change propagation**: update the first store's `taxRate` to `12.00`, create a
*new* ticket there, apply a part — expect the new ticket's bill to use 12%, while the
earlier ticket's already-locked bill (per `004`'s Completed-lock, if applicable) is
unaffected.

## Scenario 3 — Admin assignment persists across deactivation (User Story 3 + FR-012)

```bash
curl -b super-admin-cookies.txt -X POST .../api/admin/stores/<id>/admins -d '{"userId":"<admin-user-id>"}'
# Then confirm (per 002-auth-rbac) that Admin's GET /api/auth/session now includes this store

curl -b super-admin-cookies.txt -X PATCH .../api/admin/stores/<id> -d '{"active": false}'
curl -b admin-cookies.txt .../api/auth/session
# Expect: storeIds STILL includes this store — deactivation didn't touch the assignment

curl -b super-admin-cookies.txt -X PATCH .../api/admin/stores/<id> -d '{"active": true}'
curl -b admin-cookies.txt .../api/auth/session
# Expect: storeIds still includes it, no re-assignment needed
```

This exact sequence is the most important thing to automate
(`tests/integration/admin-assignment-persistence.test.ts`) since it spans two features'
data (this one's `stores.active` toggle and `002`'s `user_stores` rows) and is easy to get
right in isolation but wrong in combination.

## Success criteria checklist (from spec.md)

- [ ] SC-001: Scenario 2 completes well under 10 minutes end-to-end
- [ ] SC-002: Scenario 2's tax-rate-propagation check passes
- [ ] SC-003: the deactivated model/store (Scenarios 1, 2) never appear in new-ticket selection
- [ ] SC-004: Scenario 1's CSV import reports the failed row with a specific reason
- [ ] SC-005: Scenario 3's assignment change is visible immediately (no delay/re-login needed, per `002`'s live-recheck FR-019)
- [ ] SC-006: Scenario 3 passes — assignment survives the full deactivate/reactivate cycle
