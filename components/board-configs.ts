import type { BoardConfig } from "@/components/ticket-board";

const COMMON_TRANSITION_ERRORS = {
  invalid_transition: "That status change isn't allowed from the current status.",
  role_not_permitted: "Your role doesn't permit this status change.",
  comment_required: "A comment is required for this transition. Drag the card again to provide one.",
};

export const SERVICE_BOARD: BoardConfig = {
  title: "Service Board",
  subtitle: "Track and manage service tickets across all stores",
  apiBase: "/api/tickets",
  detailBase: "/tickets",
  columns: [
    { status: "open", label: "Open" },
    { status: "in_progress", label: "In Progress" },
    { status: "on_hold", label: "On Hold" },
    { status: "completed", label: "Completed" },
    { status: "delivered", label: "Delivered" },
  ],
  cancelledStatus: "cancelled",
  statusLabels: {
    open: "Open",
    in_progress: "In Progress",
    on_hold: "On Hold",
    completed: "Completed",
    delivered: "Delivered",
    cancelled: "Cancelled",
  },
  // One tile per status (post-v1 product feedback): the same statuses as the columns,
  // with the same names and colours everywhere; each tile doubles as a filter.
  statusTiles: [
    { status: "open", label: "Open", dot: "#52525b", bg: "#f4f4f5" },
    { status: "in_progress", label: "In Progress", dot: "#2563eb", bg: "#eaf0fe" },
    { status: "on_hold", label: "On Hold", dot: "#b45309", bg: "#fdf1e0" },
    { status: "completed", label: "Completed", dot: "#15803d", bg: "#e8f5ec" },
    { status: "delivered", label: "Delivered", dot: "#6d28d9", bg: "#efe8fc" },
  ],
  cancelledTile: { status: "cancelled", label: "Cancelled", dot: "#b91c1c", bg: "#fce9e9" },
  transitionErrorMessages: COMMON_TRANSITION_ERRORS,
};

/** 008-demo-board: the same board over demo tickets and their five statuses. */
export const DEMO_BOARD: BoardConfig = {
  title: "Demo Board",
  subtitle: "Track and manage product demos across all stores",
  apiBase: "/api/demo-tickets",
  detailBase: "/demo-tickets",
  columns: [
    { status: "new", label: "New" },
    { status: "assigned", label: "Assigned" },
    { status: "in_progress", label: "In Progress" },
    { status: "completed", label: "Completed" },
  ],
  cancelledStatus: "cancelled",
  statusLabels: {
    new: "New",
    assigned: "Assigned",
    in_progress: "In Progress",
    completed: "Completed",
    cancelled: "Cancelled",
  },
  statusTiles: [
    { status: "new", label: "New", dot: "#52525b", bg: "#f4f4f5" },
    { status: "assigned", label: "Assigned", dot: "#0891b2", bg: "#e6f6fa" },
    { status: "in_progress", label: "In Progress", dot: "#2563eb", bg: "#eaf0fe" },
    { status: "completed", label: "Completed", dot: "#15803d", bg: "#e8f5ec" },
  ],
  cancelledTile: { status: "cancelled", label: "Cancelled", dot: "#b91c1c", bg: "#fce9e9" },
  transitionErrorMessages: {
    ...COMMON_TRANSITION_ERRORS,
    technician_required: "Assign a technician on the demo ticket's page to move it to Assigned.",
  },
};
