import { db } from "@/lib/db/client";
import { stores, users, userStores } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/auth.config";

let counter = 0;

export async function createStore(name?: string): Promise<{ id: string; name: string }> {
  counter += 1;
  const [store] = await db
    .insert(stores)
    .values({ name: name ?? `Test Store ${counter}` })
    .returning();
  return store;
}

export async function createUser(opts: {
  email?: string;
  password?: string;
  name?: string;
  role?: "super_admin" | "admin" | "service_manager";
  active?: boolean;
  storeIds?: string[];
}): Promise<{ id: string; email: string; password: string }> {
  counter += 1;
  const email = opts.email ?? `user${counter}@example.com`;
  const password = opts.password ?? "CorrectHorseBattery1!";
  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(users)
    .values({
      name: opts.name ?? `Test User ${counter}`,
      email,
      passwordHash,
      role: opts.role ?? "service_manager",
      active: opts.active ?? true,
    })
    .returning();

  for (const storeId of opts.storeIds ?? []) {
    await db.insert(userStores).values({ userId: user.id, storeId });
  }

  return { id: user.id, email, password };
}
