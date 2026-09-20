import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export async function resetDb(): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE audit_log, password_reset_tokens, sessions, user_stores, users,
        ticket_photos, status_history, tickets, ticket_number_counters, customers, stores
        RESTART IDENTITY CASCADE`,
  );
}
