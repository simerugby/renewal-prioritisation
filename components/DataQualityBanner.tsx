import type { DataIssue } from '@/lib/schema';

/**
 * Validation nobody sees is validation that does not exist. When the loader
 * finds a problem it says so here, in the product, rather than in a server log
 * the CSM will never read.
 *
 * Deliberately not an error style: on a healthy file this renders nothing, and
 * on a slightly-broken one it should read as "here is what I could not use",
 * not as "the app is down".
 */
export default function DataQualityBanner({
  issues,
  quarantined,
  total,
}: {
  issues: DataIssue[];
  quarantined: number;
  total: number;
}) {
  if (issues.length === 0 && quarantined === 0) return null;

  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  const shown = [...errors, ...warnings].slice(0, 6);

  return (
    <details className="rounded-lg border border-risk-elevated/30 bg-risk-elevated-bg px-4 py-3">
      <summary className="cursor-pointer text-[12px] font-medium text-risk-elevated">
        {quarantined > 0
          ? `${quarantined} of ${total + quarantined} rows could not be scored`
          : `${issues.length} data quality note${issues.length > 1 ? 's' : ''} on this file`}
      </summary>
      <ul className="mt-2 flex flex-col gap-1.5">
        {shown.map((i, idx) => (
          <li key={idx} className="text-[12px] leading-snug text-muted">
            <span className="text-foreground">{i.scope}</span>
            {i.column && <span className="text-muted-2"> · {i.column}</span>} — {i.message}
          </li>
        ))}
      </ul>
      {issues.length > shown.length && (
        <p className="mt-1.5 text-[11px] text-muted-2">
          and {issues.length - shown.length} more. Full detail from <code>npm run verify</code>.
        </p>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-muted-2">
        Unrecognised values are excluded from scoring rather than assumed healthy, and the model
        re-normalises over the weight it could apply. Affected accounts carry lower confidence.
      </p>
    </details>
  );
}
