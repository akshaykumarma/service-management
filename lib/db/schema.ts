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
  numeric,
  primaryKey,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["super_admin", "admin", "service_manager", "technician"]);
export const ticketStatusEnum = pgEnum("ticket_status", [
  "open",
  "in_progress",
  "on_hold",
  "completed",
  "delivered",
  "cancelled",
]);

/**
 * Reconciled to its full shape by 007-admin-console (data-model.md), which is this
 * table's canonical owner — an ALTER of the minimal stub 002/004/005 incrementally
 * extended, never a recreate, so every existing FK into `stores.id` survives.
 * `address`/`primaryContact`/`whatsappNumber` stay nullable rather than NOT NULL despite
 * spec.md calling them "required": enforced at the application layer
 * (lib/admin/stores.ts's createStore), consistent with this table's whole
 * incremental-extension history — a NOT NULL column here would break every existing row
 * and every test factory across four already-shipped features for a constraint this
 * feature's own code already guarantees on the only path that creates a row.
 * `whatsappNumber` (renamed from 005's `phone` — same column, spec.md's own naming) is
 * display/contact content only, never a Meta-registered sending identity (research.md §4).
 */
export const stores = pgTable("stores", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  whatsappNumber: text("whatsapp_number"),
  address: text("address"),
  primaryContact: text("primary_contact"),
  // Contract/quickstart.md's demonstrated behavior (POST always creates active:false,
  // requiring an explicit PATCH to activate once whatsappNumber validates) — data-model.md
  // says "default true" for this column, which contradicts both; resolved in favor of the
  // contract + quickstart, which agree with each other and are backed by an executable
  // scenario, flagged here rather than silently picked.
  active: boolean("active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const machineModels = pgTable("machine_models", {
  id: uuid("id").primaryKey().defaultRandom(),
  // The sole identifying value (this spec's clarification: same as 003's "machine model
  // number") — no FK from tickets.machine_model, which stays free text per 003's own
  // free-text-fallback design (research.md §2); this table is a selection list only.
  name: text("name").notNull(),
  manufacturer: text("manufacturer").notNull(),
  category: text("category"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  // Optional (nullable) — a Super Admin may set one at account creation, or leave it
  // unset; a Postgres unique index allows any number of NULLs, so this stays enforceable
  // without every pre-existing account needing a backfilled value. Login accepts either
  // this or email, per direct product feedback (post-002-auth-rbac).
  username: text("username"),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  emailUnique: uniqueIndex("users_email_unique_idx").on(table.email),
  usernameUnique: uniqueIndex("users_username_unique_idx").on(table.username),
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
  // Per-ticket, Service-Manager-editable (post-007-admin-console product feedback) —
  // replaces the store-wide fixed rate calculateBill() used to read live; defaults to 0%
  // rather than inheriting the store's rate, per the exact request. stores.taxRate is
  // kept in the schema (existing rows, no destructive migration) but no longer consulted
  // for billing.
  taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  status: ticketStatusEnum("status").notNull().default("open"),
  // New Technician role (post-007 product feedback): set by a Service Manager, typically
  // once the ticket moves to In Progress. Nullable — most tickets are never assigned to a
  // named technician. Grants that one technician full access to this one ticket
  // (lib/auth/rbac.ts's assertTicketAccess), on top of (not instead of) the normal
  // store-scope check every other role already goes through.
  assignedTechnicianId: uuid("assigned_technician_id").references(() => users.id),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  // Store+year-scoped (plan.md's Constraints), not globally unique: two different
  // stores legitimately both issue "SVC-2026-00001" independently.
  ticketNumberUniquePerStore: uniqueIndex("tickets_store_ticket_number_unique_idx").on(
    table.storeId,
    table.ticketNumber,
  ),
  historyLookupIdx: index("tickets_machine_model_status_store_idx").on(
    table.machineModel,
    table.status,
    table.storeId,
  ),
  // 006-dashboard-reporting FR-008's Customer Name filter (data-model.md, research.md §3).
  customerNameIdx: index("idx_tickets_customer_name").on(table.customerName),
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

export const parts = pgTable("parts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  sku: text("sku"),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull(),
  category: text("category"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }).notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const lineItemTypeEnum = pgEnum("line_item_type", ["part", "service"]);

export const ticketLineItems = pgTable("ticket_line_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => tickets.id, { onDelete: "cascade" }),
  itemType: lineItemTypeEnum("item_type").notNull(),
  // References parts.id or services.id depending on itemType — application-enforced,
  // not a single DB FK, since it targets one of two tables (data-model.md).
  itemId: uuid("item_id").notNull(),
  nameSnapshot: text("name_snapshot").notNull(),
  quantity: integer("quantity").notNull(),
  unitCostSnapshot: numeric("unit_cost_snapshot", { precision: 12, scale: 2 }).notNull(),
  lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationTypeEnum = pgEnum("notification_type", ["completion", "otp"]);
export const notificationStatusEnum = pgEnum("notification_status", ["sent", "delivered", "failed"]);

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Nullable — null for a Super Admin test-send, not tied to a real ticket (research.md §5).
  ticketId: uuid("ticket_id").references(() => tickets.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  channel: text("channel").notNull().default("whatsapp"),
  recipientPhone: text("recipient_phone").notNull(),
  renderedContent: text("rendered_content").notNull(),
  status: notificationStatusEnum("status").notNull(),
  messageId: text("message_id"), // the WhatsApp message id, for correlating a later webhook
  pgBossJobId: text("pg_boss_job_id"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  statusUpdatedAt: timestamp("status_updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const otpVerifications = pgTable("otp_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => tickets.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  resendUsed: boolean("resend_used").notNull().default(false),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  locked: boolean("locked").notNull().default(false),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedBy: uuid("verified_by").references(() => users.id),
});

export const deliveryOverrides = pgTable(
  "delivery_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    overriddenBy: uuid("overridden_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ticketUnique: uniqueIndex("delivery_overrides_ticket_id_unique_idx").on(table.ticketId),
  }),
);

export const templateTypeEnum = pgEnum("template_type", ["completion", "otp"]);
export const templateApprovalStatusEnum = pgEnum("template_approval_status", ["approved", "pending"]);

export const messageTemplates = pgTable("message_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: templateTypeEnum("type").notNull(),
  body: text("body").notNull(),
  metaTemplateName: text("meta_template_name"),
  approvalStatus: templateApprovalStatusEnum("approval_status").notNull().default("pending"),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const manualNotificationConfirmations = pgTable(
  "manual_notification_confirmations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    confirmedBy: uuid("confirmed_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    notificationUnique: uniqueIndex("manual_notification_confirmations_notification_id_unique_idx").on(
      table.notificationId,
    ),
  }),
);
