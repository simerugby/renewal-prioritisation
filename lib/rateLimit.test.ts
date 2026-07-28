import { beforeEach, describe, expect, it } from 'vitest';
import { checkRateLimit, clientKeyFrom, resetRateLimits } from './rateLimit';

describe('checkRateLimit', () => {
  beforeEach(() => resetRateLimits());

  it('allows the first request', () => {
    expect(checkRateLimit('a').allowed).toBe(true);
  });

  it('blocks once the window budget is spent', () => {
    const max = Number(process.env.RATE_LIMIT_MAX ?? 40);
    for (let i = 0; i < max; i++) expect(checkRateLimit('a').allowed).toBe(true);
    const blocked = checkRateLimit('a');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('keeps separate budgets per client', () => {
    const max = Number(process.env.RATE_LIMIT_MAX ?? 40);
    for (let i = 0; i < max; i++) checkRateLimit('a');
    expect(checkRateLimit('a').allowed).toBe(false);
    expect(checkRateLimit('b').allowed).toBe(true);
  });

  it('lets a client through again once the window rolls over', () => {
    const max = Number(process.env.RATE_LIMIT_MAX ?? 40);
    const t0 = 1_000_000;
    for (let i = 0; i < max; i++) checkRateLimit('a', t0);
    expect(checkRateLimit('a', t0).allowed).toBe(false);
    const later = t0 + Number(process.env.RATE_LIMIT_WINDOW_MS ?? 600_000) + 1;
    expect(checkRateLimit('a', later).allowed).toBe(true);
  });
});

describe('clientKeyFrom', () => {
  it('takes the original client from x-forwarded-for', () => {
    const req = new Request('https://x.test', {
      headers: { 'x-forwarded-for': '203.0.113.7, 70.41.3.18' },
    });
    expect(clientKeyFrom(req)).toBe('203.0.113.7');
  });

  it('falls back to a shared bucket rather than to unlimited', () => {
    expect(clientKeyFrom(new Request('https://x.test'))).toBe('unknown-client');
  });
});
