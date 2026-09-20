import { S3Client } from "@aws-sdk/client-s3";

export const BUCKET = process.env.MINIO_BUCKET ?? "intake-photos";

/**
 * A plain S3-compatible client (research.md §4 — a later move to real AWS S3 needs no
 * code change). Points at self-hosted MinIO in production/dev, or a local `s3rver`
 * instance in this test suite (MinIO's own OSS server binaries were discontinued after
 * this feature's research.md was written — see tests/global-setup.ts for the substitute
 * used to actually exercise this client against a real S3-API server in this
 * environment; production docker-compose.yml still targets MinIO's own container image).
 */
export const s3Client = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT,
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? "",
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? "",
  },
  forcePathStyle: true,
});
