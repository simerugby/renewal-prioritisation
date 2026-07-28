'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { MATERIAL_NOTE_FLAGS } from '@/lib/secondRead';
import type { ScoredCustomer } from '@/lib/types';
import { ConfidenceBadge, EmptyState, RiskPill, gbp } from './ui';

/**
 * True when every scored signal is calm and the free-text note is not. These are
 * the accounts a purely quantitative queue walks straight past, so the list has
 * to mark them even though the score does not move.
 */
function isQuietButFlagged(r: ScoredCustomer): boolean {
  if (r.riskBand !== 'Stable' && r.riskBand !== 'Watch') return false;
  return r.noteFlags.some((f) => MATERIAL_NOTE_FLAGS.includes(f.key));
}

type SortKey = 'priority' | 'risk' | 'arr' | 'renewal' | 'name';

const HORIZONS = [
  { key: 'all', label: 'All', test: () => true },
  { key: '30', label: '≤30 days', test: (d: number) => d <= 30 },
  { key: '60', label: '≤60 days', test: (d: number) => d <= 60 },
  { key: '90', label: '≤90 days', test: (d: number) => d <= 90 },
] as const;

function uniq(values: string[]) {
  return Array.from(new Set(values)).sort();
}

/** A compact bar. Width is the score; colour is the band. Always paired with the numeral. */
function RiskBar({ score, band }: { score: number; band: string }) {
  const colour =
    band === 'Critical'
      ? 'bg-risk-critical'
      : band === 'Elevated'
        ? 'bg-risk-elevated'
        : band === 'Watch'
          ? 'bg-risk-watch'
          : 'bg-risk-stable';
  return (
    <div className="flex items-center gap-2">
      {/*
        Left-aligned, not right. The box stays a fixed 7 wide so every bar in the
        column starts at the same x, but right-aligning inside it pushed every
        two-digit score one digit-width in from the column edge — so the numbers
        sat off the line the header and the band pill below them share.
      */}
      <span className="tnum w-7 text-[12px] font-medium">{score.toFixed(0)}</span>
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
        <span className={`block h-full rounded-full ${colour}`} style={{ width: `${Math.max(2, score)}%` }} />
      </span>
    </div>
  );
}

/**
 * How far the value-and-urgency axis moved this account away from where a pure
 * risk ranking would have put it. This is the product argument, made visible in
 * the table rather than argued for in the README.
 */
function RankDelta({ priority, riskOnly }: { priority: number; riskOnly: number }) {
  const delta = riskOnly - priority;
  if (delta === 0) return <span className="text-[11px] text-muted-2">—</span>;
  const up = delta > 0;
  return (
    <span
      className={`tnum text-[11px] ${up ? 'text-risk-critical' : 'text-muted'}`}
      title={`Risk alone would rank this #${riskOnly}. Weighted for value at stake and time to renewal, it is #${priority}.`}
    >
      {up ? '▲' : '▼'}
      {Math.abs(delta)}
    </span>
  );
}

/**
 * The headline figures above the table link here with `?view=`, so a number a
 * reader wants to interrogate is the thing they can click. It also makes a
 * filtered view a URL someone can send to a colleague.
 */
const VIEWS = {
  soon: { horizon: '30' as const, label: 'renewing within 30 days' },
  attention: { attention: true, label: 'at elevated risk or worse' },
  partial: { partial: true, label: 'scored on partial data' },
  note: { note: true, label: 'calm score, note says otherwise' },
} as const;

/**
 * The page is statically rendered, so on the first render `useSearchParams`
 * returns nothing and a `useState` initialiser reading it would set every filter
 * to its default — which is exactly what happened: clicking a headline figure
 * scrolled to the table with no filter applied. Keying the inner component on
 * the view means it remounts once the param resolves, and the initialisers run
 * again with the real value.
 */
export default function PortfolioTable({ rows }: { rows: ScoredCustomer[] }) {
  const params = useSearchParams();
  const view = params.get('view') ?? 'all';
  return <PortfolioTableView key={view} rows={rows} view={view} />;
}

function PortfolioTableView({ rows, view }: { rows: ScoredCustomer[]; view: string }) {
  const preset = view in VIEWS ? VIEWS[view as keyof typeof VIEWS] : null;

  const [query, setQuery] = useState('');
  const [csm, setCsm] = useState('all');
  const [segment, setSegment] = useState('all');
  const [region, setRegion] = useState('all');
  const [stage, setStage] = useState('all');
  const [horizon, setHorizon] = useState<string>(preset && 'horizon' in preset ? preset.horizon : 'all');
  const [sort, setSort] = useState<SortKey>('priority');
  const [needsAttentionOnly, setNeedsAttentionOnly] = useState(Boolean(preset && 'attention' in preset));
  const [noteDisagreesOnly, setNoteDisagreesOnly] = useState(Boolean(preset && 'note' in preset));
  const [partialOnly, setPartialOnly] = useState(Boolean(preset && 'partial' in preset));

  const csms = useMemo(() => uniq(rows.map((r) => r.customer.csmName)), [rows]);
  const segments = useMemo(() => uniq(rows.map((r) => r.customer.segment)), [rows]);
  const regions = useMemo(() => uniq(rows.map((r) => r.customer.region)), [rows]);
  const stages = useMemo(() => uniq(rows.map((r) => r.customer.renewalStage)), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const h = HORIZONS.find((x) => x.key === horizon) ?? HORIZONS[0];
    const out = rows.filter((r) => {
      const c = r.customer;
      if (q && !`${c.customerName} ${c.industry} ${c.customerId}`.toLowerCase().includes(q)) return false;
      if (csm !== 'all' && c.csmName !== csm) return false;
      if (segment !== 'all' && c.segment !== segment) return false;
      if (region !== 'all' && c.region !== region) return false;
      if (stage !== 'all' && c.renewalStage !== stage) return false;
      if (!h.test(r.daysToRenewal)) return false;
      if (needsAttentionOnly && r.riskBand !== 'Critical' && r.riskBand !== 'Elevated') return false;
      if (noteDisagreesOnly && !isQuietButFlagged(r)) return false;
      if (partialOnly && r.confidence === 'High') return false;
      return true;
    });

    const sorted = [...out];
    sorted.sort((a, b) => {
      switch (sort) {
        case 'risk':
          return b.riskScore - a.riskScore;
        case 'arr':
          return b.customer.arrGbp - a.customer.arrGbp;
        case 'renewal':
          return a.daysToRenewal - b.daysToRenewal;
        case 'name':
          return a.customer.customerName.localeCompare(b.customer.customerName);
        default:
          return b.priorityScore - a.priorityScore;
      }
    });
    return sorted;
  }, [rows, query, csm, segment, region, stage, horizon, sort, needsAttentionOnly, noteDisagreesOnly, partialOnly]);

  const selectClass =
    'rounded border border-border-subtle bg-surface px-2 py-1.5 text-[12px] text-foreground hover:border-border-strong focus:outline-none';

  const filteredArr = filtered.reduce((s, r) => s + r.customer.arrGbp, 0);
  const anyFilter =
    query !== '' || csm !== 'all' || segment !== 'all' || region !== 'all' || stage !== 'all' || horizon !== 'all' || needsAttentionOnly || noteDisagreesOnly || partialOnly;

  const reset = () => {
    setQuery('');
    setCsm('all');
    setSegment('all');
    setRegion('all');
    setStage('all');
    setHorizon('all');
    setNeedsAttentionOnly(false);
    setNoteDisagreesOnly(false);
    setPartialOnly(false);
  };

  return (
    <div id="book" className="scroll-mt-4 rounded-lg border border-border-subtle bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-2.5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search customer or industry…"
          aria-label="Search customers"
          className="min-w-[190px] flex-1 rounded border border-border-subtle bg-surface px-2.5 py-1.5 text-[12px] placeholder:text-muted-2 focus:outline-none"
        />

        <div className="flex overflow-hidden rounded border border-border-subtle" role="group" aria-label="Renewal horizon">
          {HORIZONS.map((h) => (
            <button
              key={h.key}
              onClick={() => setHorizon(h.key)}
              aria-pressed={horizon === h.key}
              className={`px-2.5 py-1.5 text-[12px] transition-colors ${
                horizon === h.key ? 'bg-accent-soft text-accent' : 'text-muted hover:text-foreground'
              }`}
            >
              {h.label}
            </button>
          ))}
        </div>

        <select value={csm} onChange={(e) => setCsm(e.target.value)} className={selectClass} aria-label="Filter by CSM">
          <option value="all">All CSMs</option>
          {csms.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={segment} onChange={(e) => setSegment(e.target.value)} className={selectClass} aria-label="Filter by segment">
          <option value="all">All segments</option>
          {segments.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={region} onChange={(e) => setRegion(e.target.value)} className={selectClass} aria-label="Filter by region">
          <option value="all">All regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select value={stage} onChange={(e) => setStage(e.target.value)} className={selectClass} aria-label="Filter by renewal stage">
          <option value="all">All stages</option>
          {stages.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-muted">
          <input
            type="checkbox"
            checked={needsAttentionOnly}
            onChange={(e) => setNeedsAttentionOnly(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Needs attention
        </label>

        <label
          className="flex cursor-pointer items-center gap-1.5 text-[12px] text-muted"
          title="Accounts whose scored signals are calm and whose account note is not. A risk-sorted queue never reaches these."
        >
          <input
            type="checkbox"
            checked={noteDisagreesOnly}
            onChange={(e) => setNoteDisagreesOnly(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Note disagrees
        </label>

        <label
          className="flex cursor-pointer items-center gap-1.5 text-[12px] text-muted"
          title="Accounts where a signal was missing, too stale to use, or contradicted by another."
        >
          <input
            type="checkbox"
            checked={partialOnly}
            onChange={(e) => setPartialOnly(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Partial data
        </label>

        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={`${selectClass} ml-auto`} aria-label="Sort by">
          <option value="priority">Sort: Priority</option>
          <option value="risk">Sort: Risk score</option>
          <option value="arr">Sort: ARR</option>
          <option value="renewal">Sort: Renewal date</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>

      <div className="flex items-center gap-3 border-b border-border-subtle bg-surface-2/50 px-3 py-1.5 text-[11px] text-muted">
        <span className="tnum">
          {filtered.length} of {rows.length} accounts · {gbp(filteredArr)} ARR
        </span>
        {anyFilter && (
          <button onClick={reset} className="text-accent hover:underline">
            Clear filters
          </button>
        )}
        {sort !== 'priority' && (
          <span className="ml-auto text-muted-2">Rank column still reflects priority order</span>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No accounts match these filters"
          hint="Nothing in the book fits every filter at once. Widen the renewal horizon or clear a filter to see accounts again."
          action={
            <button onClick={reset} className="mt-1 rounded border border-border-subtle px-2.5 py-1 text-[12px] hover:border-border-strong">
              Clear all filters
            </button>
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border-subtle text-left text-[11px] uppercase tracking-wide text-muted-2">
                <th className="px-3 py-2 font-medium">#</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">ARR</th>
                <th className="px-3 py-2 font-medium">Renewal</th>
                <th className="px-3 py-2 font-medium">Risk</th>
                <th className="px-3 py-2 font-medium" title="Movement versus a ranking on risk alone">
                  vs risk
                </th>
                <th className="px-3 py-2 font-medium">Confidence</th>
                <th className="px-3 py-2 font-medium">Suggested next action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.customer.customerId}
                  className="group border-b border-border-subtle last:border-0 hover:bg-surface-2/60"
                >
                  <td className="tnum px-3 py-2.5 align-top text-[12px] text-muted-2">{r.priorityRank}</td>
                  <td className="px-3 py-2.5 align-top">
                    <Link
                      href={`/customer/${r.customer.customerId}`}
                      className="font-medium group-hover:text-accent group-hover:underline"
                    >
                      {r.customer.customerName}
                    </Link>
                    {isQuietButFlagged(r) && (
                      <span
                        className="ml-1.5 align-middle text-[10px] font-medium text-risk-elevated"
                        title={`The score is calm but the account note flags ${r.noteFlags
                          .filter((f) => MATERIAL_NOTE_FLAGS.includes(f.key))
                          .map((f) => f.label.toLowerCase())
                          .join(' and ')}.`}
                      >
                        ⚑ note
                      </span>
                    )}
                    <div className="mt-0.5 text-[11px] text-muted-2">
                      {r.customer.segment} · {r.customer.industry} · {r.customer.region} · {r.customer.csmName}
                    </div>
                  </td>
                  <td className="tnum px-3 py-2.5 align-top">{gbp(r.customer.arrGbp)}</td>
                  <td className="px-3 py-2.5 align-top">
                    <div className="tnum">{r.customer.renewalDate}</div>
                    <div className={`text-[11px] ${r.daysToRenewal <= 30 ? 'text-risk-critical' : 'text-muted-2'}`}>
                      {r.daysToRenewal} days
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <RiskBar score={r.riskScore} band={r.riskBand} />
                    <div className="mt-1">
                      <RiskPill band={r.riskBand} />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <RankDelta priority={r.priorityRank} riskOnly={r.riskOnlyRank} />
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <ConfidenceBadge level={r.confidence} coverage={r.modelCoverage} />
                  </td>
                  <td className="max-w-[300px] px-3 py-2.5 align-top">
                    <div className="text-[12px] leading-snug">{r.playbook.action}</div>
                    <div className="mt-0.5 text-[11px] text-muted-2">
                      {r.playbook.urgency} · {r.playbook.owner}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
