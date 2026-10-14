import { readFileSync } from "fs";
import path from "path";
import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { resetDb } from "../helpers/db";
import { createStore } from "../helpers/factories";
import { db } from "@/lib/db/client";
import { stores } from "@/lib/db/schema";
import { isValidStorePhone } from "@/lib/admin/stores";

const BACKFILL = readFileSync(path.join(process.cwd(), "lib/db/migrations/0018_backfill_store_phone.sql"), "utf8");

describe("migration 0018: placeholder phone numbers for existing stores", () => {
  beforeEach(resetDb);

  it("gives each store without a phone a random, valid Indian mobile number and leaves the rest alone", async () => {
    const without = await Promise.all([createStore(), createStore(), createStore({ phone: "" })]);
    const withPhone = await createStore({ phone: "080-2345 6789" });

    await db.execute(sql.raw(BACKFILL));

    const phones = [];
    for (const store of without) {
      const [row] = await db.select().from(stores).where(eq(stores.id, store.id));
      expect(row.phone).toMatch(/^\+91 [6-9]\d{4} \d{5}$/);
      expect(isValidStorePhone(row.phone)).toBe(true);
      phones.push(row.phone);
    }
    expect(new Set(phones).size).toBe(phones.length);

    const [kept] = await db.select().from(stores).where(eq(stores.id, withPhone.id));
    expect(kept.phone).toBe("080-2345 6789");
  });
});
