import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { stores, users, userStores, tickets, customers } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/auth.config";

let counter = 0;

export async function createStore(
  nameOrOpts?:
    | string
    | { name?: string; active?: boolean; whatsappNumber?: string; address?: string; primaryContact?: string; taxRate?: string },
): Promise<typeof stores.$inferSelect> {
  counter += 1;
  const opts = typeof nameOrOpts === "string" ? { name: nameOrOpts } : (nameOrOpts ?? {});
  const [store] = await db
    .insert(stores)
    .values({
      name: opts.name ?? `Test Store ${counter}`,
      // Defaults to a usable, active store with a valid contact number: 007-admin-console
      // introduced active/whatsappNumber as real gates on store usability, but almost
      // every existing test across 002-006 just needs "a store that works" and predates
      // those gates existing at all — this keeps every one of them passing unchanged.
      active: opts.active ?? true,
      whatsappNumber: opts.whatsappNumber ?? "+910000000000",
      address: opts.address ?? "123 Test Street",
      primaryContact: opts.primaryContact ?? "Test Contact",
      ...(opts.taxRate !== undefined ? { taxRate: opts.taxRate } : {}),
    })
    .returning();
  return store;
}

export async function createUser(opts: {
  email?: string;
  username?: string;
  password?: string;
  name?: string;
  role?: "super_admin" | "admin" | "service_manager" | "technician";
  active?: boolean;
  storeIds?: string[];
}): Promise<{ id: string; email: string; username: string | null; password: string }> {
  counter += 1;
  const email = opts.email ?? `user${counter}@example.com`;
  const username = opts.username ?? null;
  const password = opts.password ?? "CorrectHorseBattery1!";
  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(users)
    .values({
      name: opts.name ?? `Test User ${counter}`,
      email,
      username,
      passwordHash,
      role: opts.role ?? "service_manager",
      active: opts.active ?? true,
    })
    .returning();

  for (const storeId of opts.storeIds ?? []) {
    await db.insert(userStores).values({ userId: user.id, storeId });
  }

  return { id: user.id, email, username, password };
}

export async function createTicket(opts: {
  storeId: string;
  createdBy: string;
  machineModel?: string;
  customerName?: string;
  customerPhone?: string;
  status?: "open" | "in_progress" | "on_hold" | "completed" | "delivered" | "cancelled";
  assignedTechnicianId?: string;
  serialNumber?: string;
}): Promise<{ id: string; ticketNumber: string }> {
  counter += 1;
  const phone = opts.customerPhone ?? `+91900000${String(counter).padStart(4, "0")}`;

  const existingCustomer = await db.select().from(customers).where(eq(customers.phone, phone)).limit(1);
  const customer =
    existingCustomer[0] ??
    (
      await db
        .insert(customers)
        .values({ name: opts.customerName ?? `Customer ${counter}`, phone })
        .returning()
    )[0];

  const [ticket] = await db
    .insert(tickets)
    .values({
      ticketNumber: `SVC-TEST-${counter}`,
      storeId: opts.storeId,
      customerName: opts.customerName ?? `Customer ${counter}`,
      customerPhone: phone,
      customerId: customer.id,
      machineModel: opts.machineModel ?? `Model-${counter}`,
      serialNumber: opts.serialNumber ?? null,
      issueDescription: "Test issue",
      status: opts.status ?? "open",
      createdBy: opts.createdBy,
      assignedTechnicianId: opts.assignedTechnicianId ?? null,
    })
    .returning();

  return ticket;
}
