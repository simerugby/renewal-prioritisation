import Link from 'next/link';
import type { ConfidenceLevel, RiskBand } from '@/lib/types';

export const gbp = (n: number) =>
  `£${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;

export const gbpCompact = (n: number) =>
  n >= 1000 ? `£${(n / 1000).toFixed(n >= 100_000 ? 0 : 0)}k` : `£${n}`;

const BAND_STYLE: Record<RiskBand, string> = {
  Critical: 'text-risk-critical bg-risk-critical-bg border-risk-critical/25',
  Elevated: 'text-risk-elevated bg-risk-elevated-bg border-risk-elevated/25',
  Watch: 'text-risk-watch bg-risk-watch-bg border-risk-watch/25',
  Stable: 'text-risk-stable bg-risk-stable-bg border-risk-stable/25',
};

export function RiskPill({ band, score }: { band: RiskBand; score?: number }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] font-medium ${BAND_STYLE[band]}`}
    >
      {band}
      {score !== undefined && <span className="tnum opacity-70">{score.toFixed(0)}</span>}
    </span>
  );
}

/**
 * Confidence is deliberately styled as information, not as an alarm. It is not a
 * fifth severity level — it says how much of the picture we actually had.
 */
export function ConfidenceBadge({ level, coverage }: { level: ConfidenceLevel; coverage?: number }) {
  const dots = level === 'High' ? 3 : level === 'Medium' ? 2 : 1;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] text-muted"
      title={
        coverage !== undefined
          ? `${level} confidence — ${Math.round(coverage * 100)}% of the model's weight could be applied`
          : `${level} confidence`
      }
    >
      <span className="flex gap-[2px]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`block h-2.5 w-[3px] rounded-[1px] ${i < dots ? 'bg-muted' : 'bg-border-strong'}`}
          />
        ))}
      </span>
      {level}
    </span>
  );
}

/**
 * A card with a three-level header, because a one-level one stopped working.
 *
 * Every section used to be a 13px semibold title over a 12px muted sentence, so
 * eight stacked cards read as one undifferentiated column — the titles and the
 * prose inside them were nearly the same size and weight, and nothing told you
 * where a section began.
 *
 *   eyebrow    10px uppercase, tinted. Names the KIND of thing this is.
 *   title      15px semibold. Readably bigger than any body text on the page.
 *   footnote   11px, at the BOTTOM. Explanations of method belong after the
 *              content, not between the title and it, where they used to push
 *              the actual answer below the fold.
 */
export function Card({
  eyebrow,
  title,
  subtitle,
  footnote,
  children,
  className = '',
}: {
  eyebrow?: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  footnote?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`overflow-hidden rounded-lg border border-border-subtle bg-surface ${className}`}>
      {(title || subtitle || eyebrow) && (
        <header className="border-b border-border-subtle bg-surface-2 px-4 py-3">
          {eyebrow && (
            <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-2">{eyebrow}</p>
          )}
          {title && <h2 className="mt-0.5 text-[15px] font-semibold tracking-tight">{title}</h2>}
          {subtitle && <p className="mt-1 text-[12px] leading-relaxed text-muted">{subtitle}</p>}
        </header>
      )}
      <div className="px-4 py-4">{children}</div>
      {footnote && (
        <footer className="border-t border-border-subtle bg-surface-2 px-4 py-2.5 text-[11px] leading-relaxed text-muted-2">
          {footnote}
        </footer>
      )}
    </section>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-14 text-center">
      <div
        className="flex size-9 items-center justify-center rounded-full border border-border-subtle text-muted-2"
        aria-hidden
      >
        &#8709;
      </div>
      <p className="text-[13px] font-medium">{title}</p>
      {hint && <p className="max-w-sm text-[12px] leading-relaxed text-muted">{hint}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title, detail, retry }: { title: string; detail?: string; retry?: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-risk-critical/30 bg-risk-critical-bg px-4 py-5 text-center"
    >
      <p className="text-[13px] font-semibold text-risk-critical">{title}</p>
      {detail && <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-muted">{detail}</p>}
      {retry && <div className="mt-3">{retry}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded ${className}`} aria-hidden />;
}

export function Stat({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  /** When present the figure becomes a link that pre-filters the table below. */
  href?: string;
}) {
  const body = (
    <>
      <div className="text-[11px] uppercase tracking-wide text-muted-2">{label}</div>
      <div className="tnum mt-0.5 truncate text-[19px] font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] leading-snug text-muted">{hint}</div>}
    </>
  );

  if (!href) return <div className="min-w-0">{body}</div>;

  // A number a reader wants to interrogate should be the thing they can click.
  return (
    <Link
      href={href}
      className="group min-w-0 rounded transition-colors hover:bg-surface-2"
      title="Show these accounts in the table below"
    >
      <div className="text-[11px] uppercase tracking-wide text-muted-2">{label}</div>
      <div className="tnum mt-0.5 truncate text-[19px] font-semibold tracking-tight group-hover:text-accent">
        {value}
        <span className="ml-1 align-middle text-[11px] font-normal text-muted-2 group-hover:text-accent">&rarr;</span>
      </div>
      {hint && <div className="mt-0.5 text-[11px] leading-snug text-muted">{hint}</div>}
    </Link>
  );
}
