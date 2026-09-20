import "dotenv/config";
import { db, pool } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/auth.config";
import { eq } from "drizzle-orm";

async function main() {
  const email = process.argv[2] ?? process.env.SEED_SUPER_ADMIN_EMAIL;
  const password = process.argv[3] ?? process.env.SEED_SUPER_ADMIN_PASSWORD;
  const name = process.argv[4] ?? "Super Admin";

  if (!email || !password) {
    console.error(
      "Usage: npm run seed:super-admin -- <email> <password> [name]\n" +
        "(or set SEED_SUPER_ADMIN_EMAIL / SEED_SUPER_ADMIN_PASSWORD)",
    );
    process.exit(1);
  }

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    console.error(`A user with email ${email} already exists.`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const [created] = await db
    .insert(users)
    .values({
      name,
      email,
      passwordHash,
      role: "super_admin",
      active: true,
    })
    .returning({ id: users.id, email: users.email });

  console.log(`Seeded first Super Admin: ${created.email} (${created.id})`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
