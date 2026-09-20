import { randomUUID } from "crypto";
import { PutObjectCommand, HeadObjectCommand, DeleteObjectCommand, NotFound } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, BUCKET } from "@/lib/storage/minio-client";

export const SUPPORTED_CONTENT_TYPES = ["image/jpeg", "image/png"] as const;
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB, research.md §5
export const MAX_PHOTOS_PER_TICKET = 5; // FR-004

const UPLOAD_URL_EXPIRY_SECONDS = 300;

export type PhotoValidationError = "unsupported_content_type" | "file_too_large";

export function validatePhoto(contentType: string, sizeBytes: number): PhotoValidationError | null {
  if (!SUPPORTED_CONTENT_TYPES.includes(contentType as (typeof SUPPORTED_CONTENT_TYPES)[number])) {
    return "unsupported_content_type";
  }
  if (sizeBytes > MAX_FILE_SIZE_BYTES) {
    return "file_too_large";
  }
  return null;
}

export async function issueUploadUrl(
  contentType: string,
): Promise<{ uploadUrl: string; objectKey: string; expiresInSeconds: number }> {
  const objectKey = `intake/${randomUUID()}`;
  const command = new PutObjectCommand({ Bucket: BUCKET, Key: objectKey, ContentType: contentType });
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: UPLOAD_URL_EXPIRY_SECONDS });
  return { uploadUrl, objectKey, expiresInSeconds: UPLOAD_URL_EXPIRY_SECONDS };
}

export interface UploadedObjectMeta {
  contentType: string;
  sizeBytes: number;
}

/**
 * research.md §5: a presigned PUT URL constrains the signed Content-Type header but not
 * the actual body size, so the limits enforced at issueUploadUrl() time are re-checked
 * here against what was *actually* uploaded, once the object exists. A mismatch deletes
 * the object rather than trusting client-declared metadata for what gets persisted.
 */
export async function verifyUploadedObject(
  objectKey: string,
): Promise<{ ok: true; meta: UploadedObjectMeta } | { ok: false; error: PhotoValidationError | "object_not_found" }> {
  let head;
  try {
    head = await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: objectKey }));
  } catch (err) {
    if (err instanceof NotFound) return { ok: false, error: "object_not_found" };
    throw err;
  }

  const contentType = head.ContentType ?? "";
  const sizeBytes = head.ContentLength ?? 0;
  const validationError = validatePhoto(contentType, sizeBytes);

  if (validationError) {
    await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: objectKey }));
    return { ok: false, error: validationError };
  }

  return { ok: true, meta: { contentType, sizeBytes } };
}
