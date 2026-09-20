const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

interface AttemptRecord {
  failures: number;
  lockedUntil: number | null;
}

/**
 * In-memory per-email failed-attempt tracking. Sufficient for a single-process
 * self-hosted deployment (constitution's small-VPS target, no multi-instance requirement
 * for this feature); exported so tests can inspect/reset it directly.
 */
export const loginAttempts = new Map<string, AttemptRecord>();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isLocked(email: string): { locked: boolean; retryAfterSeconds: number } {
  const record = loginAttempts.get(normalizeEmail(email));
  if (!record || record.lockedUntil === null) return { locked: false, retryAfterSeconds: 0 };

  const remainingMs = record.lockedUntil - Date.now();
  if (remainingMs <= 0) {
    loginAttempts.delete(normalizeEmail(email));
    return { locked: false, retryAfterSeconds: 0 };
  }
  return { locked: true, retryAfterSeconds: Math.ceil(remainingMs / 1000) };
}

export function recordFailedAttempt(email: string): void {
  const key = normalizeEmail(email);
  const record = loginAttempts.get(key) ?? { failures: 0, lockedUntil: null };
  record.failures += 1;
  if (record.failures >= MAX_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_MS;
  }
  loginAttempts.set(key, record);
}

export function clearFailedAttempts(email: string): void {
  loginAttempts.delete(normalizeEmail(email));
}
