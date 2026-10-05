import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { demoTickets, demoTicketStatusHistory } from "@/lib/db/schema";
import type { StaffRole } from "@/lib/tickets/status-transitions";

export type DemoStatus = "new" | "assigned" | "in_progress" | "completed" | "cancelled";
export type DemoTransitionError = "invalid_transition" | "comment_required" | "role_not_permitted" | "technician_required";

export const DEMO_STATUSES: DemoStatus[] = ["new", "assigned", "in_progress", "completed", "cancelled"];

// The forward line (specs/008-demo-board/data-model.md); Cancelled is a side branch.
const ORDER: Exclude<DemoStatus, "cancelled">[] = ["new", "assigned", "in_progress", "completed"];

/**
 * The demo ticket state machine (FR-005), mirroring the service rules where they apply:
 * - New ↔ Assigned is driven by assigning/removing a technician, never by a status move:
 *   moving to New is refused, and moving to Assigned needs a technician already set.
 * - Forward moves may skip steps once a technician is assigned (e.g. Assigned → Completed);
 *   backward moves need a comment.
 * - Cancelled needs a comment, is Admin/Super Admin only, can't follow Completed, and is
 *   terminal.
 */
export function checkDemoTransition(input: {
  role: StaffRole;
  fromStatus: DemoStatus;
  toStatus: DemoStatus;
  comment: string | null;
  hasTechnician: boolean;
}): DemoTransitionError | null {
  const { role, fromStatus, toStatus, comment, hasTechnician } = input;

  if (fromStatus === "cancelled" || fromStatus === toStatus) return "invalid_transition";
  if (!(DEMO_STATUSES as string[]).includes(toStatus)) return "invalid_transition";

  if (toStatus === "cancelled") {
    if (fromStatus === "completed") return "invalid_transition";
    if (role === "service_manager" || role === "technician") return "role_not_permitted";
    if (!comment) return "comment_required";
    return null;
  }

  if (toStatus === "new") return "invalid_transition";
  // Every status past New means a technician is on the job (Assigned, In Progress,
  // Completed) — so with no technician, say so rather than a generic refusal.
  if (!hasTechnician) return "technician_required";

  // Forward moves may skip a step (post-008 product feedback: a demo often goes straight
  // from Assigned to Completed in one visit); backward moves need a comment.
  const fromIdx = ORDER.indexOf(fromStatus as (typeof ORDER)[number]);
  const toIdx = ORDER.indexOf(toStatus as (typeof ORDER)[number]);
  if (toIdx < fromIdx && !comment) return "comment_required";
  return null;
}

/** The one place demo_tickets.status is written by a status move (after checkDemoTransition). */
export async function applyDemoStatusTransition(input: {
  ticket: typeof demoTickets.$inferSelect;
  toStatus: DemoStatus;
  comment: string | null;
  actorId: string;
}) {
  const { ticket, toStatus, comment, actorId } = input;
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(demoTickets)
      .set({ status: toStatus, updatedAt: new Date() })
      .where(eq(demoTickets.id, ticket.id))
      .returning();
    await tx.insert(demoTicketStatusHistory).values({
      demoTicketId: ticket.id,
      fromStatus: ticket.status,
      toStatus,
      actorId,
      comment,
    });
    return updated;
  });
}
