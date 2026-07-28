import Link from 'next/link';
import { Suspense } from 'react';
import DataQualityBanner from '@/components/DataQualityBanner';
import PortfolioTable from '@/components/PortfolioTable';
import PriorityScatter from '@/components/PriorityScatter';
import { MATERIAL_NOTE_FLAGS } from '@/lib/secondRead';
import { Card, EmptyState, ErrorState, RiskPill, Stat, gbp } from '@/components/ui';
import { DataLoadError, loadPortfolio, type Portfolio } from '@/lib/data';

export default async function PortfolioPage() {
  let portfolio: Portfolio;
  try {
    portfolio = await loadPortfolio();
  } catch (err) {
    // The page renders its own failure rather than throwing to the error
    // boundary, so a broken data file still leaves the reviewer with a usable
    // explanation instead of a blank screen.
    return (
      <ErrorState
        title="The portfolio data could not be loaded"
        detail={
          err instanceof DataLoadError
            ? [err.message, err.hint].filter(Boolean).join(' ')
            : err instanceof Error
              ? err.message
              : 'Unknown error reading the portfolio file.'
        }
      />
    );
  }

  const { rows } = portfolio;

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No accounts in this portfolio"
        hint="The file loaded and validated but contains no scoreable accounts. Check that the export covers the period you expect."
      />
    );
  }

  const totalArr = rows.reduce((s, r) => s + r.customer.arrGbp, 0);
  const soon = rows.filter((r) => r.daysToRenewal <= 30);
  const needsAttention = rows.filter((r) => r.riskBand === 'Critical' || r.riskBand === 'Elevated');
  const lowConfidence = rows.filter((r) => r.confidence !== 'High');
  const top = rows[0];

  // The accounts a purely quantitative queue never reaches: the score is calm
  // and the account note is not. Deterministic on purpose — the keyword scanner
  // produces a usable list here, and the model, tuned to the recall needed to
  // catch the flagship account, flags 19 of the 28 calm accounts. Measured, not
  // assumed: `npm run eval:beyond`.
  const quietButFlagged = rows.filter(
    (r) =>
      (r.riskBand === 'Stable' || r.riskBand === 'Watch') &&
      r.noteFlags.some((f) => MATERIAL_NOTE_FLAGS.includes(f.key)),
  );

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Renewal portfolio</h1>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted">
          {rows.length} accounts, ranked by where an hour of CSM time is worth most. Priority combines how
          much trouble an account is in, how much revenue is at stake, and how soon it renews — three
          separate questions that a single health score blurs together.
        </p>
      </div>

      <DataQualityBanner issues={portfolio.issues} quarantined={portfolio.quarantined} total={rows.length} />

      <div className="grid grid-cols-2 gap-4 rounded-lg border border-border-subtle bg-surface px-4 py-3.5 md:grid-cols-4">
        <Stat label="ARR under management" value={gbp(totalArr)} hint={`${rows.length} accounts`} href="/?view=all#book" />
        <Stat
          label="Renewing in 30 days"
          value={gbp(soon.reduce((s, r) => s + r.customer.arrGbp, 0))}
          hint={`${soon.length} accounts`}
          href="/?view=soon#book"
        />
        <Stat
          label="Need attention"
          value={needsAttention.length}
          hint={`${gbp(needsAttention.reduce((s, r) => s + r.customer.arrGbp, 0))} at elevated risk or worse`}
          href="/?view=attention#book"
        />
        <Stat
          label="Scored on partial data"
          value={lowConfidence.length}
          hint="Signals missing, stale or contradictory"
          href="/?view=partial#book"
        />
      </div>

      {/*
        The hero. Everything else on this page is a list; this is the one answer,
        so it gets the only accent border on the page and the only 26px type.
        A CSM who reads nothing else should still leave knowing one account, one
        reason and one action.
      */}
      {top && (
        <section className="overflow-hidden rounded-lg border border-accent/30 bg-surface">
          <div className="flex items-center gap-2 border-b border-border-subtle bg-accent-soft px-4 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">Start here</span>
            <span className="text-[11px] text-muted">
              Where the next hour of CSM time is worth most
            </span>
          </div>

          <div className="grid gap-x-8 gap-y-4 px-4 py-4 lg:grid-cols-[minmax(0,340px)_1fr]">
            <div>
              <Link
                href={`/customer/${top.customer.customerId}`}
                className="text-[26px] font-semibold leading-tight tracking-tight hover:text-accent"
              >
                {top.customer.customerName}
              </Link>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <RiskPill band={top.riskBand} score={top.riskScore} />
                <span className="text-[11px] text-muted-2">
                  {top.customer.segment} · {top.customer.region}
                </span>
              </div>
              <dl className="mt-3 flex gap-6">
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-muted-2">At stake</dt>
                  <dd className="tnum text-[17px] font-semibold">{gbp(top.customer.arrGbp)}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-muted-2">Renews in</dt>
                  <dd className="tnum text-[17px] font-semibold text-risk-critical">
                    {top.daysToRenewal} days
                  </dd>
                </div>
              </dl>
            </div>

            <div className="border-t border-border-subtle pt-4 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              <p className="text-[10px] uppercase tracking-wide text-muted-2">Do this first</p>
              <p className="mt-1 text-[15px] font-semibold leading-snug">{top.playbook.action}</p>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">{top.playbook.rationale}</p>
              <p className="mt-3 text-[11px] text-muted-2">
                {top.playbook.urgency} · Owner: {top.playbook.owner} ·{' '}
                <Link href={`/customer/${top.customer.customerId}`} className="text-accent hover:underline">
                  Open the evidence
                </Link>
              </p>
            </div>
          </div>
        </section>
      )}

      {quietButFlagged.length > 0 && (
        <Card
          title="The score is calm; the note is not"
          subtitle="These accounts all score in the stable or watch band, and the free-text note says otherwise. A risk-sorted queue never reaches them."
        >
          <p className="tnum mb-3 text-[13px]">
            <span className="font-semibold">{quietButFlagged.length} accounts</span>
            <span className="text-muted"> · </span>
            <span className="font-semibold">{gbp(quietButFlagged.reduce((s, r) => s + r.customer.arrGbp, 0))}</span>
            <span className="text-muted">
              {' '}at priority ranks {Math.min(...quietButFlagged.map((r) => r.priorityRank))}&ndash;
              {Math.max(...quietButFlagged.map((r) => r.priorityRank))}
            </span>
          </p>

          {/* A table, not a run of links: the point is that these are scannable
              against each other by value and by what the note actually says. */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-border-subtle text-left text-[10px] uppercase tracking-wide text-muted-2">
                  <th className="py-1.5 pr-3 font-medium">#</th>
                  <th className="py-1.5 pr-3 font-medium">Account</th>
                  <th className="py-1.5 pr-3 font-medium">ARR</th>
                  <th className="py-1.5 pr-3 font-medium">Score says</th>
                  <th className="py-1.5 font-medium">The note says</th>
                </tr>
              </thead>
              <tbody>
                {quietButFlagged.map((r) => (
                  <tr key={r.customer.customerId} className="group border-b border-border-subtle last:border-0">
                    <td className="tnum py-2 pr-3 align-top text-muted-2">{r.priorityRank}</td>
                    <td className="py-2 pr-3 align-top">
                      <Link
                        href={`/customer/${r.customer.customerId}`}
                        className="font-medium group-hover:text-accent group-hover:underline"
                      >
                        {r.customer.customerName}
                      </Link>
                    </td>
                    <td className="tnum py-2 pr-3 align-top">{gbp(r.customer.arrGbp)}</td>
                    <td className="py-2 pr-3 align-top text-muted">
                      {r.riskBand} {r.riskScore.toFixed(0)}
                    </td>
                    <td className="py-2 align-top text-risk-elevated">
                      {r.noteFlags
                        .filter((f) => MATERIAL_NOTE_FLAGS.includes(f.key))
                        .map((f) => f.label.toLowerCase())
                        .join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-muted-2">
            Selected by the keyword scanner, not by the model &mdash; measured, not assumed. Use the{' '}
            <span className="text-muted">Note disagrees</span> filter below to work the list, and open any
            account for a second read of its note.
          </p>
        </Card>
      )}

      <Card
        title="Risk against value at stake"
        subtitle="The two questions the priority score combines. Top-right is where the trouble and the money coincide; top-left is the quiet, expensive corner a risk-sorted queue never reaches."
      >
        <PriorityScatter rows={rows} />
      </Card>

      <Suspense fallback={<div className="skeleton h-64 rounded-lg" aria-hidden />}>
        <PortfolioTable rows={rows} />
      </Suspense>

      <p className="text-[12px] leading-relaxed text-muted-2">
        The <span className="text-muted">vs risk</span> column shows how far the value-and-urgency weighting
        moved an account from where risk alone would have placed it.{' '}
        <Link href="/method" className="text-accent hover:underline">
          How the score works
        </Link>
        .
      </p>
    </div>
  );
}
