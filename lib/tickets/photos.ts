import { randomUUID } from "crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
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
