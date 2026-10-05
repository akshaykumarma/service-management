import { describe, expect, it } from "vitest";
import { checkDemoTransition, type DemoStatus } from "@/lib/demo/status-transitions";
import type { StaffRole } from "@/lib/tickets/status-transitions";

const check = (
  fromStatus: DemoStatus,
  toStatus: DemoStatus,
  opts: { role?: StaffRole; comment?: string | null; hasTechnician?: boolean } = {},
) =>
  checkDemoTransition({
    role: opts.role ?? "service_manager",
    fromStatus,
    toStatus,
    comment: opts.comment ?? null,
    hasTechnician: opts.hasTechnician ?? true,
  });

describe("demo ticket state machine (specs/008-demo-board/data-model.md)", () => {
  it("allows one-step forward moves without a comment", () => {
    expect(check("assigned", "in_progress")).toBeNull();
    expect(check("in_progress", "completed")).toBeNull();
  });

  it("reaches Assigned only with a technician, and never moves to New by status", () => {
    expect(check("new", "assigned", { hasTechnician: false })).toBe("technician_required");
    expect(check("in_progress", "assigned", { comment: "redo", hasTechnician: false })).toBe("technician_required");
    expect(check("assigned", "new", { comment: "x" })).toBe("invalid_transition");
  });

  it("refuses skipping steps", () => {
    expect(check("new", "in_progress")).toBe("invalid_transition");
    expect(check("new", "completed")).toBe("invalid_transition");
    expect(check("assigned", "completed")).toBe("invalid_transition");
  });

  it("requires a comment to move backward", () => {
    expect(check("completed", "in_progress")).toBe("comment_required");
    expect(check("completed", "in_progress", { comment: "Customer asked again" })).toBeNull();
    expect(check("in_progress", "assigned", { comment: "Rescheduled" })).toBeNull();
  });

  it("lets only Admin/Super Admin cancel, with a comment, before completion; Cancelled is terminal", () => {
    expect(check("new", "cancelled", { role: "service_manager", comment: "x" })).toBe("role_not_permitted");
    expect(check("assigned", "cancelled", { role: "technician", comment: "x" })).toBe("role_not_permitted");
    expect(check("new", "cancelled", { role: "admin" })).toBe("comment_required");
    expect(check("in_progress", "cancelled", { role: "admin", comment: "Customer withdrew" })).toBeNull();
    expect(check("completed", "cancelled", { role: "super_admin", comment: "x" })).toBe("invalid_transition");
    expect(check("cancelled", "new", { role: "super_admin", comment: "x" })).toBe("invalid_transition");
  });

  it("rejects no-op and unknown statuses", () => {
    expect(check("assigned", "assigned")).toBe("invalid_transition");
    expect(check("assigned", "delivered" as DemoStatus)).toBe("invalid_transition");
  });
});
