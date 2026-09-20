import bcrypt from "bcrypt";

export const BCRYPT_COST = 12;

export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_COST);
}

export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

export function generateTemporaryPassword(): string {
  // 16 random bytes, base64url-encoded, trimmed to a readable length — a one-time
  // system-generated credential relayed by the Super Admin (contracts/auth-api.md).
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url").slice(0, 20);
}
