import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { requireSuperAdmin, AccessDeniedError } from "@/lib/auth/rbac";
import { updateService } from "@/lib/catalogue/services";

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
  const result = await updateService(params.id, patch);

  if ("error" in result) {
    const status = result.error === "not_found" ? 404 : 400;
    return NextResponse.json({ error: { code: result.error } }, { status });
  }

  return NextResponse.json({
    service: {
      id: result.service.id,
      name: result.service.name,
      description: result.service.description,
      unitCost: Number(result.service.unitCost),
      active: result.service.active,
    },
  });
}
