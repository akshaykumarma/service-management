"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { createBoardKeyboardCoordinateGetter } from "@/lib/board/keyboard-coordinates";

interface TicketCard {
  id: string;
  ticketNumber: string;
  customerName: string;
  machineModel: string;
  status: string;
  createdAt: string;
  daysOpen: number;
}

const COLUMNS: { status: string; label: string }[] = [
  { status: "open", label: "Open" },
  { status: "in_progress", label: "In Progress" },
  { status: "on_hold", label: "On Hold" },
  { status: "completed", label: "Completed" },
  { status: "delivered", label: "Delivered" },
];

const CANCELLED_COLUMN = { status: "cancelled", label: "Cancelled" };

const TRANSITION_ERROR_MESSAGES: Record<string, string> = {
  invalid_transition: "That status change isn't allowed from the current status.",
  role_not_permitted: "Your role doesn't permit this status change.",
};

function TicketCardItem({ ticket }: { ticket: TicketCard }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: ticket.id,
    // Read by the custom keyboard coordinateGetter as the starting column, before any
    // arrow-key move has happened yet in this drag session.
    data: { status: ticket.status },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.5 : 1 }
    : undefined;

  return (
    <li ref={setNodeRef} style={style} data-ticket-id={ticket.id} data-status={ticket.status} {...listeners} {...attributes}>
      <a href={`/tickets/${ticket.id}`} onClick={(e) => isDragging && e.preventDefault()}>
        <strong>{ticket.ticketNumber}</strong>
      </a>
      <div>{ticket.customerName}</div>
      <div>{ticket.machineModel}</div>
      <div>Created {new Date(ticket.createdAt).toLocaleDateString()}</div>
      <div>{ticket.daysOpen} day(s) open</div>
    </li>
  );
}

function BoardColumn({
  status,
  label,
  tickets,
}: {
  status: string;
  label: string;
  tickets: TicketCard[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section aria-labelledby={`column-${status}-heading`} ref={setNodeRef} data-over={isOver}>
      <h2 id={`column-${status}-heading`}>
        {label} ({tickets.length})
      </h2>
      <ul>
        {tickets.map((ticket) => (
          <TicketCardItem key={ticket.id} ticket={ticket} />
        ))}
      </ul>
    </section>
  );
}

export default function BoardPage() {
  const [tickets, setTickets] = useState<TicketCard[]>([]);
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const columns = includeCancelled ? [...COLUMNS, CANCELLED_COLUMN] : COLUMNS;
  const columnOrder = columns.map((c) => c.status);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // @dnd-kit's own keyboard sensor (research.md §4): Tab to a card, Space to pick it
    // up, Left/Right to move between columns (a custom coordinateGetter — the default
    // only nudges by a fixed pixel offset, not "jump to the next column"), Space to
    // drop, Escape to cancel — the WCAG 2.1 AA-required non-pointer path, on top of
    // (not instead of) the ticket detail page's own status controls (plan.md's
    // accessibility constraint).
    useSensor(KeyboardSensor, { coordinateGetter: createBoardKeyboardCoordinateGetter(columnOrder) }),
  );

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (includeCancelled) params.set("includeCancelled", "true");
    const res = await fetch(`/api/tickets?${params.toString()}`);
    const body = await res.json();
    setTickets(body.tickets);
    setLoaded(true);
  }, [includeCancelled]);

  useEffect(() => {
    load();
  }, [load]);

  // FR-003/SC-002: at least every 30 seconds, no manual refresh required.
  useEffect(() => {
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  async function attemptTransition(ticketId: string, toStatus: string, comment: string | null) {
    const res = await fetch(`/api/tickets/${ticketId}/status`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toStatus, comment }),
    });
    if (res.ok) {
      await load();
      return;
    }

    const body = await res.json();
    // FR-007: a transition that needs a mandatory comment prompts for it as part of the
    // drag interaction, rather than silently failing or silently skipping the requirement.
    if (body.error.code === "comment_required" && comment === null) {
      const provided = window.prompt("This status change requires a comment:");
      if (provided) {
        await attemptTransition(ticketId, toStatus, provided);
        return;
      }
    } else {
      setError(TRANSITION_ERROR_MESSAGES[body.error.code] ?? "Could not update status.");
    }
    // Rejected (or the comment prompt was cancelled): card returns to its original column.
    await load();
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const ticket = tickets.find((t) => t.id === active.id);
    const toStatus = String(over.id);
    if (!ticket || ticket.status === toStatus) return;
    setError(null);
    attemptTransition(ticket.id, toStatus, null);
  }

  return (
    <main>
      <h1>Board</h1>
      <div>
        <label htmlFor="includeCancelled">
          <input
            id="includeCancelled"
            type="checkbox"
            checked={includeCancelled}
            onChange={(e) => setIncludeCancelled(e.target.checked)}
          />
          Include cancelled
        </label>
      </div>

      {error && (
        <p role="alert" aria-live="assertive">
          {error}
        </p>
      )}

      {loaded && tickets.length === 0 && <p>No tickets match the current view.</p>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div aria-label="Kanban board">
          {columns.map((column) => (
            <BoardColumn
              key={column.status}
              status={column.status}
              label={column.label}
              tickets={tickets.filter((t) => t.status === column.status)}
            />
          ))}
        </div>
      </DndContext>
    </main>
  );
}
