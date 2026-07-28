import Link from 'next/link';
import { RISK_BANDS } from '@/lib/config';
import type { ScoredCustomer } from '@/lib/types';
import { gbp } from './ui';

/**
 * RISK versus VALUE AT STAKE.
 *
 * The whole product argument is that these are two questions and a single health
 * score blurs them. The ranked table states that; this shows it in one glance —
 * the top-right is where the money and the trouble coincide, and the top-left is
 * the quiet expensive corner a risk-sorted queue never reaches.
 *
 * Server-rendered inline SVG: no charting dependency, no client JavaScript, and
 * it works with JS disabled. Every mark is a link to its account, and carries a
 * <title> so hovering gives the numbers natively.
 *
 * Marks use their own validated tokens (--viz-1/--viz-2) rather than the UI
 * accent, which failed the dark-mode lightness band for chart use.
 */

const W = 720;
const H = 320;
const M = { top: 16, right: 18, bottom: 38, left: 62 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

const HIGHLIGHT_COUNT = 5;
const CRITICAL_AT = RISK_BANDS.find((b) => b.band === 'Critical')?.min ?? 65;

export default function PriorityScatter({ rows }: { rows: ScoredCustomer[] }) {
  if (rows.length === 0) return null;

  const maxArr = Math.max(...rows.map((r) => r.customer.arrGbp), 1);
  // Round the axis top to a clean number so the ticks read as money, not as data.
  const step = maxArr > 200_000 ? 50_000 : maxArr > 50_000 ? 25_000 : 5_000;
  const axisMax = Math.ceil(maxArr / step) * step;

  const x = (risk: number) => M.left + (Math.max(0, Math.min(100, risk)) / 100) * PLOT_W;
  const y = (arr: number) => M.top + PLOT_H - (Math.max(0, arr) / axisMax) * PLOT_H;

  const highlighted = new Set(rows.slice(0, HIGHLIGHT_COUNT).map((r) => r.customer.customerId));

  const yTicks = Array.from({ length: axisMax / step + 1 }, (_, i) => i * step);
  const xTicks = [0, 25, 50, 75, 100];

  return (
    <figure className="m-0">
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[560px]"
          role="img"
          aria-label={`Scatter plot of ${rows.length} accounts. Horizontal axis is risk score from 0 to 100; vertical axis is annual recurring revenue up to ${gbp(axisMax)}. The ${HIGHLIGHT_COUNT} highest-priority accounts are highlighted and labelled. The full data is in the table below.`}
        >
          {/* Grid. Recessive on purpose — it locates a point, it is not the subject. */}
          {yTicks.map((t) => (
            <line
              key={`gy${t}`}
              x1={M.left}
              x2={W - M.right}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--viz-grid)"
              strokeWidth={1}
            />
          ))}
          {xTicks.map((t) => (
            <line
              key={`gx${t}`}
              x1={x(t)}
              x2={x(t)}
              y1={M.top}
              y2={M.top + PLOT_H}
              stroke="var(--viz-grid)"
              strokeWidth={1}
            />
          ))}

          {/* The Critical threshold, named, and read from the same config the
              bands are scored against — hard-coding it here would let the chart
              and the badges disagree the moment someone retunes a band. */}
          <line
            x1={x(CRITICAL_AT)}
            x2={x(CRITICAL_AT)}
            y1={M.top}
            y2={M.top + PLOT_H}
            stroke="var(--viz-axis)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          <text x={x(CRITICAL_AT) + 5} y={M.top + 11} fontSize={10} fill="var(--viz-axis)">
            Critical
          </text>

          {/* Axis labels */}
          {yTicks.map((t) => (
            <text
              key={`ly${t}`}
              x={M.left - 8}
              y={y(t) + 3.5}
              fontSize={10}
              textAnchor="end"
              fill="var(--viz-axis)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {t === 0 ? '0' : `${Math.round(t / 1000)}k`}
            </text>
          ))}
          {xTicks.map((t) => (
            <text
              key={`lx${t}`}
              x={x(t)}
              y={M.top + PLOT_H + 15}
              fontSize={10}
              textAnchor="middle"
              fill="var(--viz-axis)"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {t}
            </text>
          ))}
          <text x={M.left + PLOT_W / 2} y={H - 6} fontSize={10} textAnchor="middle" fill="var(--viz-axis)">
            Risk score
          </text>
          <text
            x={-(M.top + PLOT_H / 2)}
            y={13}
            fontSize={10}
            textAnchor="middle"
            fill="var(--viz-axis)"
            transform="rotate(-90)"
          >
            ARR at stake
          </text>

          {/* Marks. Lower-priority first so the highlighted five draw on top. */}
          {[...rows].reverse().map((r) => {
            const isTop = highlighted.has(r.customer.customerId);
            const lowConfidence = r.confidence === 'Low';
            return (
              <Link key={r.customer.customerId} href={`/customer/${r.customer.customerId}`}>
                <circle
                  cx={x(r.riskScore)}
                  cy={y(r.customer.arrGbp)}
                  r={isTop ? 6 : 5}
                  // A 2px surface ring keeps overlapping marks readable.
                  stroke="var(--surface)"
                  strokeWidth={2}
                  fill={
                    lowConfidence ? 'var(--surface)' : isTop ? 'var(--viz-2)' : 'var(--viz-1)'
                  }
                  className="cursor-pointer"
                />
                {/* Low confidence is a hollow ring — shape, not colour, so it does
                    not compete with the two-slot palette or rely on hue alone. */}
                {lowConfidence && (
                  <circle
                    cx={x(r.riskScore)}
                    cy={y(r.customer.arrGbp)}
                    r={isTop ? 6 : 5}
                    fill="none"
                    stroke={isTop ? 'var(--viz-2)' : 'var(--viz-1)'}
                    strokeWidth={2}
                  />
                )}
                <title>
                  {`${r.customer.customerName} — priority #${r.priorityRank}, risk ${r.riskScore.toFixed(0)}, ${gbp(
                    r.customer.arrGbp,
                  )}, renews in ${r.daysToRenewal} days, ${r.confidence.toLowerCase()} confidence`}
                </title>
              </Link>
            );
          })}

          {/* Direct labels on the top five only. Labelling every point is noise. */}
          {rows.slice(0, HIGHLIGHT_COUNT).map((r) => {
            const px = x(r.riskScore);
            const py = y(r.customer.arrGbp);
            const flip = px > M.left + PLOT_W * 0.68;
            return (
              <text
                key={`t${r.customer.customerId}`}
                x={flip ? px - 10 : px + 10}
                y={py + 3.5}
                fontSize={10.5}
                textAnchor={flip ? 'end' : 'start'}
                fill="var(--foreground)"
                paintOrder="stroke"
                stroke="var(--surface)"
                strokeWidth={3}
                strokeLinejoin="round"
              >
                {r.customer.customerName}
              </text>
            );
          })}
        </svg>
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full" style={{ background: 'var(--viz-2)' }} aria-hidden />
          Top {HIGHLIGHT_COUNT} by priority
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-full" style={{ background: 'var(--viz-1)' }} aria-hidden />
          Rest of the book
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block size-2.5 rounded-full border-2"
            style={{ borderColor: 'var(--viz-1)', background: 'var(--surface)' }}
            aria-hidden
          />
          Hollow = low confidence
        </span>
        <span className="text-muted-2">Every point links to its account. Full data in the table below.</span>
      </figcaption>
    </figure>
  );
}
