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

/** Urgency is a state, so it wears the status treatment rather than grey text. */
const URGENCY_TONE: Record<string, string> = {
  Today: 'bg-risk-critical-bg text-risk-critical',
  'This week': 'bg-risk-elevated-bg text-risk-elevated',
  'This month': 'bg-surface-2 text-muted',
  Scheduled: 'bg-surface-2 text-muted-2',
};

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
  /*
   * The top of the list deliberately does NOT pre-render its second read.
   *
   * A reviewer should see both halves of this feature. The committed batch makes
   * it work without a key, which is the important property — but if every
   * account arrived pre-filled, nobody would ever watch the model actually run,
   * and "precomputed" invites the reasonable suspicion that the output was
   * hand-picked. So the accounts a reviewer opens first show the button and make
   * a live call.
   *
   * The batch is still there underneath: `app/api/second-read/route.ts` falls
   * back to it on any failure, so a revoked key degrades these to real model
   * output rather than to the keyword scanner.
   */
  const LIVE_ON_OPEN_TOP_N = 5;
  const secondRead =
    row.priorityRank <= LIVE_ON_OPEN_TOP_N ? null : await precomputedSecondRead(c.customerId);

  // The case this product exists for: the composite score is calm and the
  // free-text note is not. Quantum Public Sector is the largest account in the
  // book, scores 15, and its note says the sponsor leaves on 1 August. Putting
  // that next to the score is the difference between the app making the point
  // and the reader having to scroll for it.
  const materialNoteFlags = row.noteFlags.filter((f) => MATERIAL_NOTE_FLAGS.includes(f.key));
  const quietButFlagged =
    (row.riskBand === 'Stable' || row.riskBand === 'Watch') && materialNoteFlags.length > 0;

  return (
    <div className="flex flex-col gap-6">
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
            The risk score is {row.riskScore.toFixed(0)} out of 100, inside the{' '}
            {row.riskBand.toLowerCase()} band, but the account note flags{' '}
            {materialNoteFlags.map((f) => f.label.toLowerCase()).join(' and ')}. The score is computed
            from the structured columns and never reads the note.
          </p>
        )}
      </div>

      <div className="card-lift grid grid-cols-2 gap-4 rounded-lg border border-border-subtle bg-surface px-4 py-3.5 md:grid-cols-5">
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Card
            eyebrow="The score"
            title={`How ${row.riskScore.toFixed(0)} was arrived at`}
            footnote="Every point traces to one signal and one number in the source file. Disagree with a line rather than with the total — that is what the breakdown is for."
          >
            <EvidencePanel row={row} />
          </Card>

          <Card
            eyebrow="The note"
            title="What the CRM says in free text"
            footnote="Tags come from a keyword scanner, not a model. They select the triage list on the portfolio page, and they are the control group the second read is measured against."
          >
            <blockquote className="border-l-2 border-border-strong pl-3 text-[14px] leading-relaxed">
              {c.customerNotes || <span className="text-muted-2">No note recorded.</span>}
            </blockquote>
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
          </Card>

          {/*
            Contradictions and data freshness were two separate cards saying the
            same thing in different words — here is a reason to trust this number
            less. They are one section now, which is both fewer cards and a truer
            description of what they are.
          */}
          <Card
            eyebrow="Caveats"
            title={`Why confidence is ${row.confidence.toLowerCase()}`}
            footnote="None of this moves the risk score. Resolving a contradiction silently, in either direction, would invent a fact — so it costs confidence instead and the judgement stays with the person who can pick up a phone."
          >
            <p className="text-[13px] leading-relaxed">{row.confidenceReasons.join(' ')}</p>

            {row.contradictions.length > 0 && (
              <ul className="mt-4 flex flex-col gap-3 border-t border-border-subtle pt-4">
                {row.contradictions.map((x) => (
                  <li key={x.key}>
                    <p className="text-[12px] font-semibold text-risk-elevated">{x.summary}</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{x.detail}</p>
                  </li>
                ))}
              </ul>
            )}

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border-subtle pt-4 text-[12px]">
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-2">Usage last synced</dt>
                <dd className="tnum mt-0.5">
                  {c.usageDataLastSyncedAt}{' '}
                  <span className={row.usageDataAgeDays > 7 ? 'text-risk-elevated' : 'text-muted'}>
                    ({row.usageDataAgeDays}d before snapshot)
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wide text-muted-2">NPS response</dt>
                <dd className="tnum mt-0.5">
                  {c.npsResponseDate ?? <span className="text-muted-2">not recorded</span>}{' '}
                  {row.npsAgeDays !== null && (
                    <span className={row.npsAgeDays > 120 ? 'text-risk-elevated' : 'text-muted'}>
                      ({row.npsAgeDays}d old)
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          {/*
            The one thing on this page a CSM is meant to act on. It used to be a
            hand-rolled section with its own header grammar, which is exactly
            what made this column look unplanned. It is the same Card as every
            other panel now; what marks it as the primary one is the tone, not a
            different shape.
          */}
          <Card
            eyebrow="Do this next"
            title={row.playbook.action}
            tone="primary"
            actions={
              <>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${URGENCY_TONE[row.playbook.urgency]}`}
                >
                  {row.playbook.urgency}
                </span>
                <span className="rounded border border-border-subtle bg-surface px-1.5 py-0.5 text-[10px] text-muted">
                  {row.playbook.owner}
                </span>
              </>
            }
            footnote={
              <>
                Chosen by a decision table in <span className="font-mono">lib/playbook.ts</span>, not by a
                model. Rules are evaluated in order and the first match wins, so the same account always
                produces the same play.
              </>
            }
          >
            <p className="text-[10px] uppercase tracking-wide text-muted-2">Why this rule fired</p>
            <p className="mt-1 text-[13px] leading-relaxed">{row.playbook.rationale}</p>
          </Card>

          <Card
            eyebrow="The one AI call"
            title="Second read"
            footnote="It returns a clause number, not a quote, so the text is rendered from the note and cannot be invented. It changes no score and no ranking."
          >
            <SecondRead customerId={c.customerId} initial={secondRead} />
          </Card>

          <Card eyebrow="Your call" title="Decide and record">
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
