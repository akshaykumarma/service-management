import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { statusHistory, tickets } from "@/lib/db/schema";
import { triggerCompletionNotification } from "@/lib/notifications/send-completion";

export type TicketStatus = "open" | "in_progress" | "on_hold" | "completed" | "delivered" | "cancelled";
export type StaffRole = "super_admin" | "admin" | "service_manager";
export type TransitionError = "invalid_transition" | "comment_required" | "role_not_permitted";

// Linear order for the non-terminal-branch statuses (data-model.md's State Transitions
// diagram); "forward" = higher index, "backward" = lower index. Cancelled is handled
// separately since it's a side-branch, not a position on this line.
const ORDER: Exclude<TicketStatus, "cancelled">[] = ["open", "in_progress", "on_hold", "completed", "delivered"];

export interface TransitionCheckInput {
  role: StaffRole;
  fromStatus: TicketStatus;
  toStatus: TicketStatus;
  comment: string | null;
}

/**
 * The allowed-transition table (FR-010 through FR-014, FR-018): returns null if the
 * transition is permitted, or the specific error code to return otherwise. Only forward
 * moves along the top row skip the comment requirement (except entering On Hold, which
 * always needs one); every backward move needs a comment; Cancelled is Admin/Super-Admin
 * only from a non-terminal status; leaving Delivered backward is additionally
 * Admin/Super-Admin only.
 */
export function checkTransition(input: TransitionCheckInput): TransitionError | null {
  const { role, fromStatus, toStatus, comment } = input;

  if (fromStatus === "cancelled") return "invalid_transition"; // terminal, no way out (spec.md Assumptions)
  if (fromStatus === toStatus) return "invalid_transition";

  if (toStatus === "cancelled") {
    if (fromStatus === "completed" || fromStatus === "delivered") return "invalid_transition";
    if (role === "service_manager") return "role_not_permitted";
    if (!comment) return "comment_required";
    return null;
  }

  const fromIdx = ORDER.indexOf(fromStatus);
  const toIdx = ORDER.indexOf(toStatus);
  if (fromIdx === -1 || toIdx === -1) return "invalid_transition";

  const isBackward = toIdx < fromIdx;

  if (isBackward && fromStatus === "delivered" && role === "service_manager") {
    return "role_not_permitted";
  }

  const enteringOnHold = toStatus === "on_hold";
  const commentRequired = isBackward || enteringOnHold;

  if (commentRequired && !comment) return "comment_required";

  return null;
}

/**
 * The one place tickets.status is actually written (called only from
 * app/api/tickets/[id]/status/route.ts, after checkTransition has already passed) —
 * 005-customer-notifications hooks its completion notification in here rather than in
 * a second copy of this write, per plan.md's Structure Decision.
 */
export async function applyStatusTransition(input: {
  ticket: typeof tickets.$inferSelect;
  toStatus: TicketStatus;
  comment: string | null;
  actorId: string;
}) {
  const { ticket, toStatus, comment, actorId } = input;

  const [updatedTicket] = await db
    .update(tickets)
    .set({ status: toStatus, updatedAt: new Date() })
    .where(eq(tickets.id, ticket.id))
    .returning();

  const [historyEntry] = await db
    .insert(statusHistory)
    .values({
      ticketId: ticket.id,
      fromStatus: ticket.status,
      toStatus,
      actorId,
      comment,
    })
    .returning();

  if (toStatus === "completed") {
    await triggerCompletionNotification(ticket.id);
  }

  return { updatedTicket, historyEntry };
}
