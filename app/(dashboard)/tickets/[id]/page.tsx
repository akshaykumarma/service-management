"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { formatDate, formatDateTime } from "@/lib/format/date";
import SearchableSelect from "@/components/searchable-select";

interface TicketDetail {
  id: string;
  ticketNumber: string;
  status: string;
  customerName: string;
  customerPhone: string;
  customerAltPhone: string | null;
  machineModel: string;
  serialNumber: string | null;
  issueDescription: string;
  createdAt: string;
  taxRate: string;
  assignedTechnicianId: string | null;
  assignedTechnicianName: string | null;
}

interface TechnicianOption {
  id: string;
  name: string;
}

interface LineItem {
  id: string;
  itemType: "part" | "service";
  nameSnapshot: string;
  quantity: number;
  unitCostSnapshot: number;
  lineTotal: number;
}

interface Bill {
  subtotal: number;
  taxAmount: number;
  total: number;
}

interface NotificationAlert {
  failed: boolean;
}

interface DeliveryState {
  activeAttempt: boolean;
  locked: boolean;
  sendFailed: boolean;
  canOverride: boolean;
}

interface ServiceHistoryEntry {
  id: string;
  ticketNumber: string;
  status: string;
  machineModel: string;
  issueDescription: string;
  createdAt: string;
}

interface ServiceHistory {
  found: boolean;
  entries: ServiceHistoryEntry[];
}

type OtpOutcome =
  | { method: "otp"; verifiedAt: string; verifiedBy: string | null }
  | { method: "override"; reason: string; overriddenBy: string | null; createdAt: string }
  | null;

interface AuditTrailEntry {
  source: string;
  actor: string | null;
  timestamp: string;
  description: string;
}

const DELIVER_ERROR_MESSAGES: Record<string, string> = {
  ticket_not_completed: "The ticket must be Completed before delivery verification can start.",
  attempt_already_active: "A delivery verification attempt is already in progress.",
};

const VERIFY_ERROR_MESSAGES: Record<string, string> = {
  code_expired: "That code has expired. Resend a new one.",
  locked: "Entry is locked after 3 incorrect attempts. An Admin or Super Admin must start a new attempt.",
};

const RESEND_ERROR_MESSAGES: Record<string, string> = {
  resend_already_used: "This attempt has already used its one resend.",
};

const CORRECT_PHONE_ERROR_MESSAGES: Record<string, string> = {
  no_send_failure_to_correct: "There is no OTP send failure to correct right now.",
};

const OVERRIDE_ERROR_MESSAGES: Record<string, string> = {
  correction_not_yet_attempted: "A phone correction must be attempted (and fail) before overriding.",
};

interface CatalogueItem {
  id: string;
  name: string;
  unitCost: number;
}

const ALL_STATUSES = ["open", "in_progress", "on_hold", "completed", "delivered", "cancelled"];

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  on_hold: "On hold",
  completed: "Completed",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

// Mirrors lib/tickets/edit-details.ts: closed tickets' intake details are locked.
const DETAILS_LOCKED_STATUSES = new Set(["delivered", "cancelled"]);

const EDIT_DETAILS_ERROR_MESSAGES: Record<string, string> = {
  ticket_locked: "Details can't be edited once a ticket is Delivered or Cancelled.",
  phone_locked_during_delivery:
    'A delivery code has been sent to the current phone number. Use "Correct phone & retry" in Delivery instead.',
  forbidden: "Your role can't edit ticket details.",
};

const DETAIL_FIELD_NAMES: Record<string, string> = {
  customerName: "customer name",
  customerPhone: "phone",
  machineModel: "machine model",
  serialNumber: "serial number",
  issueDescription: "issue",
};

type DetailsDraft = {
  customerName: string;
  customerPhone: string;
  customerAltPhone: string;
  machineModel: string;
  serialNumber: string;
  issueDescription: string;
};

type Tab = "overview" | "billing" | "activity";

function formatINR(value: number): string {
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const LINE_ITEM_ERROR_MESSAGES: Record<string, string> = {
  invalid_quantity: "Quantity must be a positive whole number.",
  invalid_unit_cost: "Price must be zero or a positive number.",
  item_inactive: "That catalogue item is no longer active.",
  ticket_status_invalid: "Parts/services can only be added while the ticket is In Progress or On Hold.",
};

const TAX_RATE_ERROR_MESSAGES: Record<string, string> = {
  invalid_tax_rate: "Tax rate must be between 0 and 100.",
  ticket_status_invalid: "The tax rate can only be changed while the ticket is In Progress or On Hold.",
};

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [bill, setBill] = useState<Bill | null>(null);
  const [notificationAlert, setNotificationAlert] = useState<NotificationAlert | null>(null);
  const [confirmingNotification, setConfirmingNotification] = useState(false);
  const [delivery, setDelivery] = useState<DeliveryState | null>(null);
  const [deliverError, setDeliverError] = useState<string | null>(null);
  const [startingDelivery, setStartingDelivery] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [reinitiateError, setReinitiateError] = useState<string | null>(null);
  const [reinitiating, setReinitiating] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [correctedPhone, setCorrectedPhone] = useState("");
  const [correctPhoneError, setCorrectPhoneError] = useState<string | null>(null);
  const [correctingPhone, setCorrectingPhone] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [overriding, setOverriding] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [toStatus, setToStatus] = useState("");
  const [comment, setComment] = useState("");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [parts, setParts] = useState<CatalogueItem[]>([]);
  const [services, setServices] = useState<CatalogueItem[]>([]);
  const [itemType, setItemType] = useState<"part" | "service">("part");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [lineItemError, setLineItemError] = useState<string | null>(null);
  const [priceEdits, setPriceEdits] = useState<Record<string, string>>({});
  const [taxRateInput, setTaxRateInput] = useState("0");
  const [taxRateError, setTaxRateError] = useState<string | null>(null);
  const [savingTaxRate, setSavingTaxRate] = useState(false);

  const [technicianOptions, setTechnicianOptions] = useState<TechnicianOption[]>([]);
  const [technicianSelection, setTechnicianSelection] = useState("");
  const [assignTechnicianError, setAssignTechnicianError] = useState<string | null>(null);
  const [assigningTechnician, setAssigningTechnician] = useState(false);

  const [serviceHistory, setServiceHistory] = useState<ServiceHistory | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [editingDetails, setEditingDetails] = useState(false);
  const [detailsDraft, setDetailsDraft] = useState<DetailsDraft | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  // The last status the server reported — the status picker is re-seeded only when this
  // changes, so the 30-second poll never clobbers a selection the user is making.
  const lastLoadedStatus = useRef<string | null>(null);
  const [otpOutcome, setOtpOutcome] = useState<OtpOutcome>(null);
  const [auditTrail, setAuditTrail] = useState<AuditTrailEntry[]>([]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tickets/${params.id}`);
    if (res.status === 404) {
      setNotFound(true);
      return;
    }
    const body = await res.json();
    setTicket(body.ticket);
    setTaxRateInput(Number(body.ticket.taxRate).toString());
    setTechnicianSelection(body.ticket.assignedTechnicianId ?? "");
    if (lastLoadedStatus.current !== body.ticket.status) {
      lastLoadedStatus.current = body.ticket.status;
      setToStatus(body.ticket.status);
    }
    setLineItems(body.lineItems);
    setBill(body.bill);
    setNotificationAlert(body.notificationAlert);
    setDelivery(body.delivery);
    setServiceHistory(body.serviceHistory);
    setOtpOutcome(body.otpOutcome);

    const auditRes = await fetch(`/api/tickets/${params.id}/audit-trail`);
    if (auditRes.ok) {
      setAuditTrail((await auditRes.json()).entries);
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  // 005-customer-notifications (research.md §7): a 30-second poll is what
  // 006-dashboard-reporting's board is expected to already have, but that feature
  // hasn't been built yet — this establishes it here so the failed-notification alert
  // meets SC-002's 30-second surfacing target without new push infrastructure.
  useEffect(() => {
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((body) => setRole(body.user?.role ?? null));
  }, []);

  const isAdminOrAbove = role === "admin" || role === "super_admin";
  // Assignment is the Service Manager's own action (post-007 product feedback) — a
  // Technician sees who's assigned but never gets the picker to assign themselves or
  // anyone else.
  const canAssignTechnician = role === "service_manager" || isAdminOrAbove;

  useEffect(() => {
    if (!canAssignTechnician) return;
    fetch(`/api/tickets/${params.id}/technicians`)
      .then((res) => (res.ok ? res.json() : { technicians: [] }))
      .then((body) => setTechnicianOptions(body.technicians));
  }, [canAssignTechnician, params.id]);

  async function handleAssignTechnician(e: React.FormEvent) {
    e.preventDefault();
    setAssignTechnicianError(null);
    setAssigningTechnician(true);
    try {
      const res = await fetch(`/api/tickets/${params.id}/assign-technician`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ technicianId: technicianSelection || null }),
      });
      if (res.ok) {
        await load();
        return;
      }
      const body = await res.json();
      setAssignTechnicianError(
        body.error.code === "invalid_technician" ? "Not an active technician in this store." : "Could not update assignment.",
      );
    } finally {
      setAssigningTechnician(false);
    }
  }

  async function handleConfirmNotification() {
    setConfirmingNotification(true);
    try {
      await fetch(`/api/tickets/${params.id}/notification-confirm`, { method: "POST" });
      await load();
    } finally {
      setConfirmingNotification(false);
    }
  }

  // TEMPORARY test aid (lib/delivery/otp-display.ts): the code the server returned while
  // SHOW_OTP_ON_SCREEN=true. To be removed before production, after confirming with the owner.
  const [testOtp, setTestOtp] = useState<string | null>(null);
  async function captureTestOtp(res: Response) {
    if (res.headers.get("content-type")?.includes("application/json")) {
      const body = await res.json().catch(() => null);
      if (body?.testOtp) setTestOtp(body.testOtp);
    }
  }

  async function handleStartDelivery() {
    setDeliverError(null);
    setStartingDelivery(true);
    try {
      const res = await fetch(`/api/tickets/${params.id}/deliver`, { method: "POST" });
      if (res.ok) {
        await captureTestOtp(res);
        await load();
        return;
      }
      const body = await res.json();
      setDeliverError(DELIVER_ERROR_MESSAGES[body.error.code] ?? "Could not start delivery verification.");
    } finally {
      setStartingDelivery(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setVerifyError(null);
    setVerifying(true);
    try {
      const res = await fetch(`/api/tickets/${params.id}/deliver/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: otpCode }),
      });
      if (res.ok) {
        setOtpCode("");
        setTestOtp(null);
        await load();
        return;
      }
      const body = await res.json();
      if (body.error.code === "incorrect_code") {
        setVerifyError(`Incorrect code. ${body.error.attemptsRemaining} attempt(s) remaining.`);
      } else {
        setVerifyError(VERIFY_ERROR_MESSAGES[body.error.code] ?? "Could not verify code.");
      }
      if (body.error.code === "locked") {
        // The 3rd wrong entry locks server-side within this same request — reload so
        // delivery.locked reflects it immediately instead of on the next 30s poll.
        await load();
      }
    } finally {
      setVerifying(false);
    }
  }

  async function handleResendCode() {
    setResendMessage(null);
    setResending(true);
    try {
      const res = await fetch(`/api/tickets/${params.id}/deliver/resend`, { method: "POST" });
      if (res.ok) {
        await captureTestOtp(res);
        setResendMessage("A new code has been sent.");
        return;
      }
      const body = await res.json();
      if (body.error.code === "cooldown_active") {
        setResendMessage(`Please wait ${body.error.retryAfterSeconds}s before resending.`);
      } else {
        setResendMessage(RESEND_ERROR_MESSAGES[body.error.code] ?? "Could not resend code.");
      }
    } finally {
      setResending(false);
    }
  }

  async function handleReinitiate() {
    setReinitiateError(null);
    setReinitiating(true);
    try {
      const res = await fetch(`/api/tickets/${params.id}/deliver/reinitiate`, { method: "POST" });
      if (res.ok) {
        await captureTestOtp(res);
        await load();
        return;
      }
      const body = await res.json();
      setReinitiateError(
        body.error?.code === "forbidden"
          ? "Only an Admin or Super Admin can start a new attempt after a lockout."
          : (DELIVER_ERROR_MESSAGES[body.error?.code] ?? "Could not start a new attempt."),
      );
    } finally {
      setReinitiating(false);
    }
  }

  async function handleCorrectPhone(e: React.FormEvent) {
    e.preventDefault();
    setCorrectPhoneError(null);
    setCorrectingPhone(true);
    try {
      const res = await fetch(`/api/tickets/${params.id}/deliver/correct-phone`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ correctedPhone }),
      });
      if (res.ok) {
        await captureTestOtp(res);
        setCorrectedPhone("");
        await load();
        return;
      }
      const body = await res.json();
      setCorrectPhoneError(CORRECT_PHONE_ERROR_MESSAGES[body.error?.code] ?? "Could not correct the phone number.");
    } finally {
      setCorrectingPhone(false);
    }
  }

  async function handleOverride(e: React.FormEvent) {
    e.preventDefault();
    setOverrideError(null);
    setOverriding(true);
    try {
      const res = await fetch(`/api/tickets/${params.id}/deliver/override`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: overrideReason }),
      });
      if (res.ok) {
        setOverrideReason("");
        await load();
        return;
      }
      const body = await res.json();
      setOverrideError(OVERRIDE_ERROR_MESSAGES[body.error?.code] ?? "Could not override delivery.");
    } finally {
      setOverriding(false);
    }
  }

  useEffect(() => {
    fetch("/api/catalogue/parts")
      .then((res) => res.json())
      .then((body) => setParts(body.parts));
    fetch("/api/catalogue/services")
      .then((res) => res.json())
      .then((body) => setServices(body.services));
  }, []);

  async function handleAddLineItem(e: React.FormEvent) {
    e.preventDefault();
    setLineItemError(null);
    const res = await fetch(`/api/tickets/${params.id}/line-items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemType, itemId, quantity: Number(quantity) }),
    });
    if (res.ok) {
      setItemId("");
      setQuantity("1");
      await load();
      return;
    }
    const body = await res.json();
    setLineItemError(LINE_ITEM_ERROR_MESSAGES[body.error.code] ?? "Could not add item.");
  }

  async function handleRemoveLineItem(lineItemId: string) {
    await fetch(`/api/tickets/${params.id}/line-items/${lineItemId}`, { method: "DELETE" });
    await load();
  }

  async function handleUpdatePrice(lineItemId: string) {
    setLineItemError(null);
    const unitCost = Number(priceEdits[lineItemId]);
    const res = await fetch(`/api/tickets/${params.id}/line-items/${lineItemId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ unitCost }),
    });
    if (res.ok) {
      setPriceEdits((prev) => ({ ...prev, [lineItemId]: "" }));
      await load();
      return;
    }
    const body = await res.json();
    setLineItemError(LINE_ITEM_ERROR_MESSAGES[body.error.code] ?? "Could not update price.");
  }

  async function handleUpdateTaxRate(e: React.FormEvent) {
    e.preventDefault();
    setTaxRateError(null);
    setSavingTaxRate(true);
    try {
      const res = await fetch(`/api/tickets/${params.id}/tax-rate`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ taxRate: Number(taxRateInput) }),
      });
      if (res.ok) {
        await load();
        return;
      }
      const body = await res.json();
      setTaxRateError(TAX_RATE_ERROR_MESSAGES[body.error.code] ?? "Could not update tax rate.");
    } finally {
      setSavingTaxRate(false);
    }
  }

  const catalogueOptions = itemType === "part" ? parts : services;

  async function handleStatusChange(e: React.FormEvent) {
    e.preventDefault();
    setStatusError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tickets/${params.id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toStatus, comment: comment || null }),
      });
      if (res.ok) {
        setComment("");
        await load();
        return;
      }
      const body = await res.json();
      const messages: Record<string, string> = {
        comment_required: "A comment is required for this transition.",
        invalid_transition: "That status change isn't allowed from the current status.",
        role_not_permitted: "Your role doesn't permit this status change.",
      };
      setStatusError(messages[body.error.code] ?? "Could not update status.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEditingDetails() {
    if (!ticket) return;
    setDetailsError(null);
    setDetailsDraft({
      customerName: ticket.customerName,
      customerPhone: ticket.customerPhone,
      customerAltPhone: ticket.customerAltPhone ?? "",
      machineModel: ticket.machineModel,
      serialNumber: ticket.serialNumber ?? "",
      issueDescription: ticket.issueDescription,
    });
    setEditingDetails(true);
  }

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!detailsDraft) return;
    setDetailsError(null);
    setSavingDetails(true);
    try {
      const res = await fetch(`/api/tickets/${params.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(detailsDraft),
      });
      if (res.ok) {
        setEditingDetails(false);
        await load();
        return;
      }
      const body = await res.json();
      setDetailsError(
        body.error.code === "missing_required_field"
          ? `Please fill in the ${DETAIL_FIELD_NAMES[body.error.field] ?? body.error.field}.`
          : (EDIT_DETAILS_ERROR_MESSAGES[body.error.code] ?? "Could not save the details."),
      );
    } finally {
      setSavingDetails(false);
    }
  }

  if (notFound) {
    return (
      <main>
        <p>No such ticket.</p>
      </main>
    );
  }

  if (!ticket) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }

  const canEditDetails = role !== null && role !== "technician" && !DETAILS_LOCKED_STATUSES.has(ticket.status);
  const showDelivery = ticket.status === "completed" || delivery?.activeAttempt || delivery?.locked || otpOutcome !== null;
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "billing", label: `Parts & billing${lineItems.length ? ` (${lineItems.length})` : ""}` },
    { id: "activity", label: `Activity${auditTrail.length ? ` (${auditTrail.length})` : ""}` },
  ];

  return (
    <main className="ticket-page">
      <header className="ticket-header">
        <div className="ticket-header__main">
          <div className="ticket-header__meta">
            <span className="ticket-header__number">{ticket.ticketNumber}</span>
            <span className={`status-pill status-${ticket.status}`}>{STATUS_LABELS[ticket.status] ?? ticket.status}</span>
          </div>
          <h1>{ticket.customerName}</h1>
          <p className="ticket-header__sub">
            {ticket.machineModel}
            {ticket.serialNumber ? ` · SN ${ticket.serialNumber}` : ""} · Received {formatDate(ticket.createdAt)}
          </p>
        </div>
        {ticket.status === "delivered" && (
          <a className="button-link" href={`/api/tickets/${ticket.id}/invoice`}>
            Download invoice
          </a>
        )}
      </header>

      {notificationAlert?.failed && (
        <div className="ticket-alert" role="alert" aria-live="assertive">
          <div>
            <strong>WhatsApp notification failed.</strong> Follow up with the customer manually, then confirm.
          </div>
          <button type="button" onClick={handleConfirmNotification} disabled={confirmingNotification}>
            Confirm manual follow-up
          </button>
        </div>
      )}

      <div className="ticket-tabs" role="tablist" aria-label="Ticket sections">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="ticket-grid" role="tabpanel" id="panel-overview" aria-labelledby="tab-overview">
          <div className="ticket-grid__main">
            <section className="card" aria-labelledby="details-heading">
              <div className="card__header">
                <h2 id="details-heading">Customer &amp; machine</h2>
                {canEditDetails && !editingDetails && (
                  <button type="button" onClick={startEditingDetails}>
                    Edit details
                  </button>
                )}
              </div>
              {editingDetails && detailsDraft ? (
                <form onSubmit={handleSaveDetails} noValidate className="details-form">
                  <div>
                    <label htmlFor="editCustomerName" className="required">
                      Customer name
                    </label>
                    <input
                      id="editCustomerName"
                      value={detailsDraft.customerName}
                      onChange={(e) => setDetailsDraft({ ...detailsDraft, customerName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="editCustomerPhone" className="required">
                      Phone
                    </label>
                    <input
                      id="editCustomerPhone"
                      value={detailsDraft.customerPhone}
                      onChange={(e) => setDetailsDraft({ ...detailsDraft, customerPhone: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="editCustomerAltPhone">Alternate phone</label>
                    <input
                      id="editCustomerAltPhone"
                      value={detailsDraft.customerAltPhone}
                      onChange={(e) => setDetailsDraft({ ...detailsDraft, customerAltPhone: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="editMachineModel" className="required">
                      Machine model
                    </label>
                    <input
                      id="editMachineModel"
                      value={detailsDraft.machineModel}
                      onChange={(e) => setDetailsDraft({ ...detailsDraft, machineModel: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="editSerialNumber" className="required">
                      Serial number
                    </label>
                    <input
                      id="editSerialNumber"
                      value={detailsDraft.serialNumber}
                      onChange={(e) => setDetailsDraft({ ...detailsDraft, serialNumber: e.target.value })}
                    />
                  </div>
                  <div className="details-form__wide">
                    <label htmlFor="editIssueDescription" className="required">
                      Issue
                    </label>
                    <textarea
                      id="editIssueDescription"
                      rows={3}
                      value={detailsDraft.issueDescription}
                      onChange={(e) => setDetailsDraft({ ...detailsDraft, issueDescription: e.target.value })}
                    />
                  </div>
                  {detailsError && (
                    <p role="alert" aria-live="assertive" className="details-form__wide form-error">
                      {detailsError}
                    </p>
                  )}
                  <div className="details-form__wide card__actions">
                    <button type="button" onClick={() => setEditingDetails(false)} disabled={savingDetails}>
                      Cancel
                    </button>
                    <button type="submit" disabled={savingDetails}>
                      Save details
                    </button>
                  </div>
                </form>
              ) : (
                <dl className="detail-list">
                  <dt>Customer</dt>
                  <dd>{ticket.customerName}</dd>
                  <dt>Phone</dt>
                  <dd>
                    {ticket.customerPhone}
                    {ticket.customerAltPhone ? ` · alt ${ticket.customerAltPhone}` : ""}
                  </dd>
                  <dt>Machine model</dt>
                  <dd>{ticket.machineModel}</dd>
                  <dt>Serial number</dt>
                  <dd className="mono">{ticket.serialNumber ?? "—"}</dd>
                  <dt>Issue</dt>
                  <dd>{ticket.issueDescription}</dd>
                  <dt>Status</dt>
                  <dd>{STATUS_LABELS[ticket.status] ?? ticket.status}</dd>
                  <dt>Received</dt>
                  <dd>{formatDateTime(ticket.createdAt)}</dd>
                </dl>
              )}
            </section>

            <section className="card" aria-labelledby="service-history-heading">
              <h2 id="service-history-heading">Service history</h2>
              {serviceHistory?.found ? (
                <ul className="history-list">
                  {serviceHistory.entries.map((entry) => (
                    <li key={entry.id}>
                      <a href={`/tickets/${entry.id}`}>{entry.ticketNumber}</a>
                      <span className={`status-pill status-${entry.status}`}>
                        {STATUS_LABELS[entry.status] ?? entry.status}
                      </span>
                      <span className="history-list__date">{formatDate(entry.createdAt)}</span>
                      <span className="history-list__issue">{entry.issueDescription}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No earlier tickets for this model number and serial number.</p>
              )}
            </section>
          </div>

          <div className="ticket-grid__side">
            <section className="card" aria-labelledby="status-change-heading">
              <h2 id="status-change-heading">Status</h2>
              <form onSubmit={handleStatusChange} noValidate>
                <div>
                  <label htmlFor="toStatus">New status</label>
                  <select id="toStatus" value={toStatus} onChange={(e) => setToStatus(e.target.value)}>
                    {ALL_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                        {s === ticket.status ? " (current)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="comment">Comment</label>
                  <textarea
                    id="comment"
                    rows={2}
                    placeholder="Required for backward moves, On hold, or Cancelled"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </div>
                {statusError && (
                  <p role="alert" aria-live="assertive" className="form-error">
                    {statusError}
                  </p>
                )}
                <button type="submit" disabled={submitting || !toStatus || toStatus === ticket.status}>
                  Update status
                </button>
              </form>
            </section>

            <section className="card" aria-labelledby="technician-heading">
              <h2 id="technician-heading">Technician</h2>
              {canAssignTechnician ? (
                <form onSubmit={handleAssignTechnician} noValidate>
                  <SearchableSelect
                    id="technicianSelection"
                    label="Assigned technician"
                    placeholder="Unassigned"
                    options={technicianOptions.map((t) => ({ id: t.id, label: t.name }))}
                    value={technicianSelection}
                    onChange={setTechnicianSelection}
                  />
                  {assignTechnicianError && (
                    <p role="alert" aria-live="assertive" className="form-error">
                      {assignTechnicianError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={assigningTechnician || technicianSelection === (ticket.assignedTechnicianId ?? "")}
                  >
                    Save assignment
                  </button>
                </form>
              ) : (
                <p>{ticket.assignedTechnicianName ?? "Unassigned"}</p>
              )}
            </section>

            {showDelivery && (
              <section className="card" aria-labelledby="delivery-heading">
                <h2 id="delivery-heading">Delivery</h2>
                {otpOutcome?.method === "otp" && (
                  <p>
                    Delivered — code verified by {otpOutcome.verifiedBy ?? "unknown"} on{" "}
                    {formatDateTime(otpOutcome.verifiedAt)}.
                  </p>
                )}
                {otpOutcome?.method === "override" && (
                  <p>
                    Delivered by override — {otpOutcome.overriddenBy ?? "unknown"} on {formatDateTime(otpOutcome.createdAt)}
                    : &quot;{otpOutcome.reason}&quot;
                  </p>
                )}
                {otpOutcome === null &&
                  (delivery?.locked ? (
                    <>
                      <p role="alert" aria-live="assertive" className="form-error">
                        Entry is locked (3 incorrect attempts, or the code and its resend both expired). An Admin or
                        Super Admin must start a new attempt.
                      </p>
                      {reinitiateError && (
                        <p role="alert" aria-live="assertive" className="form-error">
                          {reinitiateError}
                        </p>
                      )}
                      <button type="button" onClick={handleReinitiate} disabled={reinitiating}>
                        Start new attempt
                      </button>
                    </>
                  ) : !delivery?.activeAttempt ? (
                    <>
                      <p className="muted">Send a one-time WhatsApp code to the customer to confirm handover.</p>
                      {deliverError && (
                        <p role="alert" aria-live="assertive" className="form-error">
                          {deliverError}
                        </p>
                      )}
                      <button type="button" onClick={handleStartDelivery} disabled={startingDelivery}>
                        Start delivery verification
                      </button>
                    </>
                  ) : (
                    <>
                      {testOtp && (
                        <p className="test-otp" role="status">
                          <strong>Test mode — OTP: {testOtp}</strong>
                          <span>Shown on screen for testing only; this will be removed before production.</span>
                        </p>
                      )}
                      <form onSubmit={handleVerifyCode} noValidate>
                        <div>
                          <label htmlFor="otpCode" className="required">
                            One-time code
                          </label>
                          <input
                            id="otpCode"
                            inputMode="numeric"
                            required
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value)}
                          />
                        </div>
                        {verifyError && (
                          <p role="alert" aria-live="assertive" className="form-error">
                            {verifyError}
                          </p>
                        )}
                        <div className="card__actions">
                          <button type="button" onClick={handleResendCode} disabled={resending}>
                            Resend code
                          </button>
                          <button type="submit" disabled={verifying || !otpCode}>
                            Verify code
                          </button>
                        </div>
                      </form>
                      {resendMessage && (
                        <p aria-live="polite" className="muted">
                          {resendMessage}
                        </p>
                      )}
                    </>
                  ))}

                {isAdminOrAbove && delivery?.sendFailed && (
                  <div aria-labelledby="correct-phone-heading" className="card__subsection">
                    <h3 id="correct-phone-heading">OTP send failed</h3>
                    <p className="muted">The code could not be sent to the customer&apos;s phone. Correct it and retry.</p>
                    <form onSubmit={handleCorrectPhone} noValidate>
                      <div>
                        <label htmlFor="correctedPhone" className="required">
                          Corrected phone number
                        </label>
                        <input
                          id="correctedPhone"
                          required
                          value={correctedPhone}
                          onChange={(e) => setCorrectedPhone(e.target.value)}
                        />
                      </div>
                      {correctPhoneError && (
                        <p role="alert" aria-live="assertive" className="form-error">
                          {correctPhoneError}
                        </p>
                      )}
                      <button type="submit" disabled={correctingPhone || !correctedPhone}>
                        Correct phone &amp; retry
                      </button>
                    </form>
                  </div>
                )}

                {isAdminOrAbove && delivery?.canOverride && (
                  <div aria-labelledby="override-heading" className="card__subsection">
                    <h3 id="override-heading">Override to Delivered</h3>
                    <p className="muted">The corrected number also failed. Override with a recorded reason instead.</p>
                    <form onSubmit={handleOverride} noValidate>
                      <div>
                        <label htmlFor="overrideReason" className="required">
                          Reason
                        </label>
                        <textarea
                          id="overrideReason"
                          required
                          value={overrideReason}
                          onChange={(e) => setOverrideReason(e.target.value)}
                        />
                      </div>
                      {overrideError && (
                        <p role="alert" aria-live="assertive" className="form-error">
                          {overrideError}
                        </p>
                      )}
                      <button type="submit" disabled={overriding || !overrideReason}>
                        Override to Delivered
                      </button>
                    </form>
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      )}

      {tab === "billing" && (
        <section className="card" role="tabpanel" id="panel-billing" aria-labelledby="tab-billing">
          <h2 className="sr-only">Parts &amp; services</h2>
          <form onSubmit={handleAddLineItem} noValidate className="inline-form">
            <div>
              <label htmlFor="itemType">Item type</label>
              <select
                id="itemType"
                value={itemType}
                onChange={(e) => {
                  setItemType(e.target.value as "part" | "service");
                  setItemId("");
                }}
              >
                <option value="part">Part</option>
                <option value="service">Service</option>
              </select>
            </div>
            <div className="inline-form__grow">
              <label htmlFor="itemId" className="required">
                Catalogue item
              </label>
              <select id="itemId" required value={itemId} onChange={(e) => setItemId(e.target.value)}>
                <option value="">Select an item</option>
                {catalogueOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="inline-form__narrow">
              <label htmlFor="quantity" className="required">
                Quantity
              </label>
              <input
                id="quantity"
                type="number"
                min="1"
                step="1"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <button type="submit" disabled={!itemId}>
              Add to ticket
            </button>
          </form>
          {lineItemError && (
            <p role="alert" aria-live="assertive" className="form-error">
              {lineItemError}
            </p>
          )}

          <div className="table-scroll">
            <table>
              <caption className="sr-only">Applied parts &amp; services</caption>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Qty</th>
                  <th scope="col">Unit cost</th>
                  <th scope="col">Line total</th>
                  <th scope="col">Change price</th>
                  <th scope="col">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lineItems.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      No parts or services added yet.
                    </td>
                  </tr>
                )}
                {lineItems.map((li) => (
                  <tr key={li.id}>
                    <td>
                      {li.nameSnapshot}
                      <span className="muted"> · {li.itemType === "part" ? "Part" : "Service"}</span>
                    </td>
                    <td>{li.quantity}</td>
                    <td>{formatINR(li.unitCostSnapshot)}</td>
                    <td>{formatINR(li.lineTotal)}</td>
                    <td>
                      <div className="price-edit">
                        <label htmlFor={`price-${li.id}`} className="sr-only">
                          New unit cost
                        </label>
                        <input
                          id={`price-${li.id}`}
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="New price"
                          value={priceEdits[li.id] ?? ""}
                          onChange={(e) => setPriceEdits((prev) => ({ ...prev, [li.id]: e.target.value }))}
                        />
                        <button
                          type="button"
                          onClick={() => handleUpdatePrice(li.id)}
                          disabled={!(priceEdits[li.id] ?? "")}
                        >
                          Update
                        </button>
                      </div>
                    </td>
                    <td>
                      <button type="button" onClick={() => handleRemoveLineItem(li.id)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="billing-footer">
            <form onSubmit={handleUpdateTaxRate} noValidate className="inline-form">
              <div className="inline-form__narrow">
                <label htmlFor="taxRateInput">Tax rate (%)</label>
                <input
                  id="taxRateInput"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={taxRateInput}
                  onChange={(e) => setTaxRateInput(e.target.value)}
                />
              </div>
              <button type="submit" disabled={savingTaxRate}>
                Update tax rate
              </button>
              {taxRateError && (
                <p role="alert" aria-live="assertive" className="form-error">
                  {taxRateError}
                </p>
              )}
            </form>

            {bill && (
              <dl aria-label="Bill summary" className="bill-summary">
                <dt>Subtotal</dt>
                <dd>{formatINR(bill.subtotal)}</dd>
                <dt>Tax ({Number(ticket.taxRate)}%)</dt>
                <dd>{formatINR(bill.taxAmount)}</dd>
                <dt className="bill-summary__total">Total</dt>
                <dd className="bill-summary__total">{formatINR(bill.total)}</dd>
              </dl>
            )}
          </div>
        </section>
      )}

      {tab === "activity" && (
        <section className="card" role="tabpanel" id="panel-activity" aria-labelledby="tab-activity">
          <h2 className="sr-only">Activity</h2>
          {auditTrail.length === 0 ? (
            <p className="muted">No activity recorded yet.</p>
          ) : (
            <ol className="timeline">
              {[...auditTrail].reverse().map((entry, i) => (
                <li key={i} className={`timeline__item timeline__item--${entry.source}`}>
                  <div className="timeline__text">{entry.description}</div>
                  <div className="timeline__meta">
                    {entry.actor ?? "System"} · {formatDateTime(entry.timestamp)}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </main>
  );
}
