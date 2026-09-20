import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { requireSuperAdmin, AccessDeniedError } from "@/lib/auth/rbac";
import { updateStore } from "@/lib/admin/stores";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const csrfResponse = requireSameOrigin(request);
  if (csrfResponse) return csrfResponse;

  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  try {
    requireSuperAdmin(sessionOrResponse.user);
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: { code: "forbidden", message: err.message } }, { status: 403 });
    }
    throw err;
  }

  const patch = await request.json();
  const result = await updateStore(params.id, patch);

  if ("error" in result) {
    const status =
      result.error === "not_found" ? 404 : result.error === "whatsapp_number_required_to_activate" ? 409 : 400;
    return NextResponse.json({ error: { code: result.error } }, { status });
  }

  return NextResponse.json({
    store: {
      id: result.store.id,
      name: result.store.name,
      address: result.store.address,
      primaryContact: result.store.primaryContact,
      whatsappNumber: result.store.whatsappNumber,
      taxRate: Number(result.store.taxRate),
      active: result.store.active,
    },
  });
}
