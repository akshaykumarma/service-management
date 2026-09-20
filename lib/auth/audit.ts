import { auditLog } from "@/lib/db/schema";
import type { db as Db } from "@/lib/db/client";

type Tx = Parameters<Parameters<typeof Db.transaction>[0]>[0];

export async function writeAuditLog(
  tx: Tx,
  entry: {
    actorId: string;
    entityType: string;
    entityId: string;
    action: string;
    before: unknown;
    after: unknown;
  },
): Promise<void> {
  await tx.insert(auditLog).values({
    actorId: entry.actorId,
    entityType: entry.entityType,
    entityId: entry.entityId,
    action: entry.action,
    beforeJson: entry.before,
    afterJson: entry.after,
  });
}
