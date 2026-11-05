/**
 * Shared server rendering for the loop dashboards (lane B6;
 * DESIGN.md component G). Pure presentational components over the
 * dashboards.ts read models: they format what the read model
 * decided and compute nothing. In particular, when the read model
 * withheld totals (stamp not trustworthy), these components render
 * the failure and the word "withheld" where numbers would go; they
 * never fall back to showing unreconciled numbers.
 */

import type {
  DashboardTotals,
  DecisionOutcome,
  ReconciliationStamp,
} from "./dashboards";

const CLASSIFICATION_ORDER = [
  "COUNTED",
  "SELF",
  "BOT",
  "DUPLICATE",
  "RATE_LIMITED",
  "INVALID",
] as const;

/**
 * The reconciliation stamp, in the design's form when it verifies:
 * "Totals computed from N ledger rows, M counted, chain verified to
 * row hash <short>, at <time>." When it does not verify, the
 * failure is the headline and no totals are presented as truth.
 */
export function StampSection({ stamp }: { stamp: ReconciliationStamp }) {
  if (!stamp.trustworthy) {
    return (
      <section role="alert">
        <h2>Ledger verification failed: totals withheld</h2>
        <p>
          The event ledger does not verify
          {stamp.failure ? (
            <>
              {" "}
              (day {stamp.failure.day}, row {stamp.failure.atRow}:{" "}
              {stamp.failure.reason})
            </>
          ) : null}
          . No totals on this page are served as truth until the
          ledger verifies and the recount matches.
        </p>
        <p>
          Chain verified: no. Recount match:{" "}
          {stamp.recountMatch ? "yes" : "no"}. Rows scanned:{" "}
          {stamp.rowsScanned}. Read at {stamp.generatedAt}.
        </p>
      </section>
    );
  }
  return (
    <section>
      <h2>Reconciliation</h2>
      <p>
        Totals computed from {stamp.rows} ledger rows,{" "}
        {stamp.countedRows} counted, chain verified to row hash{" "}
        {stamp.lastRowHashShort ?? "none"}, at {stamp.generatedAt}.
        An independent recount of the raw ledger rows matches these
        totals.
      </p>
    </section>
  );
}

/** Counted totals plus the excluded counts by classification. */
export function TotalsSection({
  title,
  totals,
}: {
  title: string;
  totals: DashboardTotals | null;
}) {
  return (
    <section>
      <h3>{title}</h3>
      {totals === null ? (
        <p>Withheld: the ledger does not verify.</p>
      ) : (
        <>
          <dl>
            <dt>Rows</dt>
            <dd>{totals.rows}</dd>
            <dt>Counted impressions</dt>
            <dd>{totals.impressions}</dd>
            <dt>Counted clicks</dt>
            <dd>{totals.clicks}</dd>
          </dl>
          <h4>Rows by classification</h4>
          <dl>
            {CLASSIFICATION_ORDER.map((classification) => (
              <div key={classification}>
                <dt>{classification}</dt>
                <dd>{totals.byClassification[classification]}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}

/** Recent placement-decision outcomes (eligible and named rejections). */
export function DecisionsSection({
  decisions,
}: {
  decisions: DecisionOutcome[];
}) {
  return (
    <section>
      <h2>Recent placement decisions</h2>
      {decisions.length === 0 ? (
        <p>No placement decisions have been recorded yet.</p>
      ) : (
        <ul>
          {decisions.map((decision) => (
            <li key={decision.decisionId}>
              {decision.evaluatedAt}:{" "}
              {decision.eligible
                ? "eligible"
                : "rejected (" + (decision.reason ?? "unnamed") + ")"}{" "}
              on {decision.surface}, slot {decision.slotId ?? "none"},
              campaign {decision.campaignId ?? "none"} (decision{" "}
              {decision.decisionId})
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
