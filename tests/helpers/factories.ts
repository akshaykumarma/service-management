import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { stores, users, userStores, tickets, customers, demoServices, demoTickets, demoTicketStatusHistory } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/auth.config";

let counter = 0;

export async function createStore(
  nameOrOpts?:
    | string
    | {
        name?: string;
        storeCode?: string;
        active?: boolean;
        whatsappNumber?: string;
        address?: string;
        primaryContact?: string;
        taxRate?: string;
      },
): Promise<typeof stores.$inferSelect> {
  counter += 1;
  const opts = typeof nameOrOpts === "string" ? { name: nameOrOpts } : (nameOrOpts ?? {});
  const [store] = await db
    .insert(stores)
    .values({
      name: opts.name ?? `Test Store ${counter}`,
      // Base-36 keeps this a real 3-character code (this app's own creation rule) for
      // every counter value up to 36^3 - 1 — comfortably more than one test run ever
      // creates — while staying unique per call without callers needing to think about it.
      storeCode: opts.storeCode ?? counter.toString(36).toUpperCase().padStart(3, "0"),
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
  phone?: string | null;
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
      phone: opts.phone ?? null,
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

export async function createDemoService(opts: { name?: string; unitCost?: string; active?: boolean } = {}) {
  counter += 1;
  const [row] = await db
    .insert(demoServices)
    .values({ name: opts.name ?? `Demo Service ${counter}`, unitCost: opts.unitCost ?? "0.00", active: opts.active ?? true })
    .returning();
  return row;
}

export async function createDemoTicket(opts: {
  storeId: string;
  createdBy: string;
  demoServiceId?: string;
  status?: "new" | "assigned" | "in_progress" | "completed" | "cancelled";
  serialNumber?: string;
  invoiceNumber?: string;
  machineModel?: string;
  customerName?: string;
  customerPhone?: string;
  assignedTechnicianId?: string | null;
}): Promise<typeof demoTickets.$inferSelect> {
  counter += 1;
  const service = opts.demoServiceId
    ? (await db.select().from(demoServices).where(eq(demoServices.id, opts.demoServiceId)))[0]
    : await createDemoService();
  const phone = opts.customerPhone ?? `+91800000${String(counter).padStart(4, "0")}`;
  const existingCustomer = await db.select().from(customers).where(eq(customers.phone, phone)).limit(1);
  const customer =
    existingCustomer[0] ??
    (await db.insert(customers).values({ name: opts.customerName ?? `Demo Customer ${counter}`, phone }).returning())[0];

  const [ticket] = await db
    .insert(demoTickets)
    .values({
      ticketNumber: `DEMO-TEST-${counter}`,
      storeId: opts.storeId,
      customerId: customer.id,
      customerName: opts.customerName ?? `Demo Customer ${counter}`,
      customerPhone: phone,
      machineModel: opts.machineModel ?? "Demo Model",
      serialNumber: opts.serialNumber ?? `DSN-${counter}`,
      invoiceNumber: opts.invoiceNumber ?? `INV-${counter}`,
      demoServiceId: service.id,
      demoServiceName: service.name,
      demoServicePrice: service.unitCost,
      demoDate: "2026-10-10",
      status: opts.status ?? "new",
      assignedTechnicianId: opts.assignedTechnicianId ?? null,
      shortCode: `t${counter}${Math.random().toString(36).slice(2, 8)}`,
      createdBy: opts.createdBy,
    })
    .returning();
  await db.insert(demoTicketStatusHistory).values({ demoTicketId: ticket.id, fromStatus: null, toStatus: "new", actorId: opts.createdBy });
  return ticket;
}

