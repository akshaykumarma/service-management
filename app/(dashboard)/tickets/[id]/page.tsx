"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { formatDate, formatDateTime } from "@/lib/format/date";

interface TicketDetail {
  id: string;
  ticketNumber: string;
  status: string;
  customerName: string;
  customerPhone: string;
  machineModel: string;
  issueDescription: string;
  createdAt: string;
}

interface HistoryEntryRow {
  fromStatus: string | null;
  toStatus: string;
  actorId: string;
  actorName: string;
  comment: string | null;
  createdAt: string;
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
  createdAt: string;
}

interface ServiceHistory {
  found: boolean;
  entries: ServiceHistoryEntry[];
}

interface NotificationLogEntry {
  type: string;
  channel: string;
  recipientPhone: string;
  status: string;
  sentAt: string;
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

const LINE_ITEM_ERROR_MESSAGES: Record<string, string> = {
  invalid_quantity: "Quantity must be a positive whole number.",
  item_inactive: "That catalogue item is no longer active.",
  ticket_status_invalid: "Parts/services can only be added while the ticket is In Progress or On Hold.",
  bill_locked: "This ticket's bill is locked — it has already reached Completed.",
};

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [statusHistory, setStatusHistory] = useState<HistoryEntryRow[]>([]);
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

  const [serviceHistory, setServiceHistory] = useState<ServiceHistory | null>(null);
  const [notificationLog, setNotificationLog] = useState<NotificationLogEntry[]>([]);
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
    setStatusHistory(body.statusHistory);
    setLineItems(body.lineItems);
    setBill(body.bill);
    setNotificationAlert(body.notificationAlert);
    setDelivery(body.delivery);
    setServiceHistory(body.serviceHistory);
    setNotificationLog(body.notificationLog);
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

  async function handleConfirmNotification() {
    setConfirmingNotification(true);
    try {
      await fetch(`/api/tickets/${params.id}/notification-confirm`, { method: "POST" });
      await load();
    } finally {
      setConfirmingNotification(false);
    }
  }

  async function handleStartDelivery() {
    setDeliverError(null);
    setStartingDelivery(true);
    try {
      const res = await fetch(`/api/tickets/${params.id}/deliver`, { method: "POST" });
      if (res.ok) {
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
        setToStatus("");
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

  return (
    <main>
      <h1>{ticket.ticketNumber}</h1>
      <section aria-labelledby="intake-heading">
        <h2 id="intake-heading">Intake information</h2>
        <dl>
          <dt>Customer</dt>
          <dd>{ticket.customerName}</dd>
          <dt>Phone</dt>
          <dd>{ticket.customerPhone}</dd>
          <dt>Machine model</dt>
          <dd>{ticket.machineModel}</dd>
          <dt>Issue</dt>
          <dd>{ticket.issueDescription}</dd>
          <dt>Status</dt>
          <dd>{ticket.status}</dd>
        </dl>
      </section>

      {notificationAlert?.failed && (
        <section aria-labelledby="notification-alert-heading" role="alert" aria-live="assertive">
          <h2 id="notification-alert-heading">Notification delivery failed</h2>
          <p>The WhatsApp notification to this customer failed to send. Follow up manually, then confirm below.</p>
          <button type="button" onClick={handleConfirmNotification} disabled={confirmingNotification}>
            Confirm manual follow-up
          </button>
        </section>
      )}

      <section aria-labelledby="status-change-heading">
        <h2 id="status-change-heading">Change status</h2>
        <form onSubmit={handleStatusChange} noValidate>
          <div>
            <label htmlFor="toStatus">New status</label>
            <select id="toStatus" required value={toStatus} onChange={(e) => setToStatus(e.target.value)}>
              <option value="">Select a status</option>
              {ALL_STATUSES.filter((s) => s !== ticket.status).map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="comment">Comment (required for backward moves, On Hold, or Cancelled)</label>
            <textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
          {statusError && (
            <p role="alert" aria-live="assertive">
              {statusError}
            </p>
          )}
          <button type="submit" disabled={submitting || !toStatus}>
            Update status
          </button>
        </form>
      </section>

      {(ticket.status === "completed" || delivery?.activeAttempt || delivery?.locked) && (
        <section aria-labelledby="delivery-heading">
          <h2 id="delivery-heading">Delivery verification</h2>
          {delivery?.locked ? (
            <>
              <p role="alert" aria-live="assertive">
                Entry is locked (3 incorrect attempts, or the code and its resend both expired). An Admin or Super
                Admin must start a new attempt.
              </p>
              {reinitiateError && (
                <p role="alert" aria-live="assertive">
                  {reinitiateError}
                </p>
              )}
              <button type="button" onClick={handleReinitiate} disabled={reinitiating}>
                Start new attempt
              </button>
            </>
          ) : !delivery?.activeAttempt ? (
            <>
              <p>Send a one-time WhatsApp code to the customer to confirm delivery.</p>
              {deliverError && (
                <p role="alert" aria-live="assertive">
                  {deliverError}
                </p>
              )}
              <button type="button" onClick={handleStartDelivery} disabled={startingDelivery}>
                Start delivery verification
              </button>
            </>
          ) : (
            <>
              <form onSubmit={handleVerifyCode} noValidate>
                <div>
                  <label htmlFor="otpCode">One-time code</label>
                  <input
                    id="otpCode"
                    inputMode="numeric"
                    required
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                  />
                </div>
                {verifyError && (
                  <p role="alert" aria-live="assertive">
                    {verifyError}
                  </p>
                )}
                <button type="submit" disabled={verifying || !otpCode}>
                  Verify code
                </button>
              </form>
              {resendMessage && <p aria-live="polite">{resendMessage}</p>}
              <button type="button" onClick={handleResendCode} disabled={resending}>
                Resend code
              </button>
            </>
          )}

          {isAdminOrAbove && delivery?.sendFailed && (
            <div aria-labelledby="correct-phone-heading">
              <h3 id="correct-phone-heading">OTP send failed</h3>
              <p>The one-time code could not be sent to the customer&apos;s phone. Correct the number and retry.</p>
              <form onSubmit={handleCorrectPhone} noValidate>
                <div>
                  <label htmlFor="correctedPhone">Corrected phone number</label>
                  <input
                    id="correctedPhone"
                    required
                    value={correctedPhone}
                    onChange={(e) => setCorrectedPhone(e.target.value)}
                  />
                </div>
                {correctPhoneError && (
                  <p role="alert" aria-live="assertive">
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
            <div aria-labelledby="override-heading">
              <h3 id="override-heading">Override to Delivered</h3>
              <p>The corrected number also failed to receive the code. Override with a recorded reason instead.</p>
              <form onSubmit={handleOverride} noValidate>
                <div>
                  <label htmlFor="overrideReason">Reason</label>
                  <textarea
                    id="overrideReason"
                    required
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                  />
                </div>
                {overrideError && (
                  <p role="alert" aria-live="assertive">
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

      <section aria-labelledby="line-items-heading">
        <h2 id="line-items-heading">Parts &amp; services</h2>
        <form onSubmit={handleAddLineItem} noValidate>
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
          <div>
            <label htmlFor="itemId">Catalogue item</label>
            <select id="itemId" required value={itemId} onChange={(e) => setItemId(e.target.value)}>
              <option value="">Select an item</option>
              {catalogueOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="quantity">Quantity</label>
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
          {lineItemError && (
            <p role="alert" aria-live="assertive">
              {lineItemError}
            </p>
          )}
          <button type="submit" disabled={!itemId}>
            Add to ticket
          </button>
        </form>

        <table>
          <caption>Applied parts &amp; services</caption>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Quantity</th>
              <th scope="col">Unit cost</th>
              <th scope="col">Line total</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {lineItems.map((li) => (
              <tr key={li.id}>
                <td>{li.nameSnapshot}</td>
                <td>{li.quantity}</td>
                <td>{li.unitCostSnapshot.toFixed(2)}</td>
                <td>{li.lineTotal.toFixed(2)}</td>
                <td>
                  <button type="button" onClick={() => handleRemoveLineItem(li.id)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {bill && (
          <dl aria-label="Bill summary">
            <dt>Subtotal</dt>
            <dd>{bill.subtotal.toFixed(2)}</dd>
            <dt>Tax</dt>
            <dd>{bill.taxAmount.toFixed(2)}</dd>
            <dt>Total</dt>
            <dd>{bill.total.toFixed(2)}</dd>
          </dl>
        )}
      </section>

      <section aria-labelledby="status-history-heading">
        <h2 id="status-history-heading">Status timeline</h2>
        <ul>
          {statusHistory.map((entry, i) => (
            <li key={i}>
              {entry.fromStatus ? `${entry.fromStatus} → ${entry.toStatus}` : `Created (${entry.toStatus})`} by{" "}
              {entry.actorName} at {formatDateTime(entry.createdAt)}
              {entry.comment ? ` — "${entry.comment}"` : ""}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="service-history-heading">
        <h2 id="service-history-heading">Service history</h2>
        {serviceHistory?.found ? (
          <ul>
            {serviceHistory.entries.map((entry) => (
              <li key={entry.id}>
                <a href={`/tickets/${entry.id}`}>{entry.ticketNumber}</a> — {entry.status} (
                {formatDate(entry.createdAt)})
              </li>
            ))}
          </ul>
        ) : (
          <p>No prior service history for this machine model.</p>
        )}
      </section>

      <section aria-labelledby="notification-log-heading">
        <h2 id="notification-log-heading">WhatsApp notification log</h2>
        {notificationLog.length === 0 ? (
          <p>No notifications sent yet.</p>
        ) : (
          <table>
            <caption>Notifications sent for this ticket</caption>
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">To</th>
                <th scope="col">Status</th>
                <th scope="col">Sent at</th>
              </tr>
            </thead>
            <tbody>
              {notificationLog.map((n, i) => (
                <tr key={i}>
                  <td>{n.type}</td>
                  <td>{n.recipientPhone}</td>
                  <td>{n.status}</td>
                  <td>{formatDateTime(n.sentAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="otp-outcome-heading">
        <h2 id="otp-outcome-heading">OTP verification outcome</h2>
        {otpOutcome === null && <p>No delivery verification outcome recorded yet.</p>}
        {otpOutcome?.method === "otp" && (
          <p>
            Verified by {otpOutcome.verifiedBy ?? "unknown"} at {formatDateTime(otpOutcome.verifiedAt)}.
          </p>
        )}
        {otpOutcome?.method === "override" && (
          <p>
            Delivery overridden by {otpOutcome.overriddenBy ?? "unknown"} at{" "}
            {formatDateTime(otpOutcome.createdAt)} — reason: &quot;{otpOutcome.reason}&quot;
          </p>
        )}
      </section>

      <section aria-labelledby="audit-trail-heading">
        <h2 id="audit-trail-heading">Audit trail</h2>
        <table>
          <caption>Every recorded mutation to this ticket, chronologically</caption>
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Actor</th>
              <th scope="col">What changed</th>
            </tr>
          </thead>
          <tbody>
            {auditTrail.map((entry, i) => (
              <tr key={i}>
                <td>{formatDateTime(entry.timestamp)}</td>
                <td>{entry.actor ?? "System"}</td>
                <td>{entry.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
