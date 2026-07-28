import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';
import { validatePortfolio, SchemaError } from './schema';
import { scoreAll, scoreCustomer } from './scoring';
import { SIGNAL_WEIGHTS } from './config';
import type { Customer } from './types';

/**
 * PROPERTY-BASED TESTS.
 *
 * The example tests elsewhere check cases I thought of. This file checks cases I
 * did not: fast-check generates thousands of inputs per run — nonsense enum
 * values, nulls, negative counts, dates centuries apart, empty books, single-row
 * books, unicode in every string field — and asserts the invariants that must
 * hold for *any* input, not just for this one file of 40 rows.
 *
 * That distinction matters because the supplied data is a synthetic snapshot and
 * every real export afterwards will differ. An invariant that survives ten
 * thousand generated portfolios is a much stronger claim than one that survives
 * forty rows I have already read.
 *
 * When one fails, fast-check shrinks the input to the smallest case that still
 * breaks it and prints it — so a failure here arrives as a minimal reproduction,
 * not a haystack.
 */

const ASOF = '2026-07-21';
const CTX = { arrReference: 260_000 };
const TOTAL_WEIGHT = Object.values(SIGNAL_WEIGHTS).reduce((a, b) => a + b, 0);

/** Deliberately wider than the real schema: includes values the app should reject or exclude. */
const arbCustomer: fc.Arbitrary<Customer> = fc.record({
  customerId: fc.string({ minLength: 1, maxLength: 20 }),
  customerName: fc.string({ maxLength: 60 }),
  segment: fc.constantFrom('Enterprise', 'Mid-market', 'SMB', 'Unknown' as never),
  region: fc.string({ maxLength: 30 }),
  industry: fc.string({ maxLength: 30 }),
  csmName: fc.string({ maxLength: 30 }),
  renewalDate: fc
    .date({ min: new Date('2020-01-01'), max: new Date('2035-12-31'), noInvalidDate: true })
    .map((d) => d.toISOString().slice(0, 10)),
  arrGbp: fc.oneof(fc.integer({ min: -50_000, max: 50_000_000 }), fc.constant(0)),
  contractTermMonths: fc.integer({ min: 0, max: 120 }),
  productsOwned: fc.array(fc.string({ maxLength: 20 }), { maxLength: 6 }),
  seatsPurchased: fc.integer({ min: 0, max: 1_000_000 }),
  activeUsers30d: fc.integer({ min: 0, max: 1_000_000 }),
  activeUsersPrevious30d: fc.integer({ min: 0, max: 1_000_000 }),
  weeklyActiveUsers30d: fc.option(fc.integer({ min: 0, max: 1_000_000 }), { nil: null }),
  daysSinceLastCustomerEngagement: fc.option(fc.integer({ min: -10, max: 5_000 }), { nil: null }),
  supportTickets90d: fc.integer({ min: 0, max: 10_000 }),
  criticalSupportTickets90d: fc.integer({ min: 0, max: 10_000 }),
  npsScore: fc.option(fc.integer({ min: -100, max: 100 }), { nil: null }),
  invoiceStatus: fc.constantFrom('Current', 'Overdue', 'Disputed', 'Partially paid' as never, '' as never),
  renewalStage: fc.constantFrom(
    'Not started',
    'Outreach scheduled',
    'In discussion',
    'Commercial review',
    'Verbal commitment',
    'Awaiting legal' as never,
  ),
  executiveSponsorStatus: fc.constantFrom('Active', 'Inactive', 'Unknown', 'Left company', 'Retired' as never),
  lastRenewalDiscountPct: fc.integer({ min: -20, max: 200 }),
  usageDataLastSyncedAt: fc
    .date({ min: new Date('2020-01-01'), max: new Date('2030-12-31'), noInvalidDate: true })
    .map((d) => d.toISOString().slice(0, 10)),
  npsResponseDate: fc.option(
    fc
      .date({ min: new Date('2015-01-01'), max: new Date('2030-12-31'), noInvalidDate: true })
      .map((d) => d.toISOString().slice(0, 10)),
    { nil: null },
  ),
  customerNotes: fc.string({ maxLength: 400 }),
}) as fc.Arbitrary<Customer>;

describe('scoring invariants hold for any customer', () => {
  it('never throws', () => {
    fc.assert(
      fc.property(arbCustomer, (c) => {
        scoreCustomer(c, ASOF, CTX);
      }),
      { numRuns: 2000 },
    );
  });

  it('risk score is always a finite number in [0, 100]', () => {
    fc.assert(
      fc.property(arbCustomer, (c) => {
        const r = scoreCustomer(c, ASOF, CTX);
        expect(Number.isFinite(r.riskScore)).toBe(true);
        expect(r.riskScore).toBeGreaterThanOrEqual(0);
        expect(r.riskScore).toBeLessThanOrEqual(100);
      }),
      { numRuns: 2000 },
    );
  });

  // The failure this guards: an ARR from a credit note used to produce a
  // negative priority, sorting an account to the bottom of the queue for being
  // expensive. No input should be able to do that.
  it('priority score is always finite and non-negative', () => {
    fc.assert(
      fc.property(arbCustomer, (c) => {
        const r = scoreCustomer(c, ASOF, CTX);
        expect(Number.isFinite(r.priorityScore)).toBe(true);
        expect(r.priorityScore).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 2000 },
    );
  });

  it('model coverage is always a fraction in [0, 1]', () => {
    fc.assert(
      fc.property(arbCustomer, (c) => {
        const r = scoreCustomer(c, ASOF, CTX);
        expect(r.modelCoverage).toBeGreaterThanOrEqual(0);
        expect(r.modelCoverage).toBeLessThanOrEqual(1);
      }),
      { numRuns: 1000 },
    );
  });

  it('an excluded signal never contributes weight or points', () => {
    fc.assert(
      fc.property(arbCustomer, (c) => {
        for (const s of scoreCustomer(c, ASOF, CTX).signals) {
          if (s.normalised === null) {
            expect(s.weightApplied).toBe(0);
            expect(s.contribution).toBe(0);
            expect(s.excludedReason).toBeTruthy();
          }
        }
      }),
      { numRuns: 1000 },
    );
  });

  // The re-normalisation promise, stated as arithmetic: the evidence panel adds
  // up to the headline number. If this ever fails the UI is lying about its own
  // maths, which is worse than a wrong weight.
  it('signal contributions always sum to the risk score', () => {
    fc.assert(
      fc.property(arbCustomer, (c) => {
        const r = scoreCustomer(c, ASOF, CTX);
        const sum = r.signals.reduce((s, x) => s + x.contribution, 0);
        expect(Math.abs(sum - r.riskScore)).toBeLessThan(1e-6);
      }),
      { numRuns: 2000 },
    );
  });

  it('applied weight never exceeds the model total', () => {
    fc.assert(
      fc.property(arbCustomer, (c) => {
        const applied = scoreCustomer(c, ASOF, CTX).signals.reduce((s, x) => s + x.weightApplied, 0);
        expect(applied).toBeLessThanOrEqual(TOTAL_WEIGHT + 1e-9);
      }),
      { numRuns: 1000 },
    );
  });

  it('always produces a usable action and a confidence level', () => {
    fc.assert(
      fc.property(arbCustomer, (c) => {
        const r = scoreCustomer(c, ASOF, CTX);
        expect(r.playbook.action.length).toBeGreaterThan(0);
        expect(r.playbook.rationale.length).toBeGreaterThan(0);
        expect(['High', 'Medium', 'Low']).toContain(r.confidence);
        expect(['Critical', 'Elevated', 'Watch', 'Stable']).toContain(r.riskBand);
      }),
      { numRuns: 1000 },
    );
  });

  it('every evidence string is non-empty, so the UI never renders a blank row', () => {
    fc.assert(
      fc.property(arbCustomer, (c) => {
        for (const s of scoreCustomer(c, ASOF, CTX).signals) {
          expect(s.evidence.trim().length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 500 },
    );
  });
});

describe('portfolio invariants hold for any book', () => {
  it('ranks are always a permutation of 1..n on both axes', () => {
    fc.assert(
      fc.property(fc.array(arbCustomer, { minLength: 0, maxLength: 40 }), (customers) => {
        const rows = scoreAll(customers, ASOF);
        expect(rows).toHaveLength(customers.length);
        const expected = Array.from({ length: customers.length }, (_, i) => i + 1);
        expect([...rows.map((r) => r.priorityRank)].sort((a, b) => a - b)).toEqual(expected);
        expect([...rows.map((r) => r.riskOnlyRank)].sort((a, b) => a - b)).toEqual(expected);
      }),
      { numRuns: 300 },
    );
  });

  it('is sorted by descending priority', () => {
    fc.assert(
      fc.property(fc.array(arbCustomer, { minLength: 1, maxLength: 40 }), (customers) => {
        const rows = scoreAll(customers, ASOF);
        for (let i = 1; i < rows.length; i++) {
          expect(rows[i - 1].priorityScore).toBeGreaterThanOrEqual(rows[i].priorityScore);
        }
      }),
      { numRuns: 300 },
    );
  });

  // Scale independence. The same book denominated in a different currency, or a
  // book of SMBs instead of enterprises, must produce the same ORDER — otherwise
  // the value axis is measuring the units rather than the business.
  it('ordering is invariant to a uniform rescaling of ARR', () => {
    fc.assert(
      fc.property(fc.array(arbCustomer, { minLength: 2, maxLength: 20 }), fc.integer({ min: 2, max: 1000 }), (cs, k) => {
        // Non-negative on both sides, so the only difference under test is scale.
        const normalised = cs.map((c) => ({ ...c, arrGbp: Math.max(0, c.arrGbp) }));
        const base = scoreAll(normalised, ASOF).map((r) => r.priorityScore.toFixed(6));
        const scaled = scoreAll(
          normalised.map((c) => ({ ...c, arrGbp: c.arrGbp * k })),
          ASOF,
        ).map((r) => r.priorityScore.toFixed(6));
        expect(scaled).toEqual(base);
      }),
      { numRuns: 200 },
    );
  });
});

describe('csv parser invariants hold for any text', () => {
  it('never throws on arbitrary input', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 2000 }), (text) => {
        parseCsv(text);
      }),
      { numRuns: 2000 },
    );
  });

  it('never throws on arbitrary unicode, including lone surrogates and control bytes', () => {
    fc.assert(
      // `unit: 'binary'` generates lone surrogates and control characters, which
      // the default string arbitrary does not.
      fc.property(fc.string({ unit: 'binary', maxLength: 1000 }), (text) => {
        parseCsv(text);
      }),
      { numRuns: 1000 },
    );
  });

  it('gives every row exactly the named header keys, so no column can shift', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.string({ minLength: 1, maxLength: 8 }).filter((s) => !/[",\n\r]/.test(s) && s.trim() !== ''),
          { minLength: 1, maxLength: 6 },
        ),
        fc.array(fc.array(fc.string({ maxLength: 8 }).filter((s) => !/[",\n\r]/.test(s)), { maxLength: 9 }), {
          minLength: 1,
          maxLength: 8,
        }),
        (header, rows) => {
          // Unnamed and duplicate columns are dropped by design; mirror that here.
          const expected = Array.from(new Set(header.map((h) => h.trim()).filter(Boolean)));
          const text = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
          for (const rec of parseCsv(text)) {
            expect(Object.keys(rec).sort()).toEqual([...expected].sort());
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  // A trailing comma is what Excel writes, and it used to cost a column of data.
  it('never lets an unnamed or duplicate column swallow a named one', () => {
    expect(parseCsv('id,name,,\n1,bob,x,y')).toEqual([{ id: '1', name: 'bob' }]);
    expect(parseCsv('id,id,name\n1,2,bob')).toEqual([{ id: '1', name: 'bob' }]);
    expect(parseCsv('id,name,\n1,bob,')).toEqual([{ id: '1', name: 'bob' }]);
  });

  it('round-trips any value through quoting', () => {
    fc.assert(
      // Two columns, so the row is never entirely blank — an all-empty row is
      // dropped by design, and that behaviour is asserted separately below.
      fc.property(fc.string({ maxLength: 80 }).filter((s) => !/[\r\n]/.test(s)), (value) => {
        const escaped = `"${value.replace(/"/g, '""')}"`;
        expect(parseCsv(`a,b\n${escaped},keep`)[0].a).toBe(value.trim());
      }),
      { numRuns: 1000 },
    );
  });

  it('drops a row whose every cell is empty', () => {
    expect(parseCsv('a\n""')).toEqual([]);
    expect(parseCsv('a,b\n,\n1,2')).toEqual([{ a: '1', b: '2' }]);
  });
});

describe('validation invariants', () => {
  it('every accepted customer carries finite required numbers', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            customer_id: fc.string({ minLength: 1, maxLength: 10 }).filter((s) => !/[",\n]/.test(s)),
            customer_name: fc.string({ maxLength: 20 }),
            renewal_date: fc.oneof(fc.constant('2026-09-01'), fc.constant('not-a-date'), fc.constant('')),
            arr_gbp: fc.oneof(fc.integer({ min: -100, max: 1e6 }).map(String), fc.constant('abc'), fc.constant('')),
            seats_purchased: fc.integer({ min: 0, max: 1000 }).map(String),
            active_users_30d: fc.integer({ min: 0, max: 1000 }).map(String),
            active_users_previous_30d: fc.integer({ min: 0, max: 1000 }).map(String),
            support_tickets_90d: fc.integer({ min: 0, max: 100 }).map(String),
            critical_support_tickets_90d: fc.integer({ min: 0, max: 20 }).map(String),
            invoice_status: fc.constantFrom('Current', 'Overdue', 'Disputed', 'Weird'),
            renewal_stage: fc.constantFrom('Not started', 'In discussion', 'Nonsense'),
            executive_sponsor_status: fc.constantFrom('Active', 'Inactive', 'Odd'),
            usage_data_last_synced_at: fc.oneof(fc.constant('2026-07-20'), fc.constant('nope')),
          }),
          { minLength: 1, maxLength: 15 },
        ),
        (records) => {
          let result;
          try {
            result = validatePortfolio(records as Record<string, string>[]);
          } catch (e) {
            // Only ever the typed schema failure, never an unhandled crash.
            expect(e).toBeInstanceOf(SchemaError);
            return;
          }
          for (const c of result.customers) {
            expect(Number.isFinite(c.arrGbp)).toBe(true);
            expect(Number.isFinite(c.seatsPurchased)).toBe(true);
            expect(Number.isFinite(c.activeUsers30d)).toBe(true);
            expect(c.renewalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
          }
          // Nothing is invented and nothing is duplicated.
          expect(result.customers.length + result.quarantined).toBe(records.length);
          expect(new Set(result.customers.map((c) => c.customerId)).size).toBe(result.customers.length);
        },
      ),
      { numRuns: 500 },
    );
  });
});
