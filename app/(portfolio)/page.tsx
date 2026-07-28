import Link from 'next/link';
import DataQualityBanner from '@/components/DataQualityBanner';
import PortfolioTable from '@/components/PortfolioTable';
import PriorityScatter from '@/components/PriorityScatter';
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
        <Stat label="ARR under management" value={gbp(totalArr)} hint={`${rows.length} accounts`} />
        <Stat
          label="Renewing in 30 days"
          value={gbp(soon.reduce((s, r) => s + r.customer.arrGbp, 0))}
          hint={`${soon.length} accounts`}
        />
        <Stat
          label="Need attention"
          value={needsAttention.length}
          hint={`${gbp(needsAttention.reduce((s, r) => s + r.customer.arrGbp, 0))} at elevated risk or worse`}
        />
        <Stat
          label="Scored on partial data"
          value={lowConfidence.length}
          hint="Signals missing, stale or contradictory"
        />
      </div>

      {top && (
        <Card title="Start here" subtitle="The account where the next hour of CSM time is worth most — and why.">
          <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
            <div className="min-w-[220px]">
              <Link
                href={`/customer/${top.customer.customerId}`}
                className="text-[16px] font-semibold hover:text-accent hover:underline"
              >
                {top.customer.customerName}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <RiskPill band={top.riskBand} score={top.riskScore} />
                <span className="tnum text-[12px] text-muted">
                  {gbp(top.customer.arrGbp)} · renews in {top.daysToRenewal} days
                </span>
              </div>
            </div>
            <div className="flex-1 basis-[320px]">
              <p className="text-[13px] font-medium">{top.playbook.action}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">{top.playbook.rationale}</p>
            </div>
          </div>
        </Card>
      )}

      <Card
        title="Risk against value at stake"
        subtitle="The two questions the priority score combines. Top-right is where the trouble and the money coincide; top-left is the quiet, expensive corner a risk-sorted queue never reaches."
      >
        <PriorityScatter rows={rows} />
      </Card>

      <PortfolioTable rows={rows} />

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
