'use client';

import Link from 'next/link';
import { useCallback, useMemo, useRef, useState } from 'react';
import { parseCsvDetailed } from '@/lib/csv';
import { SNAPSHOT_DATE } from '@/lib/config';
import { SchemaError, validatePortfolio, type DataIssue } from '@/lib/schema';
import { scoreAll } from '@/lib/scoring';
import type { ScoredCustomer } from '@/lib/types';
import DataQualityBanner from './DataQualityBanner';
import PortfolioTable from './PortfolioTable';
import PriorityScatter from './PriorityScatter';
import { Card, ErrorState, Stat, gbp } from './ui';

/**
 * Run a different company's export through the real pipeline.
 *
 * This exists because the portability claim was only checkable by reading a test
 * file. Here a reviewer can put their own export in and watch what happens —
 * which is a stronger argument than any table in the README, and a much stronger
 * one if it goes wrong in an interesting way.
 *
 * Everything happens in the browser. `parseCsvDetailed`, `validatePortfolio` and
 * `scoreAll` are the same functions the server uses — pure TypeScript with no
 * Node dependencies, which is why they can run here at all. Nothing is uploaded,
 * nothing is stored, and reloading the page loses it. That is a deliberate
 * property rather than a missing feature: it means a file with real customer
 * names in it never leaves the machine it was opened on.
 */

interface Loaded {
  rows: ScoredCustomer[];
  issues: DataIssue[];
  quarantined: number;
  fileName: string;
}

const REQUIRED_HINT =
  'customer_id, customer_name, renewal_date, arr_gbp, seats_purchased, active_users_30d, active_users_previous_30d, support_tickets_90d, critical_support_tickets_90d, invoice_status, renewal_stage, executive_sponsor_status, usage_data_last_synced_at';

export default function CsvDropzone() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    try {
      const text = await file.text();
      const { rows: records, raggedRows } = parseCsvDetailed(text);

      const sourceIssues: DataIssue[] = raggedRows.map((n) => ({
        level: 'warning' as const,
        scope: `row ${n + 1}`,
        message:
          'This row has more cells than the header has columns, usually an unquoted comma inside a free-text field. The surplus was dropped, so the note may be truncated.',
      }));

      const { customers, issues, quarantined } = validatePortfolio(records);
      setLoaded({
        rows: scoreAll(customers, SNAPSHOT_DATE),
        issues: [...sourceIssues, ...issues],
        quarantined,
        fileName: file.name,
      });
    } catch (e) {
      setLoaded(null);
      if (e instanceof SchemaError) {
        setError({
          message: e.message,
          hint: `The model needs these columns to produce a defensible number, so it stops rather than guessing: ${REQUIRED_HINT}`,
        });
      } else {
        setError({ message: e instanceof Error ? e.message : 'Could not read that file.' });
      }
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const summary = useMemo(() => {
    if (!loaded) return null;
    const totalArr = loaded.rows.reduce((s, r) => s + r.customer.arrGbp, 0);
    const attention = loaded.rows.filter((r) => r.riskBand === 'Critical' || r.riskBand === 'Elevated');
    const partial = loaded.rows.filter((r) => r.confidence !== 'High');
    return { totalArr, attention, partial };
  }, [loaded]);

  return (
    <div className="flex flex-col gap-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-lg border border-dashed px-5 py-8 text-center transition-colors ${
          dragging ? 'border-accent bg-accent-soft' : 'border-border-strong bg-surface'
        }`}
      >
        <p className="text-[14px] font-medium">Drop a renewal export here</p>
        <p className="mx-auto mt-1 max-w-xl text-[12px] leading-relaxed text-muted">
          It is parsed, validated and scored in this browser. Nothing is uploaded, nothing is stored, and
          reloading the page loses it — so a file with real customer names in it never leaves your machine.
        </p>
        <button
          onClick={() => inputRef.current?.click()}
          className="mt-3 rounded bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
        >
          Choose a file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <p className="mt-3 text-[11px] text-muted-2">
          Required columns: <span className="font-mono">{REQUIRED_HINT}</span>
        </p>
      </div>

      {error && (
        <ErrorState
          title={error.message}
          detail={error.hint}
          retry={
            <button
              onClick={() => setError(null)}
              className="rounded border border-border-subtle px-2.5 py-1 text-[12px] hover:border-border-strong"
            >
              Try another file
            </button>
          }
        />
      )}

      {loaded && summary && (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-[16px] font-semibold tracking-tight">{loaded.fileName}</h2>
            <span className="text-[12px] text-muted">
              {loaded.rows.length} accounts scored
              {loaded.quarantined > 0 && `, ${loaded.quarantined} quarantined`}
            </span>
            <button
              onClick={() => setLoaded(null)}
              className="text-[12px] text-accent hover:underline"
            >
              Clear
            </button>
          </div>

          <DataQualityBanner
            issues={loaded.issues}
            quarantined={loaded.quarantined}
            total={loaded.rows.length}
          />

          {loaded.rows.length === 0 ? (
            <Card title="Nothing scoreable in that file">
              <p className="text-[12px] text-muted">
                Every row failed validation. The banner above says why, row by row.
              </p>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 rounded-lg border border-border-subtle bg-surface px-4 py-3.5 md:grid-cols-4">
                <Stat label="ARR in this file" value={gbp(summary.totalArr)} hint={`${loaded.rows.length} accounts`} />
                <Stat
                  label="Need attention"
                  value={summary.attention.length}
                  hint={`${gbp(summary.attention.reduce((s, r) => s + r.customer.arrGbp, 0))} elevated or worse`}
                />
                <Stat label="Scored on partial data" value={summary.partial.length} hint="Missing, stale or contradictory" />
                <Stat
                  label="First call"
                  value={loaded.rows[0].customer.customerName}
                  hint={loaded.rows[0].playbook.action}
                />
              </div>

              <Card
                title="Risk against value at stake"
                subtitle="The value axis rescales to whatever book you loaded — the reference is this file's 90th percentile of ARR, not a constant."
              >
                <PriorityScatter rows={loaded.rows} />
              </Card>

              <PortfolioTable rows={loaded.rows} />

              <p className="text-[11px] leading-relaxed text-muted-2">
                This is the same parser, the same validator and the same scoring engine the{' '}
                <Link href="/" className="text-accent hover:underline">
                  supplied portfolio
                </Link>{' '}
                uses. The only thing missing here is the second read, which needs a server and a key.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
