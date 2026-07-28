import Link from 'next/link';
import { Card, gbp } from '@/components/ui';
import { SIGNAL_LABELS, SIGNAL_RATIONALE, SIGNAL_WEIGHTS, SNAPSHOT_DATE, VALUE_FLOOR, type SignalKey } from '@/lib/config';
import { loadPortfolio } from '@/lib/data';

export const metadata = { title: 'How the score works — Renewal Prioritisation' };

export default async function MethodPage() {
  const rows = await loadPortfolio().catch(() => []);
  const keys = Object.keys(SIGNAL_WEIGHTS) as SignalKey[];
  const moved = rows
    .filter((r) => Math.abs(r.riskOnlyRank - r.priorityRank) >= 3)
    .sort((a, b) => Math.abs(b.riskOnlyRank - b.priorityRank) - Math.abs(a.riskOnlyRank - a.priorityRank))
    .slice(0, 6);

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">How the score works</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-muted">
          Everything here is arithmetic you can check by hand. If you disagree with a ranking, the
          disagreement should land on a specific weight or a specific threshold — that is the point of
          publishing them.
        </p>
      </div>

      <Card title="Three outputs, deliberately kept apart">
        <dl className="flex flex-col gap-3 text-[13px]">
          <div>
            <dt className="font-medium">Risk — is this account in trouble?</dt>
            <dd className="mt-0.5 leading-relaxed text-muted">
              Nine signals, weighted, summed to 0–100. Additive and inspectable: every point traces to one
              signal and one number in the source file.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Priority — where does the next hour go?</dt>
            <dd className="mt-0.5 leading-relaxed text-muted">
              Risk weighted by revenue at stake and by how soon the renewal lands. A severely distressed
              £12k account and a moderately distressed £210k account are not the same call, and a single
              health score cannot tell you which to open first.
            </dd>
          </div>
          <div>
            <dt className="font-medium">Confidence — how much of this did we actually know?</dt>
            <dd className="mt-0.5 leading-relaxed text-muted">
              Never folded into the other two. A signal that is missing or too old is removed from the
              score entirely and the remaining weights re-normalise, so the number stays comparable — what
              it costs is confidence, not risk.
            </dd>
          </div>
        </dl>
      </Card>

      <Card
        title="The nine risk signals"
        subtitle="Weights are a considered judgement, not fitted parameters. There are no historical renewal outcomes in this dataset, so nothing here has been validated against observed churn."
      >
        <ul className="flex flex-col gap-3">
          {keys.map((k) => (
            <li key={k} className="grid grid-cols-[auto_1fr] items-baseline gap-x-3">
              <span className="tnum w-8 text-right text-[13px] font-semibold">{SIGNAL_WEIGHTS[k]}</span>
              <div>
                <span className="text-[13px] font-medium">{SIGNAL_LABELS[k]}</span>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted">{SIGNAL_RATIONALE[k]}</p>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Where risk and priority disagree" subtitle="The clearest illustration of why they are two numbers.">
        {moved.length === 0 ? (
          <p className="text-[12px] text-muted">No account moves by three places or more.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border-subtle text-left text-[11px] uppercase tracking-wide text-muted-2">
                <th className="py-1.5 font-medium">Account</th>
                <th className="py-1.5 font-medium">ARR</th>
                <th className="py-1.5 font-medium">Risk rank</th>
                <th className="py-1.5 font-medium">Priority rank</th>
              </tr>
            </thead>
            <tbody>
              {moved.map((r) => (
                <tr key={r.customer.customerId} className="border-b border-border-subtle last:border-0">
                  <td className="py-1.5">
                    <Link href={`/customer/${r.customer.customerId}`} className="hover:text-accent hover:underline">
                      {r.customer.customerName}
                    </Link>
                  </td>
                  <td className="tnum py-1.5">{gbp(r.customer.arrGbp)}</td>
                  <td className="tnum py-1.5 text-muted">#{r.riskOnlyRank}</td>
                  <td className="tnum py-1.5 font-medium">#{r.priorityRank}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-muted-2">
          Priority = risk × value weight × urgency. The value weight runs from {VALUE_FLOOR} to 1 rather
          than 0 to 1, so a small account in real trouble stays visible instead of being ranked out of
          existence by ARR.
        </p>
      </Card>

      <Card title="What this is not">
        <ul className="flex list-disc flex-col gap-2 pl-4 text-[12px] leading-relaxed text-muted">
          <li>
            <span className="text-foreground">Not a churn probability.</span> The dataset has no historical
            renewal outcomes, so there is nothing to fit a model against and nothing to validate one with.
            A number that looks like a likelihood but was never tested against an outcome is worse than no
            number.
          </li>
          <li>
            <span className="text-foreground">Not live.</span> Every date counts from the stated portfolio
            snapshot of {SNAPSHOT_DATE}, not from today, so the same numbers appear whenever this is opened.
          </li>
          <li>
            <span className="text-foreground">Not a decision.</span> The suggested action is a decision
            table over the signals. It routes attention; it does not replace the judgement of someone who
            can phone the customer.
          </li>
        </ul>
      </Card>
    </div>
  );
}
