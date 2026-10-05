import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pgPool?: Pool };

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  return url;
}

function getPool(): Pool {
  if (!globalForDb.pgPool) {
    globalForDb.pgPool = new Pool({ connectionString: requireDatabaseUrl() });
  }
  return globalForDb.pgPool;
}

/**
 * The pool is created on first use, not when this module loads: `next build` imports
 * every API route while "collecting page data" (e.g. inside the Docker build stage, which
 * has no DATABASE_URL), and must not need a database to do so. A missing DATABASE_URL
 * still fails loudly — on the first query at runtime. The proxy keeps Pool's prototype,
 * so `instanceof Pool` (which Drizzle uses to run transactions on a dedicated client)
 * still holds.
 */
export const pool: Pool = new Proxy(Object.create(Pool.prototype) as Pool, {
  get(_target, prop) {
    // Drizzle reads `constructor.name` at setup to tell a config object from a client;
    // answer that without creating the pool.
    if (prop === "constructor") return Pool;
    const real = getPool();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export const db = drizzle(pool, { schema });
