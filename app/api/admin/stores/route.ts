import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { requireAdminOrAbove, AccessDeniedError } from "@/lib/auth/rbac";
import { createStore, listStores } from "@/lib/admin/stores";
import type { stores } from "@/lib/db/schema";

const REQUIRED_FIELDS = ["name", "storeCode", "address", "primaryContact", "whatsappNumber"] as const;

function serializeStore(row: typeof stores.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    storeCode: row.storeCode,
    address: row.address,
    primaryContact: row.primaryContact,
    whatsappNumber: row.whatsappNumber,
    taxRate: Number(row.taxRate),
    active: row.active,
  };
}

export async function GET(request: NextRequest) {
  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  try {
    requireAdminOrAbove(sessionOrResponse.user);
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: { code: "forbidden", message: err.message } }, { status: 403 });
    }
    throw err;
  }

  // Unlike GET /api/stores (any authenticated role, active-only, intake dropdown), this
  // is the admin console's own management list: every store, active or not.
  const rows = await listStores();
  return NextResponse.json({ stores: rows.map(serializeStore) });
}

export async function POST(request: NextRequest) {
  const csrfResponse = requireSameOrigin(request);
  if (csrfResponse) return csrfResponse;

  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  try {
    requireAdminOrAbove(sessionOrResponse.user);
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: { code: "forbidden", message: err.message } }, { status: 403 });
    }
    throw err;
  }

  const payload = await request.json();

  for (const field of REQUIRED_FIELDS) {
    if (!payload[field] || typeof payload[field] !== "string" || payload[field].trim() === "") {
      return NextResponse.json({ error: { code: "missing_required_field", field } }, { status: 400 });
    }
  }

  const result = await createStore({
    name: payload.name,
    storeCode: payload.storeCode,
    address: payload.address,
    primaryContact: payload.primaryContact,
    whatsappNumber: payload.whatsappNumber,
    // Optional (per direct product feedback): tax is now set and edited per-ticket
    // (tickets.tax_rate, defaulting to 0%), not fixed at the store level, so this is no
    // longer a mandatory setup step.
    taxRate: payload.taxRate ?? 0,
  });

  if ("error" in result) {
    const status = result.error === "store_code_already_registered" ? 409 : 400;
    return NextResponse.json({ error: { code: result.error } }, { status });
  }

  return NextResponse.json({ store: serializeStore(result.store) }, { status: 201 });
}
