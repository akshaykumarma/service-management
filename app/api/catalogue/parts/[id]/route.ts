import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { requireSuperAdmin, AccessDeniedError } from "@/lib/auth/rbac";
import { updatePart } from "@/lib/catalogue/parts";

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
  const result = await updatePart(params.id, patch);

  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : result.error === "duplicate_name" ? 409 : 400;
    return NextResponse.json({ error: { code: result.error } }, { status });
  }

  return NextResponse.json({
    part: {
      id: result.part.id,
      name: result.part.name,
      sku: result.part.sku,
      unitCost: Number(result.part.unitCost),
      category: result.part.category,
      active: result.part.active,
    },
  });
}
