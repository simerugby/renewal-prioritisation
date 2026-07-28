import Link from 'next/link';
import { notFound } from 'next/navigation';
import SecondRead from '@/components/SecondRead';
import DecisionRecorder from '@/components/DecisionRecorder';
import EvidencePanel from '@/components/EvidencePanel';
import { Card, ConfidenceBadge, ErrorState, RiskPill, Stat, gbp } from '@/components/ui';
import { loadCustomer } from '@/lib/data';
import { MATERIAL_NOTE_FLAGS } from '@/lib/secondRead';
import { precomputedSecondRead } from '@/lib/secondReadBatch';

/**
 * Rendered per request rather than pre-generated, for two reasons.
 *
 * Correctness: `notFound()` inside a statically generated route is cached and
 * served with HTTP 200. The not-found UI appeared but the status line said the
 * resource existed, which is wrong and is the kind of thing that quietly breaks
 * a monitor or a crawler.
 *
 * Scale: pre-rendering every account is fine at 40 and is a build-time bomb at
 * 40,000. Per-request rendering costs nothing here — the portfolio is parsed and
 * scored once per process and served from cache — and it is what a live data
 * source would need anyway.
 */
export const dynamic = 'force-dynamic';

/**
 * Metadata also performs the existence check, so an unknown id 404s early.
 *
 * The subtlety worth recording: `notFound()` cannot set a 404 once the response
 * has begun streaming, and a `loading.tsx` anywhere above a route creates the
 * Suspense boundary that starts it. With one at the app root, every unknown
 * customer id rendered the correct not-found page under an HTTP 200.
 *
 * The fix is the route group: `app/(portfolio)/loading.tsx` scopes the skeleton
 * to the portfolio page, which is the one that benefits from streaming, and
 * leaves this route unwrapped so its 404 is a real 404. Both behaviours are
 * asserted in `npm run smoke`.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await loadCustomer(id).catch(() => null);
  if (!row) notFound();
  return {
    title: `${row.customer.customerName} — Renewal Prioritisation`,
    description: `${row.riskBand} risk, priority #${row.priorityRank}. ${row.playbook.action}.`,
  };
}

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let row;
  try {
    row = await loadCustomer(id);
  } catch (err) {
    return (
      <ErrorState
        title="Could not load this account"
        detail={err instanceof Error ? err.message : undefined}
        retry={
          <Link href="/" className="text-[12px] text-accent hover:underline">
            Back to the portfolio
          </Link>
        }
      />
    );
  }

  if (!row) notFound();

  const c = row.customer;
  const secondRead = await precomputedSecondRead(c.customerId);

  // The case this product exists for: nine structured signals are calm and the
  // free-text note is not. Quantum Public Sector is the largest account in the
  // book, scores 15, and its note says the sponsor leaves on 1 August. Putting
  // that next to the score is the difference between the app making the point
  // and the reader having to scroll for it.
  const materialNoteFlags = row.noteFlags.filter((f) => MATERIAL_NOTE_FLAGS.includes(f.key));
  const quietButFlagged =
    (row.riskBand === 'Stable' || row.riskBand === 'Watch') && materialNoteFlags.length > 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/" className="text-[12px] text-muted hover:text-accent hover:underline">
          ← Portfolio
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[22px] font-semibold tracking-tight">{c.customerName}</h1>
          <RiskPill band={row.riskBand} score={row.riskScore} />
          <ConfidenceBadge level={row.confidence} coverage={row.modelCoverage} />
        </div>
        <p className="mt-1 text-[12px] text-muted">
          {c.customerId} · {c.segment} · {c.industry} · {c.region} · CSM {c.csmName} ·{' '}
          {c.productsOwned.join(', ')}
        </p>

        {quietButFlagged && (
          <p className="mt-2.5 rounded border border-risk-elevated/30 bg-risk-elevated-bg px-3 py-2 text-[12px] leading-relaxed">
            <span className="font-semibold text-risk-elevated">The score is calm; the note is not.</span>{' '}
            Every scored signal sits in a normal range, but the account note flags{' '}
            {materialNoteFlags.map((f) => f.label.toLowerCase()).join(' and ')}. Nothing in the structured
            data can see this.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-lg border border-border-subtle bg-surface px-4 py-3.5 md:grid-cols-5">
        <Stat label="ARR" value={gbp(c.arrGbp)} hint={`${c.contractTermMonths}-month term`} />
        <Stat label="Renews" value={c.renewalDate} hint={`${row.daysToRenewal} days from snapshot`} />
        <Stat label="Risk score" value={row.riskScore.toFixed(0)} hint={`${row.riskBand} · out of 100`} />
        <Stat
          label="Priority rank"
          value={`#${row.priorityRank}`}
          hint={
            row.riskOnlyRank === row.priorityRank
              ? 'Same on risk alone'
              : `Risk alone would rank it #${row.riskOnlyRank}`
          }
        />
        <Stat label="Renewal stage" value={c.renewalStage} hint={`Invoice ${c.invoiceStatus.toLowerCase()}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Card
            title="Evidence behind the score"
            subtitle="Every point attributed to the signal that produced it. Disagree with a line, not with the total."
          >
            <EvidencePanel row={row} />
          </Card>

          {row.contradictions.length > 0 && (
            <Card
              title="Signals that disagree"
              subtitle="Left unresolved on purpose. Picking a side here would invent a fact — these lower confidence instead of moving the score."
            >
              <ul className="flex flex-col gap-3">
                {row.contradictions.map((x) => (
                  <li key={x.key}>
                    <p className="text-[12px] font-medium">{x.summary}</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{x.detail}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card
            title="Account note"
            subtitle="Free text from the CRM. No rule in the scoring model reads this column."
          >
            <p className="text-[13px] leading-relaxed">{c.customerNotes || <span className="text-muted-2">No note recorded.</span>}</p>
            {row.noteFlags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {row.noteFlags.map((f) => (
                  <span
                    key={f.key}
                    title={f.quote}
                    className="rounded border border-border-subtle bg-surface-2 px-1.5 py-0.5 text-[11px] text-muted"
                  >
                    {f.label}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-2.5 text-[11px] leading-relaxed text-muted-2">
              Tags above come from a keyword scanner, not a model. They select the triage list on the
              portfolio page, and they are the control group the second read is measured against.
            </p>
          </Card>

          <Card title="Data freshness" subtitle="What was known, and when it was last true.">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
              <div>
                <dt className="text-muted-2">Usage last synced</dt>
                <dd className="tnum mt-0.5">
                  {c.usageDataLastSyncedAt}{' '}
                  <span className={row.usageDataAgeDays > 7 ? 'text-risk-elevated' : 'text-muted'}>
                    ({row.usageDataAgeDays}d before snapshot)
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-muted-2">NPS response</dt>
                <dd className="tnum mt-0.5">
                  {c.npsResponseDate ?? <span className="text-muted-2">not recorded</span>}{' '}
                  {row.npsAgeDays !== null && (
                    <span className={row.npsAgeDays > 120 ? 'text-risk-elevated' : 'text-muted'}>
                      ({row.npsAgeDays}d)
                    </span>
                  )}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-2">Why confidence is {row.confidence.toLowerCase()}</dt>
                <dd className="mt-0.5 leading-relaxed text-muted">{row.confidenceReasons.join(' ')}</dd>
              </div>
            </dl>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Suggested next action" subtitle="Chosen by a decision table, not by a model. The rule that fired is stated below.">
            <p className="text-[14px] font-medium leading-snug">{row.playbook.action}</p>
            <div className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-muted-2">
              <span>{row.playbook.urgency}</span>
              <span>Owner: {row.playbook.owner}</span>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">{row.playbook.rationale}</p>
          </Card>

          <Card title="Second read" subtitle="The one place this product calls a model. It reads the note; it does not touch the score.">
            <SecondRead customerId={c.customerId} initial={secondRead} />
          </Card>

          <Card title="Decide and record" subtitle="What happens next, and who owns it.">
            <DecisionRecorder
              customerId={c.customerId}
              suggestedAction={row.playbook.action}
              suggestedOwner={row.playbook.owner}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
