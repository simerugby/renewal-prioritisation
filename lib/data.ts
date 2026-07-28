/**
 * DATA ACCESS.
 *
 * The scoring engine never learns where rows came from. Today that is a CSV on
 * disk; a warehouse query, an HTTP export or a CRM API is a new `PortfolioSource`
 * and nothing else in the app changes. That seam is deliberate — this is the one
 * part guaranteed to be different at the next company.
 *
 * Scale, stated honestly rather than pretended away. This loads and scores the
 * whole book in memory. Scoring is O(n) with ~40 arithmetic operations per row,
 * so tens of thousands of accounts are fine; millions are not, and at that size
 * the right move is to push scoring into the warehouse and serve pages of
 * pre-scored rows. `PortfolioSource` is where that swap happens, and
 * `listPortfolio` already takes the paging arguments it would need.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { parseCsv } from './csv';
import { SNAPSHOT_DATE } from './config';
import { SchemaError, validatePortfolio, type DataIssue } from './schema';
import { scoreAll } from './scoring';
import type { ScoredCustomer } from './types';

export { SchemaError } from './schema';
export type { DataIssue } from './schema';

export class DataLoadError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DataLoadError';
  }
}

export interface Portfolio {
  rows: ScoredCustomer[];
  /** Schema and row-level problems found while loading. Surfaced in the UI. */
  issues: DataIssue[];
  /** Rows that could not be parsed and were excluded. */
  quarantined: number;
  asOf: string;
  sourceName: string;
}

/** Implement this to point the app at something other than a CSV. */
export interface PortfolioSource {
  name: string;
  load(): Promise<Record<string, string>[]>;
}

export function csvFileSource(filePath: string): PortfolioSource {
  return {
    name: path.basename(filePath),
    async load() {
      let text: string;
      try {
        text = await fs.readFile(filePath, 'utf8');
      } catch (err) {
        throw new DataLoadError(
          'Could not read the portfolio file.',
          `Expected it at ${path.relative(process.cwd(), filePath)}. Confirm the file is present and readable.`,
          err,
        );
      }
      if (!text.trim()) {
        throw new DataLoadError('The portfolio file is empty.', 'It should contain a header row and at least one account.');
      }
      return parseCsv(text);
    },
  };
}

const DEFAULT_SOURCE = csvFileSource(path.join(process.cwd(), 'data', 'renewal_customers.csv'));

/**
 * Cache. Keyed by source and snapshot, with a TTL so a live source is not pinned
 * to a cold-start snapshot forever. Bounded, because an unbounded module-level
 * Map in a long-lived server process is a slow leak.
 */
const CACHE_TTL_MS = Number(process.env.PORTFOLIO_CACHE_TTL_MS ?? 5 * 60_000);
const CACHE_MAX_ENTRIES = 8;
const cache = new Map<string, { at: number; portfolio: Portfolio }>();

function readCache(key: string): Portfolio | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.portfolio;
}

function writeCache(key: string, portfolio: Portfolio) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  cache.set(key, { at: Date.now(), portfolio });
}

export async function loadPortfolio(
  asOf: string = SNAPSHOT_DATE,
  source: PortfolioSource = DEFAULT_SOURCE,
): Promise<Portfolio> {
  const key = `${source.name}::${asOf}`;
  const cached = readCache(key);
  if (cached) return cached;

  const records = await source.load();

  let validated;
  try {
    validated = validatePortfolio(records);
  } catch (err) {
    if (err instanceof SchemaError) {
      throw new DataLoadError(
        err.message,
        'The scoring model needs these columns to produce a defensible number, so it stops rather than guessing.',
        err,
      );
    }
    throw err;
  }

  const portfolio: Portfolio = {
    rows: scoreAll(validated.customers, asOf),
    issues: validated.issues,
    quarantined: validated.quarantined,
    asOf,
    sourceName: source.name,
  };

  writeCache(key, portfolio);
  return portfolio;
}

/**
 * Paged access. The current source scores the whole book, so paging happens in
 * memory; the signature is the one a warehouse-backed source would keep, so
 * moving the work server-side does not change any caller.
 */
export async function listPortfolio(
  { offset = 0, limit = Number.MAX_SAFE_INTEGER }: { offset?: number; limit?: number } = {},
  asOf: string = SNAPSHOT_DATE,
): Promise<{ rows: ScoredCustomer[]; total: number; issues: DataIssue[]; quarantined: number }> {
  const p = await loadPortfolio(asOf);
  return {
    rows: p.rows.slice(offset, offset + limit),
    total: p.rows.length,
    issues: p.issues,
    quarantined: p.quarantined,
  };
}

export async function loadCustomer(id: string, asOf: string = SNAPSHOT_DATE): Promise<ScoredCustomer | null> {
  const p = await loadPortfolio(asOf);
  return p.rows.find((r) => r.customer.customerId === id) ?? null;
}

/** Test seam: forces the next load to re-read the source. */
export function clearPortfolioCache() {
  cache.clear();
}
