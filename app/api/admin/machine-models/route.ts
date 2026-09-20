import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { requireSuperAdmin, AccessDeniedError } from "@/lib/auth/rbac";
import { createMachineModel, listActiveMachineModels } from "@/lib/admin/machine-models";

function serializeMachineModel(row: { id: string; name: string; manufacturer: string; category: string | null; active: boolean }) {
  return { id: row.id, name: row.name, manufacturer: row.manufacturer, category: row.category, active: row.active };
}

export async function GET(request: NextRequest) {
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

  const rows = await listActiveMachineModels();
  return NextResponse.json({ machineModels: rows.map(serializeMachineModel) });
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

  const { name, manufacturer, category } = await request.json();
  const result = await createMachineModel({ name, manufacturer, category });

  if ("error" in result) {
    return NextResponse.json({ error: { code: result.error } }, { status: 409 });
  }

  return NextResponse.json({ machineModel: serializeMachineModel(result.machineModel) }, { status: 201 });
}
