import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
// @ts-expect-error -- s3rver ships no types
import S3rver from "s3rver";

const PORT = 4569;
const BUCKET = "intake-photos";

export default async function setup() {
  const directory = mkdtempSync(path.join(tmpdir(), "s3rver-"));
  const instance = new S3rver({
    port: PORT,
    address: "localhost",
    silent: true,
    directory,
    configureBuckets: [{ name: BUCKET }],
  });

  await instance.run();

  process.env.MINIO_ENDPOINT = `http://localhost:${PORT}`;
  process.env.MINIO_ACCESS_KEY = "S3RVER";
  process.env.MINIO_SECRET_KEY = "S3RVER";
  process.env.MINIO_BUCKET = BUCKET;

  return async function teardown() {
    await new Promise<void>((resolve, reject) => {
      instance.close((err: Error | null) => (err ? reject(err) : resolve()));
    });
  };
}
