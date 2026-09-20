import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { requireSuperAdmin, AccessDeniedError } from "@/lib/auth/rbac";
import { createService, listActiveServices } from "@/lib/catalogue/services";

function serializeService(service: { id: string; name: string; description: string | null; unitCost: string; active: boolean }) {
  return {
    id: service.id,
    name: service.name,
    description: service.description,
    unitCost: Number(service.unitCost),
    active: service.active,
  };
}

export async function GET(request: NextRequest) {
  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  const rows = await listActiveServices();
  return NextResponse.json({ services: rows.map(serializeService) });
}

export async function POST(request: NextRequest) {
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

  const { name, description, unitCost } = await request.json();
  const result = await createService({ name, description, unitCost });

  if ("error" in result) {
    return NextResponse.json({ error: { code: result.error } }, { status: 400 });
  }

  return NextResponse.json({ service: serializeService(result.service) }, { status: 201 });
}
