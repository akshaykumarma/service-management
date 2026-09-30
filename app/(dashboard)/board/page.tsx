"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { formatDate } from "@/lib/format/date";
import MultiSelectDropdown from "@/components/multi-select-dropdown";
import SearchableSelect from "@/components/searchable-select";

interface TicketCard {
  id: string;
  ticketNumber: string;
  customerName: string;
  machineModel: string;
  status: string;
  createdAt: string;
  daysOpen: number;
  storeName: string;
  technicianName: string | null;
}

interface StoreOption {
  id: string;
  name: string;
}

interface TechnicianOption {
  id: string;
  name: string;
}

const COLUMNS: { status: string; label: string }[] = [
  { status: "open", label: "Open" },
  { status: "in_progress", label: "In Progress" },
  { status: "on_hold", label: "On Hold" },
  { status: "completed", label: "Completed" },
  { status: "delivered", label: "Delivered" },
];

const CANCELLED_COLUMN = { status: "cancelled", label: "Cancelled" };

const ALL_STATUSES = ["open", "in_progress", "on_hold", "completed", "delivered", "cancelled"];

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

// One tile per status (post-v1 product feedback): the same five statuses as the Kanban
// columns, with the same names and colours everywhere, and each tile doubles as a
// one-click filter for that status.
const STATUS_TILES: { status: string; label: string; dot: string; bg: string }[] = [
  { status: "open", label: "Open", dot: "#52525b", bg: "#f4f4f5" },
  { status: "in_progress", label: "In Progress", dot: "#2563eb", bg: "#eaf0fe" },
  { status: "on_hold", label: "On Hold", dot: "#b45309", bg: "#fdf1e0" },
  { status: "completed", label: "Completed", dot: "#15803d", bg: "#e8f5ec" },
  { status: "delivered", label: "Delivered", dot: "#6d28d9", bg: "#efe8fc" },
];
const CANCELLED_TILE = { status: "cancelled", label: "Cancelled", dot: "#b91c1c", bg: "#fce9e9" };

const TRANSITION_ERROR_MESSAGES: Record<string, string> = {
  invalid_transition: "That status change isn't allowed from the current status.",
  role_not_permitted: "Your role doesn't permit this status change.",
  comment_required: "A comment is required for this transition. Drag the card again to provide one.",
};

function ageLabel(daysOpen: number): string {
  return daysOpen === 0 ? "New" : `${daysOpen}d`;
}

function ageTier(daysOpen: number): "fresh" | "normal" | "warm" | "hot" {
  if (daysOpen === 0) return "fresh";
  if (daysOpen <= 3) return "normal";
  if (daysOpen <= 7) return "warm";
  return "hot";
}

// A stable color per technician name (List view's technician avatars) — no identity/photo
// data exists to pick from, just a deterministic hash so the same name always renders the
// same color across reloads.
const AVATAR_COLORS = ["#2563eb", "#7c3aed", "#0d9488", "#ea580c", "#be123c", "#0891b2", "#4d7c0f"];
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

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
    <li
      ref={setNodeRef}
      style={style}
      className="board-card"
      data-ticket-id={ticket.id}
      data-status={ticket.status}
      {...listeners}
      {...attributes}
    >
      <a
        href={`/tickets/${ticket.id}`}
        className="board-card__link"
        onClick={(e) => isDragging && e.preventDefault()}
      >
        <div className="board-card__top">
          <span className="board-card__num">{ticket.ticketNumber}</span>
          <span className={`board-card__age board-card__age--${ageTier(ticket.daysOpen)}`}>
            {ageLabel(ticket.daysOpen)}
          </span>
        </div>
        <div className="board-card__customer">{ticket.customerName}</div>
        <div className="board-card__model">{ticket.machineModel}</div>
        <div className="board-card__footer">Created {formatDate(ticket.createdAt)}</div>
      </a>
    </li>
  );
}

function BoardColumn({
  status,
  label,
  tickets,
  focused,
  onToggleFocus,
}: {
  status: string;
  label: string;
  tickets: TicketCard[];
  focused: boolean;
  onToggleFocus: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      aria-labelledby={`column-${status}-heading`}
      ref={setNodeRef}
      data-over={isOver}
      className={`board-column status-${status}`}
    >
      <div className="board-column__accent-bar" aria-hidden="true" />
      <div className="board-column__head">
        <h2 id={`column-${status}-heading`}>
          <button
            type="button"
            className="board-column__filter"
            aria-pressed={focused}
            title={focused ? "Show all statuses" : `Show only ${label}`}
            onClick={onToggleFocus}
          >
            {label}
          </button>
        </h2>
        <span className="board-column__count">{tickets.length}</span>
      </div>
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

  const [storeOptions, setStoreOptions] = useState<StoreOption[]>([]);
  const [technicianOptions, setTechnicianOptions] = useState<TechnicianOption[]>([]);
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [ticketIdFilter, setTicketIdFilter] = useState("");
  const [customerNameFilter, setCustomerNameFilter] = useState("");
  const [customerPhoneFilter, setCustomerPhoneFilter] = useState("");
  const [machineModelFilter, setMachineModelFilter] = useState("");
  const [technicianFilter, setTechnicianFilter] = useState("");
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  // Quick status filter from the status tiles / column headers. Client-side over the
  // already-loaded tickets, so the tile counts keep showing every status's total.
  const [quickStatus, setQuickStatus] = useState<string | null>(null);

  // List view (post-v1 product feedback: a table alternative to the Kanban board). Kanban
  // stays the default drag-and-drop surface; List is an additional view over the exact
  // same (already role/store-scoped) `tickets` state, never a second fetch.
  const [viewMode, setViewMode] = useState<"board" | "list">("list");
  const [listSearch, setListSearch] = useState("");
  const [listSortDir, setListSortDir] = useState<"asc" | "desc">("desc");
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(10);
  const listSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/stores")
      .then((res) => res.json())
      .then((body) => setStoreOptions(body.stores));
  }, []);

  // Narrows to the selected store(s) (post-technician-filter product feedback), so the
  // picker never offers a technician who isn't actually in the store(s) currently
  // filtered on. Clears an out-of-scope selection rather than silently keeping an
  // invisible filter applied.
  useEffect(() => {
    const params = new URLSearchParams();
    for (const storeId of selectedStoreIds) params.append("storeId", storeId);
    fetch(`/api/technicians?${params.toString()}`)
      .then((res) => res.json())
      .then((body) => {
        setTechnicianOptions(body.technicians);
        setTechnicianFilter((prev) => (prev && !body.technicians.some((t: TechnicianOption) => t.id === prev) ? "" : prev));
      });
  }, [selectedStoreIds]);

  const columns = includeCancelled ? [...COLUMNS, CANCELLED_COLUMN] : COLUMNS;
  const columnOrder = columns.map((c) => c.status);

  const moreFilterValues = [dateFrom, dateTo, ticketIdFilter, customerNameFilter, customerPhoneFilter, machineModelFilter];
  const moreFiltersActiveCount = moreFilterValues.filter(Boolean).length;
  const totalActiveFilterCount =
    selectedStoreIds.length +
    selectedStatuses.length +
    (technicianFilter ? 1 : 0) +
    moreFiltersActiveCount +
    (includeCancelled ? 1 : 0);

  function clearAllFilters() {
    setSelectedStoreIds([]);
    setSelectedStatuses([]);
    setTechnicianFilter("");
    setDateFrom("");
    setDateTo("");
    setTicketIdFilter("");
    setCustomerNameFilter("");
    setCustomerPhoneFilter("");
    setMachineModelFilter("");
    setIncludeCancelled(false);
  }

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
    for (const storeId of selectedStoreIds) params.append("storeId", storeId);
    for (const status of selectedStatuses) params.append("status", status);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (ticketIdFilter) params.set("ticketId", ticketIdFilter);
    if (customerNameFilter) params.set("customerName", customerNameFilter);
    if (customerPhoneFilter) params.set("customerPhone", customerPhoneFilter);
    if (machineModelFilter) params.set("machineModel", machineModelFilter);
    if (technicianFilter) params.set("technicianId", technicianFilter);

    const res = await fetch(`/api/tickets?${params.toString()}`);
    const body = await res.json();
    setTickets(body.tickets);
    setLoaded(true);
  }, [
    includeCancelled,
    selectedStoreIds,
    selectedStatuses,
    dateFrom,
    dateTo,
    ticketIdFilter,
    customerNameFilter,
    customerPhoneFilter,
    machineModelFilter,
    technicianFilter,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  // FR-003/SC-002: at least every 30 seconds, no manual refresh required.
  useEffect(() => {
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  // Cmd/Ctrl+K focuses the List view's search box, matching the shortcut hinted in its
  // own placeholder text.
  useEffect(() => {
    function handleShortcut(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k" && listSearchInputRef.current) {
        e.preventDefault();
        listSearchInputRef.current.focus();
      }
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

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
      // Cancelled, left blank, or the browser silently blocked the prompt (e.g. after
      // "Prevent this page from creating additional dialogs" is ticked) — previously this
      // reverted the card with no feedback at all, which looked exactly like "the drag
      // didn't work." Surface the same message the ticket detail page's own form shows.
      setError(TRANSITION_ERROR_MESSAGES.comment_required ?? "A comment is required for this transition.");
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

  const statusTiles = includeCancelled ? [...STATUS_TILES, CANCELLED_TILE] : STATUS_TILES;
  // A quick filter on "cancelled" makes no sense once cancelled tickets are hidden again.
  const activeQuickStatus = quickStatus === "cancelled" && !includeCancelled ? null : quickStatus;
  const toggleQuickStatus = (status: string) => {
    setQuickStatus((prev) => (prev === status ? null : status));
    setListPage(1);
  };
  const visibleColumns = activeQuickStatus ? columns.filter((c) => c.status === activeQuickStatus) : columns;
  const quickFilteredTickets = activeQuickStatus ? tickets.filter((t) => t.status === activeQuickStatus) : tickets;

  const statusTileRow = (
    <div
      className="board-kpis board-kpis--status"
      role="group"
      aria-label="Filter by status"
      style={{ "--status-tiles": statusTiles.length } as React.CSSProperties}
    >
      {statusTiles.map((tile) => (
        <button
          type="button"
          key={tile.status}
          className="board-kpi board-kpi--button"
          aria-pressed={activeQuickStatus === tile.status}
          onClick={() => toggleQuickStatus(tile.status)}
        >
          <span className="board-kpi__icon" style={{ background: tile.bg }} aria-hidden="true">
            <span className="board-kpi__dot" style={{ background: tile.dot }} />
          </span>
          <span>
            <span className="board-kpi__label">{tile.label}</span>
            <span className="board-kpi__value">{tickets.filter((t) => t.status === tile.status).length}</span>
          </span>
        </button>
      ))}
      {activeQuickStatus && (
        <p className="board-kpis__active" aria-live="polite">
          Showing only <strong>{STATUS_LABELS[activeQuickStatus]}</strong> tickets.{" "}
          <button type="button" className="board-kpis__clear" onClick={() => setQuickStatus(null)}>
            Show all
          </button>
        </p>
      )}
    </div>
  );

  const searchedTickets = listSearch.trim()
    ? quickFilteredTickets.filter((t) => {
        const q = listSearch.trim().toLowerCase();
        return (
          t.ticketNumber.toLowerCase().includes(q) ||
          t.customerName.toLowerCase().includes(q) ||
          t.machineModel.toLowerCase().includes(q) ||
          t.storeName.toLowerCase().includes(q) ||
          (t.technicianName ?? "").toLowerCase().includes(q)
        );
      })
    : quickFilteredTickets;

  const sortedTickets = [...searchedTickets].sort((a, b) => {
    const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return listSortDir === "asc" ? diff : -diff;
  });

  const listTotalPages = Math.max(1, Math.ceil(sortedTickets.length / listPageSize));
  const listCurrentPage = Math.min(listPage, listTotalPages);
  const listPageStart = (listCurrentPage - 1) * listPageSize;
  const pagedTickets = sortedTickets.slice(listPageStart, listPageStart + listPageSize);
  const listRangeStart = sortedTickets.length === 0 ? 0 : listPageStart + 1;
  const listRangeEnd = Math.min(listPageStart + listPageSize, sortedTickets.length);

  // Only one store in scope: every row would repeat it, so the column is dropped to keep
  // the table within the page width.
  const showStoreColumn = storeOptions.length !== 1;

  return (
    <main className="board-page">
      <div className="list-page-header">
        <div>
          <h1>Board</h1>
          <p className="list-page-header__subtitle">Track and manage service tickets across all stores</p>
        </div>
        {viewMode === "list" && (
          <div className="list-page-header__search">
            <input
              ref={listSearchInputRef}
              type="search"
              placeholder="Search tickets, customer, model, store... (⌘K)"
              value={listSearch}
              onChange={(e) => {
                setListSearch(e.target.value);
                setListPage(1);
              }}
              aria-label="Search tickets"
            />
          </div>
        )}
      </div>

      <div className="board-view-toggle" role="group" aria-label="Board view">
        <button type="button" aria-pressed={viewMode === "board"} onClick={() => setViewMode("board")}>
          Board
        </button>
        <button type="button" aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")}>
          List
        </button>
      </div>

      {viewMode === "board" ? (
        <>
          {statusTileRow}

          <section aria-labelledby="filters-heading" className="board-toolbar">
            <div className="board-toolbar__row">
              <h2 id="filters-heading" className="board-toolbar__heading">
                Filters
              </h2>

              <MultiSelectDropdown
                id="storeFilter"
                label="Store(s)"
                placeholder="All stores"
                options={storeOptions.map((s) => ({ id: s.id, label: s.name }))}
                selected={selectedStoreIds}
                onChange={setSelectedStoreIds}
              />

              <MultiSelectDropdown
                id="statusFilter"
                label="Status"
                placeholder="All statuses"
                options={ALL_STATUSES.map((s) => ({ id: s, label: STATUS_LABELS[s] }))}
                selected={selectedStatuses}
                onChange={setSelectedStatuses}
              />

              <SearchableSelect
                id="technicianFilter"
                label="Technician"
                placeholder="All technicians"
                options={technicianOptions.map((t) => ({ id: t.id, label: t.name }))}
                value={technicianFilter}
                onChange={setTechnicianFilter}
              />

              <label className="board-toolbar__checkbox" htmlFor="includeCancelled">
                <input
                  id="includeCancelled"
                  type="checkbox"
                  checked={includeCancelled}
                  onChange={(e) => setIncludeCancelled(e.target.checked)}
                />
                Include cancelled
              </label>

              <div className="board-toolbar__spacer" />

              <button
                type="button"
                className="board-toolbar__more-toggle"
                aria-expanded={moreFiltersOpen}
                aria-controls="board-more-filters"
                onClick={() => setMoreFiltersOpen((prev) => !prev)}
              >
                More filters
                {moreFiltersActiveCount > 0 && <span className="board-toolbar__badge">{moreFiltersActiveCount}</span>}
                <span aria-hidden="true">{moreFiltersOpen ? "▴" : "▾"}</span>
              </button>

              {totalActiveFilterCount > 0 && (
                <button type="button" className="board-toolbar__clear" onClick={clearAllFilters}>
                  Clear filters
                </button>
              )}
            </div>

            {moreFiltersOpen && (
              <div id="board-more-filters" className="board-toolbar__more">
                <div className="board-toolbar__field">
                  <label htmlFor="dateFrom">Created from</label>
                  <input id="dateFrom" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="board-toolbar__field">
                  <label htmlFor="dateTo">Created to</label>
                  <input id="dateTo" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
                <div className="board-toolbar__field">
                  <label htmlFor="ticketIdFilter">Ticket ID</label>
                  <input id="ticketIdFilter" value={ticketIdFilter} onChange={(e) => setTicketIdFilter(e.target.value)} />
                </div>
                <div className="board-toolbar__field">
                  <label htmlFor="customerNameFilter">Customer name</label>
                  <input
                    id="customerNameFilter"
                    value={customerNameFilter}
                    onChange={(e) => setCustomerNameFilter(e.target.value)}
                  />
                </div>
                <div className="board-toolbar__field">
                  <label htmlFor="customerPhoneFilter">Customer mobile number</label>
                  <input
                    id="customerPhoneFilter"
                    value={customerPhoneFilter}
                    onChange={(e) => setCustomerPhoneFilter(e.target.value)}
                  />
                </div>
                <div className="board-toolbar__field">
                  <label htmlFor="machineModelFilter">Machine model</label>
                  <input
                    id="machineModelFilter"
                    value={machineModelFilter}
                    onChange={(e) => setMachineModelFilter(e.target.value)}
                  />
                </div>
              </div>
            )}
          </section>

          {error && (
            <p role="alert" aria-live="assertive">
              {error}
            </p>
          )}

          {loaded && tickets.length === 0 && <p>No tickets match the current view.</p>}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div aria-label="Kanban board" className="board" style={{ "--board-columns": visibleColumns.length } as React.CSSProperties}>
              {visibleColumns.map((column) => (
                <BoardColumn
                  key={column.status}
                  status={column.status}
                  label={column.label}
                  tickets={tickets.filter((t) => t.status === column.status)}
                  focused={activeQuickStatus === column.status}
                  onToggleFocus={() => toggleQuickStatus(column.status)}
                />
              ))}
            </div>
          </DndContext>
        </>
      ) : (
        <>
          {statusTileRow}

          <section aria-labelledby="list-filters-heading" className="list-filterbar">
            <h2 id="list-filters-heading" className="sr-only">
              Filters
            </h2>

            <div className="list-filterbar__field">
              <MultiSelectDropdown
                id="listStoreFilter"
                label="Store(s)"
                placeholder="All stores"
                options={storeOptions.map((s) => ({ id: s.id, label: s.name }))}
                selected={selectedStoreIds}
                onChange={setSelectedStoreIds}
              />
            </div>

            <div className="list-filterbar__field">
              <MultiSelectDropdown
                id="listStatusFilter"
                label="Status"
                placeholder="All statuses"
                options={ALL_STATUSES.map((s) => ({ id: s, label: STATUS_LABELS[s] }))}
                selected={selectedStatuses}
                onChange={setSelectedStatuses}
              />
            </div>

            <div className="list-filterbar__field">
              <SearchableSelect
                id="listTechnicianFilter"
                label="Technician"
                placeholder="All technicians"
                options={technicianOptions.map((t) => ({ id: t.id, label: t.name }))}
                value={technicianFilter}
                onChange={setTechnicianFilter}
              />
            </div>

            <div className="list-filterbar__field">
              <span className="list-filterbar__label">Created date</span>
              <div className="list-filterbar__daterange">
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="Start date" />
                <span aria-hidden="true">–</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  aria-label="End date (defaults to today)"
                />
              </div>
            </div>

            <div className="list-filterbar__actions">
              {totalActiveFilterCount > 0 && (
                <button type="button" className="list-filterbar__clear" onClick={clearAllFilters}>
                  Clear
                </button>
              )}
              <button type="button" className="list-filterbar__apply" onClick={load}>
                Apply filters
              </button>
            </div>
          </section>

          {error && (
            <p role="alert" aria-live="assertive">
              {error}
            </p>
          )}

          {loaded && tickets.length === 0 && <p>No tickets match the current view.</p>}

          {loaded && tickets.length > 0 && (
            <section aria-labelledby="ticket-list-heading" className="list-table-section">
              <div className="section-header">
                <h2 id="ticket-list-heading">Service tickets ({sortedTickets.length})</h2>
              </div>

              {sortedTickets.length === 0 ? (
                <p>No tickets match your search.</p>
              ) : (
                <>
                  <div className="table-scroll">
                    <table className="list-table">
                      <thead>
                        <tr>
                          <th>Ticket ID</th>
                          <th>Customer</th>
                          <th>Model</th>
                          {showStoreColumn && <th>Store</th>}
                          <th>Technician</th>
                          <th>Status</th>
                          <th>
                            <button
                              type="button"
                              className="list-table__sort"
                              onClick={() => setListSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                            >
                              Created date <span aria-hidden="true">{listSortDir === "desc" ? "↓" : "↑"}</span>
                            </button>
                          </th>
                          <th>Age</th>
                          <th>
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedTickets.map((ticket) => (
                          <tr key={ticket.id} data-ticket-id={ticket.id} data-status={ticket.status}>
                            <td>
                              <a href={`/tickets/${ticket.id}`} className="list-table__ticket-link">
                                {ticket.ticketNumber}
                              </a>
                            </td>
                            <td>{ticket.customerName}</td>
                            <td>{ticket.machineModel}</td>
                            {showStoreColumn && <td>{ticket.storeName}</td>}
                            <td>
                              <span className="list-table__technician">
                                {ticket.technicianName ? (
                                  <>
                                    <span
                                      className="avatar-dot"
                                      style={{ background: avatarColor(ticket.technicianName) }}
                                      aria-hidden="true"
                                    >
                                      {ticket.technicianName.charAt(0).toUpperCase()}
                                    </span>
                                    {ticket.technicianName}
                                  </>
                                ) : (
                                  <>
                                    <span className="avatar-dot avatar-dot--empty" aria-hidden="true" />
                                    Unassigned
                                  </>
                                )}
                              </span>
                            </td>
                            <td>
                              <span className={`status-pill status-${ticket.status}`}>{STATUS_LABELS[ticket.status]}</span>
                            </td>
                            <td>{formatDate(ticket.createdAt)}</td>
                            <td>
                              <span className={`age-pill age-pill--${ageTier(ticket.daysOpen)}`}>
                                {ageLabel(ticket.daysOpen)}
                              </span>
                            </td>
                            <td>
                              <a href={`/tickets/${ticket.id}`} className="list-table__view-link">
                                View
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="list-pagination">
                    <select
                      value={listPageSize}
                      onChange={(e) => {
                        setListPageSize(Number(e.target.value));
                        setListPage(1);
                      }}
                      aria-label="Rows per page"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                    <span>
                      {listRangeStart}-{listRangeEnd} of {sortedTickets.length} tickets
                    </span>
                    <div className="list-pagination__spacer" />
                    <button
                      type="button"
                      className="list-pagination__page-btn"
                      disabled={listCurrentPage <= 1}
                      onClick={() => setListPage((p) => Math.max(1, p - 1))}
                      aria-label="Previous page"
                    >
                      ‹
                    </button>
                    <span className="list-pagination__current">{listCurrentPage}</span>
                    <button
                      type="button"
                      className="list-pagination__page-btn"
                      disabled={listCurrentPage >= listTotalPages}
                      onClick={() => setListPage((p) => Math.min(listTotalPages, p + 1))}
                      aria-label="Next page"
                    >
                      ›
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
