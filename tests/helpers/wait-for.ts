/**
 * Polls `check` until it returns a truthy value or `timeoutMs` elapses — used for
 * asserting on the observable side effect of an async pg-boss job (a `notifications` row
 * appearing), never pg-boss's own internal job state.
 */
export async function waitFor<T>(
  check: () => Promise<T | undefined | null | false>,
  opts: { timeoutMs?: number; intervalMs?: number; message?: string } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const intervalMs = opts.intervalMs ?? 100;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const result = await check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(opts.message ?? `waitFor: condition not met within ${timeoutMs}ms`);
}
