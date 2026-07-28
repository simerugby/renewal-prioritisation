import Link from 'next/link';
import { Card, gbp } from '@/components/ui';
import {
  RISK_BANDS,
  SIGNAL_LABELS,
  SIGNAL_RATIONALE,
  SIGNAL_WEIGHTS,
  SNAPSHOT_DATE,
  STALENESS,
  VALUE_FLOOR,
  type SignalKey,
} from '@/lib/config';
import { loadPortfolio } from '@/lib/data';

export const metadata = { title: 'How the score works — Renewal Prioritisation' };

/** The three outputs, side by side, because the point is that they are separate. */
const OUTPUTS = [
  {
    name: 'Risk',
    question: 'Is this account in trouble?',
    body: 'Nine signals, weighted, summed to 0–100. Additive and inspectable: every point traces to one signal and one number in the source file.',
    tone: 'text-risk-critical',
  },
  {
    name: 'Priority',
    question: 'Where does the next hour go?',
    body: 'Risk weighted by revenue at stake and by how soon the renewal lands. A distressed £12k account and a wobbling £210k account are not the same call.',
    tone: 'text-accent',
  },
  {
    name: 'Confidence',
    question: 'How much did we actually know?',
    body: 'Never folded into the other two. A signal that is missing or too old is removed and the rest re-normalise, so the number stays comparable — what it costs is confidence.',
    tone: 'text-risk-stable',
  },
];

export default async function MethodPage() {
  const rows = await loadPortfolio()
    .then((p) => p.rows)
    .catch(() => []);
  const keys = Object.keys(SIGNAL_WEIGHTS) as SignalKey[];
  const maxWeight = Math.max(...keys.map((k) => SIGNAL_WEIGHTS[k]));
  const moved = rows
    .filter((r) => Math.abs(r.riskOnlyRank - r.priorityRank) >= 3)
    .sort((a, b) => Math.abs(b.riskOnlyRank - b.priorityRank) - Math.abs(a.riskOnlyRank - a.priorityRank))
    .slice(0, 6);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">How the score works</h1>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted">
          Everything here is arithmetic you can check by hand. If you disagree with a ranking, the
          disagreement should land on a specific weight or a specific threshold — publishing them is the
          point.
        </p>
      </div>

      {/* Three outputs, three columns. Prose in one column made them look like one idea. */}
      <div className="grid gap-4 md:grid-cols-3">
        {OUTPUTS.map((o) => (
          <section key={o.name} className="rounded-lg border border-border-subtle bg-surface p-4">
            <p className={`text-[15px] font-semibold tracking-tight ${o.tone}`}>{o.name}</p>
            <p className="mt-0.5 text-[12px] font-medium">{o.question}</p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">{o.body}</p>
          </section>
        ))}
      </div>

      <Card
        eyebrow="The model"
        title="Nine signals, and what each is worth"
        subtitle="Weights sum to 100, so a risk score reads as points of concern out of 100. They are a considered judgement, not fitted parameters — this dataset has no historical renewal outcomes, so nothing here has been validated against observed churn."
      >
        <ol className="flex flex-col gap-3.5">
          {keys.map((k) => (
            <li key={k}>
              <div className="flex items-baseline gap-3">
                <span className="text-[13px] font-medium">{SIGNAL_LABELS[k]}</span>
                <span className="tnum ml-auto text-[13px] font-semibold">{SIGNAL_WEIGHTS[k]}</span>
              </div>
              {/* The bar is the point: nine numbers in a list do not show that
                  adoption is worth three and a half times sentiment. */}
              <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${(SIGNAL_WEIGHTS[k] / maxWeight) * 100}%` }}
                />
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{SIGNAL_RATIONALE[k]}</p>
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card eyebrow="Bands" title="What the number is called">
          <ul className="flex flex-col gap-2">
            {RISK_BANDS.map((b, i) => {
              const upper = i === 0 ? 100 : RISK_BANDS[i - 1].min;
              const count = rows.filter((r) => r.riskBand === b.band).length;
              return (
                <li key={b.band} className="flex items-baseline gap-3 text-[12px]">
                  <span
                    className={`w-[70px] font-medium ${
                      b.band === 'Critical'
                        ? 'text-risk-critical'
                        : b.band === 'Elevated'
                          ? 'text-risk-elevated'
                          : b.band === 'Watch'
                            ? 'text-risk-watch'
                            : 'text-risk-stable'
                    }`}
                  >
                    {b.band}
                  </span>
                  <span className="tnum text-muted-2">
                    {b.min}&ndash;{upper}
                  </span>
                  <span className="tnum ml-auto text-muted">{count} accounts</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-2">
            Twelve accounts score 45 or above and then nothing until 36, so the Elevated threshold lands
            on a gap in the data rather than cutting through a cluster.
          </p>
        </Card>

        <Card eyebrow="Staleness" title="When a signal stops counting">
          <ul className="flex flex-col gap-2.5 text-[12px]">
            <li className="flex items-baseline gap-3">
              <span className="tnum w-[86px] font-semibold">{STALENESS.npsFreshDays} days</span>
              <span className="text-muted">NPS counts at full weight up to here</span>
            </li>
            <li className="flex items-baseline gap-3">
              <span className="tnum w-[86px] font-semibold">{STALENESS.npsUsableDays} days</span>
              <span className="text-muted">and at half weight up to here; beyond it, excluded</span>
            </li>
            <li className="flex items-baseline gap-3">
              <span className="tnum w-[86px] font-semibold">{STALENESS.usageWarnDays} days</span>
              <span className="text-muted">a usage sync older than this costs confidence</span>
            </li>
            <li className="flex items-baseline gap-3">
              <span className="tnum w-[86px] font-semibold">{STALENESS.usageExcludeDays} days</span>
              <span className="text-muted">and past this both usage signals are excluded outright</span>
            </li>
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-2">
            One rule for stale inputs rather than a special case for sentiment. An excluded signal is not
            scored as zero: its weight is removed and the rest re-normalise, so the scale survives.
          </p>
        </Card>
      </div>

      <Card
        eyebrow="The argument"
        title="Where risk and priority disagree"
        subtitle="The clearest illustration of why they are two numbers rather than one."
        footnote={`Priority = risk × value weight × urgency. The value weight runs from ${VALUE_FLOOR} to 1 rather than 0 to 1, so a small account in real trouble stays visible instead of being ranked out of existence by ARR.`}
      >
        {moved.length === 0 ? (
          <p className="text-[12px] text-muted">No account moves by three places or more.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border-subtle text-left text-[10px] uppercase tracking-wide text-muted-2">
                <th className="py-1.5 font-medium">Account</th>
                <th className="py-1.5 font-medium">ARR</th>
                <th className="py-1.5 font-medium">On risk alone</th>
                <th className="py-1.5 font-medium">On priority</th>
              </tr>
            </thead>
            <tbody>
              {moved.map((r) => (
                <tr key={r.customer.customerId} className="border-b border-border-subtle last:border-0">
                  <td className="py-2">
                    <Link href={`/customer/${r.customer.customerId}`} className="hover:text-accent hover:underline">
                      {r.customer.customerName}
                    </Link>
                  </td>
                  <td className="tnum py-2">{gbp(r.customer.arrGbp)}</td>
                  <td className="tnum py-2 text-muted">#{r.riskOnlyRank}</td>
                  <td className="tnum py-2 font-semibold">#{r.priorityRank}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card
        eyebrow="Reliability"
        title="How much to trust the order"
        subtitle="Measured by perturbing every weight by up to ±40%, a thousand times, and re-ranking. Reproduce with npm run sensitivity."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded border border-risk-stable/30 bg-risk-stable-bg px-3 py-3">
            <p className="text-[24px] font-semibold leading-none text-risk-stable">100%</p>
            <p className="mt-1.5 text-[12px] leading-relaxed">
              of trials keep the same five accounts at the top. Removing any single signal entirely does
              not change them either — they are extreme on several signals at once, not on one weight.
            </p>
          </div>
          <div className="rounded border border-risk-elevated/30 bg-risk-elevated-bg px-3 py-3">
            <p className="text-[24px] font-semibold leading-none text-risk-elevated">6 places</p>
            <p className="mt-1.5 text-[12px] leading-relaxed">
              is how far an account starting between ranks 16 and 30 can move under the same jitter.
              <strong className="font-semibold"> Treat the top ten as an ordering and the rest as a band.</strong>{' '}
              Reading a difference between #22 and #18 is reading noise.
            </p>
          </div>
        </div>
      </Card>

      <Card eyebrow="Limits" title="What this is not">
        <ul className="flex flex-col gap-3 text-[12px] leading-relaxed">
          <li>
            <span className="font-semibold">Not a churn probability.</span>{' '}
            <span className="text-muted">
              The dataset has no historical renewal outcomes, so there is nothing to fit a model against
              and nothing to validate one with. A number that looks like a likelihood but was never tested
              against an outcome is worse than no number.
            </span>
          </li>
          <li>
            <span className="font-semibold">Not live.</span>{' '}
            <span className="text-muted">
              Every date counts from the stated snapshot of {SNAPSHOT_DATE}, not from today, so the same
              figures appear whenever this is opened.
            </span>
          </li>
          <li>
            <span className="font-semibold">Not a decision.</span>{' '}
            <span className="text-muted">
              The suggested action is a decision table over the signals. It routes attention; it does not
              replace the judgement of someone who can phone the customer.
            </span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
