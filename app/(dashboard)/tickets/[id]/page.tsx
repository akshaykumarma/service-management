"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

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
        res.status === 403
          ? "Only an Admin or Super Admin can start a new attempt after a lockout."
          : (DELIVER_ERROR_MESSAGES[body.error?.code] ?? "Could not start a new attempt."),
      );
    } finally {
      setReinitiating(false);
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
              {entry.actorName} at {new Date(entry.createdAt).toLocaleString()}
              {entry.comment ? ` — "${entry.comment}"` : ""}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
