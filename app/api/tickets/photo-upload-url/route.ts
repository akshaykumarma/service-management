import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/require-session";
import { requireSameOrigin } from "@/lib/auth/csrf";
import { validatePhoto, issueUploadUrl } from "@/lib/tickets/photos";

export async function POST(request: NextRequest) {
  const csrfResponse = requireSameOrigin(request);
  if (csrfResponse) return csrfResponse;

  const sessionOrResponse = await requireAuthenticatedSession(request);
  if (sessionOrResponse instanceof NextResponse) return sessionOrResponse;

  const { contentType, sizeBytes } = await request.json();

  const validationError = validatePhoto(contentType, Number(sizeBytes));
  if (validationError) {
    return NextResponse.json({ error: { code: validationError, message: validationError } }, { status: 400 });
  }

  const result = await issueUploadUrl(contentType);
  return NextResponse.json(result);
}
