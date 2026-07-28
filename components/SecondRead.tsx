'use client';

import { useState } from 'react';
import { DIRECTION_LABELS, type SecondReadResult } from '@/lib/secondRead';
import { Skeleton } from './ui';

/**
 * The one AI surface, rendered.
 *
 * Two things this panel does that most AI panels do not:
 *
 *   - Quotes are rendered from a clause index the model returned, so the quoted
 *     text is guaranteed to be in the note. It says so on screen, because the
 *     guarantee is the interesting part.
 *   - It shows what the validator threw away. A model output that failed a check
 *     is more informative than one that passed, and hiding it would waste the
 *     best evidence that the checks are real.
 */

const SOURCE_COPY: Record<string, string> = {
  'no-key': 'No OpenAI key on this deployment, so this is the keyword fallback.',
  timeout: 'The model did not respond in time, so this is the keyword fallback.',
  'rate-limited': 'Rate limited, so this is the keyword fallback.',
  error: 'The model call failed, so this is the keyword fallback.',
  'empty-response': 'The model returned nothing usable, so this is the keyword fallback.',
};

const DIRECTION_TONE: Record<string, string> = {
  'adds-risk': 'text-risk-critical bg-risk-critical-bg border-risk-critical/25',
  'explains-a-weak-signal': 'text-risk-stable bg-risk-stable-bg border-risk-stable/25',
  'adds-opportunity': 'text-risk-stable bg-risk-stable-bg border-risk-stable/25',
  'adds-nothing': 'text-muted bg-surface-2 border-border-subtle',
};

export default function SecondRead({ customerId }: { customerId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<SecondReadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setState('loading');
    setError(null);
    try {
      const res = await fetch('/api/second-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Request failed with status ${res.status}.`);
      }
      setResult(await res.json());
      setState('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error.');
      setState('error');
    }
  };

  if (state === 'idle') {
    return (
      <div className="flex flex-col gap-2.5">
        <p className="text-[12px] leading-relaxed text-muted">
          Reads the account note against the signals the score already counted, and says what it adds. It
          returns a clause number, not a quote, so the text below is rendered from the note itself and
          cannot be invented. It changes no score and no ranking.
        </p>
        <button
          onClick={run}
          className="self-start rounded bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
        >
          Run second read
        </button>
      </div>
    );
  }

  if (state === 'loading') {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-live="polite">
        <span className="sr-only">Reading the account note</span>
        <Skeleton className="h-5 w-52" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div role="alert" className="flex flex-col gap-2">
        <p className="text-[12px] text-risk-critical">{error}</p>
        <button onClick={run} className="self-start rounded border border-border-subtle px-2.5 py-1 text-[12px] hover:border-border-strong">
          Try again
        </button>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="flex flex-col gap-3">
      <span
        className={`inline-flex w-fit items-center rounded border px-2 py-1 text-[11px] font-medium ${DIRECTION_TONE[result.direction]}`}
      >
        {DIRECTION_LABELS[result.direction]}
      </span>

      {result.findings.length === 0 ? (
        <p className="text-[12px] leading-relaxed text-muted">
          Nothing in the note that the scored signals do not already show.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {result.findings.map((f, i) => (
            <li key={i} className="border-l-2 border-border-strong pl-3">
              <blockquote className="text-[12px] leading-relaxed">
                &ldquo;{f.quote}&rdquo;
                <span className="ml-1.5 text-[10px] text-muted-2">clause {f.clauseIndex + 1}</span>
              </blockquote>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">{f.whatItMeans}</p>
              {f.signalLabel && (
                <p className="mt-0.5 text-[11px] text-muted-2">Bears on: {f.signalLabel}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {result.fieldChallenge && (
        <div className="rounded border border-risk-elevated/30 bg-risk-elevated-bg px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-risk-elevated">
            A field may be out of date
          </p>
          <p className="tnum mt-1 text-[12px]">
            {result.fieldChallenge.label}: {result.fieldChallenge.currentValue} &rarr;{' '}
            {result.fieldChallenge.proposedValue}
            {result.fieldChallenge.effectiveDate && (
              <span className="text-muted"> (from {result.fieldChallenge.effectiveDate})</span>
            )}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            Advisory. The score is not recalculated from this — a proposal is not a fact until someone
            checks it.
          </p>
        </div>
      )}

      {result.dropped.length > 0 && (
        <details className="rounded border border-dashed border-border-strong px-3 py-2">
          <summary className="cursor-pointer text-[11px] text-muted">
            {result.dropped.length} model output{result.dropped.length > 1 ? 's' : ''} rejected by validation
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1">
            {result.dropped.map((d, i) => (
              <li key={i} className="text-[11px] leading-snug text-muted-2">
                {d}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-2">
            Shown deliberately. Across the whole book the validator rejects a meaningful share of what the
            model proposes, and that is the clearest evidence the checks are load-bearing rather than
            decorative.
          </p>
        </details>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-2">
        {result.source === 'llm' && <span>Generated by {result.model}</span>}
        {result.source === 'precomputed' && (
          <span>
            Precomputed with {result.model}
            {result.generatedAt ? ` on ${result.generatedAt.slice(0, 10)}` : ''}, so this works without a key
          </span>
        )}
        {result.source === 'fallback' && <span>{SOURCE_COPY[result.fallbackReason ?? 'error']}</span>}
        <button onClick={run} className="text-accent hover:underline">
          Run again
        </button>
      </div>
    </div>
  );
}
