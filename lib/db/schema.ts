import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  integer,
  smallint,
  date,
  primaryKey,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["super_admin", "admin", "service_manager"]);
export const ticketStatusEnum = pgEnum("ticket_status", [
  "open",
  "in_progress",
  "on_hold",
  "completed",
  "delivered",
  "cancelled",
]);

/**
 * Minimal stub — 003-ticket-lifecycle's own Foundational phase (T004) is the feature that
 * actually owns and later extends this table (007-admin-console's T002 ALTERs it further).
 * Created here only because 002's user_stores FK needs a target table to exist; this table
 * must NOT be re-created by either of those features, only extended.
 */
export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  emailUnique: uniqueIndex("users_email_unique_idx").on(table.email),
}));

export const userStores = pgTable(
  "user_stores",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.storeId] }),
  }),
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  tokenHashUnique: uniqueIndex("password_reset_tokens_token_hash_idx").on(table.tokenHash),
}));

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => users.id),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  action: text("action").notNull(),
  beforeJson: jsonb("before_json"),
  afterJson: jsonb("after_json"),
  ts: timestamp("ts", { withTimezone: true }).notNull().defaultNow(),
});

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: text("phone").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  phoneUnique: uniqueIndex("customers_phone_unique_idx").on(table.phone),
}));

export const tickets = pgTable("tickets", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketNumber: text("ticket_number").notNull(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => stores.id),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerAltPhone: text("customer_alt_phone"),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id),
  machineModel: text("machine_model").notNull(),
  issueDescription: text("issue_description").notNull(),
  estimatedPickupDate: date("estimated_pickup_date"),
  status: ticketStatusEnum("status").notNull().default("open"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  ticketNumberUnique: uniqueIndex("tickets_ticket_number_unique_idx").on(table.ticketNumber),
  historyLookupIdx: index("tickets_machine_model_status_store_idx").on(
    table.machineModel,
    table.status,
    table.storeId,
  ),
}));

export const statusHistory = pgTable("status_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => tickets.id, { onDelete: "cascade" }),
  fromStatus: ticketStatusEnum("from_status"),
  toStatus: ticketStatusEnum("to_status").notNull(),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => users.id),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ticketPhotos = pgTable("ticket_photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => tickets.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ticketNumberCounters = pgTable(
  "ticket_number_counters",
  {
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    year: smallint("year").notNull(),
    seq: integer("seq").notNull().default(0),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.storeId, table.year] }),
  }),
);
