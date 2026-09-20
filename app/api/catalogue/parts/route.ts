import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { requireSuperAdmin, AccessDeniedError } from "@/lib/auth/rbac";
import { createPart, listActiveParts } from "@/lib/catalogue/parts";

function serializePart(part: { id: string; name: string; sku: string | null; unitCost: string; category: string | null; active: boolean }) {
  return {
    id: part.id,
    name: part.name,
    sku: part.sku,
    unitCost: Number(part.unitCost),
    category: part.category,
    active: part.active,
  };
}

export async function GET(request: NextRequest) {
  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  const rows = await listActiveParts();
  return NextResponse.json({ parts: rows.map(serializePart) });
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

  const { name, sku, unitCost, category } = await request.json();
  const result = await createPart({ name, sku, unitCost, category });

  if ("error" in result) {
    const status = result.error === "duplicate_name" ? 409 : 400;
    return NextResponse.json({ error: { code: result.error } }, { status });
  }

  return NextResponse.json({ part: serializePart(result.part) }, { status: 201 });
}
