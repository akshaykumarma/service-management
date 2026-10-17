import type { ReactNode } from "react";

export interface SummaryLink {
  href: string;
  label: string;
  primary?: boolean;
}

/**
 * The screen right after a service or demo ticket is created (post-v1 product feedback):
 * the complete ticket details at the top, then its history, then what to do next.
 */
export default function CreatedTicketSummary({
  heading,
  ticketNumber,
  statusLabel,
  statusKey,
  kindBadge,
  details,
  notice,
  history,
  links,
}: {
  heading: string;
  ticketNumber: string;
  statusLabel: string;
  /** Status value for the pill's colour class (`status-${statusKey}`). */
  statusKey: string;
  kindBadge?: string;
  /** Label → value rows; empty values show as "—". */
  details: [string, ReactNode][];
  /** Optional callout above the details (e.g. the repeat-demo warning). */
  notice?: ReactNode;
  history: ReactNode;
  links: SummaryLink[];
}) {
  return (
    <div className="created-ticket">
      <header className="ticket-header">
        <div className="ticket-header__main">
          <div className="ticket-header__meta">
            <span className="ticket-header__number">{ticketNumber}</span>
            <span className={`status-pill status-${statusKey}`}>{statusLabel}</span>
            {kindBadge && <span className="ticket-kind-badge">{kindBadge}</span>}
          </div>
          <h1>{heading}</h1>
          <p className="ticket-header__sub" role="status">
            Saved. A WhatsApp message with these details has been triggered for the customer (see the ticket&apos;s
            Activity).
          </p>
        </div>
        <div className="ticket-header__actions">
          {links
            .filter((l) => l.primary)
            .map((l) => (
              <a key={l.href} className="button-link" href={l.href}>
                {l.label}
              </a>
            ))}
        </div>
      </header>

      {notice}

      <div className="created-ticket__grid">
        <section className="card" aria-labelledby="created-details-heading">
          <h2 id="created-details-heading">Ticket details</h2>
          <dl className="detail-list">
            {details.map(([label, value]) => (
              <div key={label} style={{ display: "contents" }}>
                <dt>{label}</dt>
                <dd>{value === null || value === undefined || value === "" ? "—" : value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="card" aria-labelledby="created-history-heading">
          <h2 id="created-history-heading">History</h2>
          {history}
        </section>
      </div>

      <p className="created-ticket__links">
        {links
          .filter((l) => !l.primary)
          .map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
      </p>
    </div>
  );
}
