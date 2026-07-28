import { SIGNAL_RATIONALE, type SignalKey } from '@/lib/config';
import type { ScoredCustomer } from '@/lib/types';

/**
 * The evidence panel. Every point of the risk score, attributed to the signal
 * that produced it, with the underlying number in plain English next to it.
 *
 * The design rule here: a user must be able to disagree with a specific line.
 * "This account scores 88" invites nothing; "23 of those 88 points come from
 * active users falling 48% since last month" invites an argument, which is what
 * the brief asked for.
 */
export default function EvidencePanel({ row }: { row: ScoredCustomer }) {
  const scored = row.signals.filter((s) => s.normalised !== null).sort((a, b) => b.contribution - a.contribution);
  const excluded = row.signals.filter((s) => s.normalised === null);
  const maxContribution = Math.max(...scored.map((s) => s.contribution), 1);

  return (
    <div className="flex flex-col gap-4">
      {/*
        One row per signal, and the row is the unit: the points, the bar and the
        sentence that produced them sit together with air around them. An earlier
        version packed these into a two-column grid at 12px throughout, which read
        as a wall — the numbers were there but nothing invited you to stop on one.
      */}
      <ol className="flex flex-col">
        {scored.map((s, i) => {
          const share = (s.contribution / maxContribution) * 100;
          const inert = s.contribution < 0.5;
          return (
            <li
              key={s.key}
              className={`py-3 ${i > 0 ? 'border-t border-border-subtle' : 'pt-0'} ${inert ? 'opacity-55' : ''}`}
            >
              <div className="flex items-baseline gap-3">
                <span
                  className="text-[13px] font-medium"
                  title={SIGNAL_RATIONALE[s.key as SignalKey]}
                >
                  {s.label}
                </span>
                <span className="tnum ml-auto text-[15px] font-semibold tabular-nums">
                  {s.contribution < 0.05 ? (
                    <span className="text-muted-2">0</span>
                  ) : (
                    `+${s.contribution.toFixed(1)}`
                  )}
                </span>
              </div>

              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-risk-elevated"
                  style={{ width: `${Math.max(inert ? 0 : 2, share)}%` }}
                />
              </div>

              <p className="mt-2 text-[12px] leading-relaxed text-muted">{s.evidence}</p>
            </li>
          );
        })}
      </ol>

      {excluded.length > 0 && (
        <div className="rounded border border-dashed border-border-strong px-3 py-2.5">
          <p className="text-[12px] font-medium">
            Excluded from the score ({excluded.length})
          </p>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {excluded.map((s) => (
              <li key={s.key} className="text-[12px] leading-snug text-muted">
                <span className="text-foreground">{s.label}</span> — {s.evidence}{' '}
                <span className="text-muted-2">{s.excludedReason}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-2">
            Excluded signals are not scored as zero — their weight is removed and the remaining signals
            re-normalise, so this account is still measured on the same 0–100 scale. What it costs is
            confidence, not risk.
          </p>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-muted-2">
        {Math.round(row.modelCoverage * 100)}% of the model&rsquo;s total weight could be applied to this
        account. Points shown sum to the risk score of {row.riskScore.toFixed(0)}.
      </p>
    </div>
  );
}
