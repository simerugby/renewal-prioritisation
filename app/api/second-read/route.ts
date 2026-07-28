import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { loadPortfolio } from '@/lib/data';
import { checkRateLimit, clientKeyFrom } from '@/lib/rateLimit';
import { readSecondReadBatch } from '@/lib/secondReadBatch';
import {
  SECOND_READ_SCHEMA,
  buildFallbackSecondRead,
  buildSecondReadPrompt,
  validateSecondRead,
  type SecondReadResult,
} from '@/lib/secondRead';

export const runtime = 'nodejs';

/**
 * THE ONE AI SURFACE.
 *
 * One call type, one call per account. Not batched, for three reasons, and the
 * third is the one that matters: isolation (a malformed note cannot corrupt
 * another account's output), partial failure (three timeouts leave 37 results
 * rather than none), and — decisively — the published accuracy figures were
 * measured per note, so a batched call would mean those numbers no longer
 * describe the call that actually ships.
 *
 * There is deliberately no second call. No critic, no self-verifier, no judge.
 * At this model size a deterministic validator is a strictly better critic than
 * another pass of the same model: it is free, reproducible, and it cannot be
 * talked out of its answer. The independent checks are the clause-index render,
 * the firing-signal gate, the enum validator, and the human.
 *
 * Three ways a result can arrive, and the UI says which:
 *   llm          a live call, when a key is configured
 *   precomputed  the committed batch, so a reviewer without a key still sees
 *                the real thing rather than concluding we shipped keyword rules
 *   fallback     the deterministic scanner, when there is neither
 */

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1-nano';
const TIMEOUT_MS = 15_000;
const MAX_OUTPUT_TOKENS = 600;

const cache = new Map<string, SecondReadResult>();

function redactSecrets(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, 'sk-[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9._-]{16,}/gi, 'Bearer [REDACTED]');
}

export async function POST(request: Request) {
  let customerId: string;
  try {
    customerId = String((await request.json())?.customerId ?? '');
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
  }
  if (!customerId) return NextResponse.json({ error: 'customerId is required.' }, { status: 400 });

  const portfolio = await loadPortfolio().catch(() => null);
  const row = portfolio?.rows.find((r) => r.customer.customerId === customerId) ?? null;
  if (!row) return NextResponse.json({ error: `No account found with id ${customerId}.` }, { status: 404 });

  const cacheKey = `${MODEL}:${customerId}`;
  const hit = cache.get(cacheKey);
  if (hit) return NextResponse.json({ ...hit, cached: true });

  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    const precomputed = (await readSecondReadBatch())?.[customerId];
    if (precomputed) return NextResponse.json({ ...precomputed, source: 'precomputed' });
    return NextResponse.json(buildFallbackSecondRead(row, 'no-key'));
  }

  const limit = checkRateLimit(clientKeyFrom(request));
  if (!limit.allowed) {
    const precomputed = (await readSecondReadBatch())?.[customerId];
    if (precomputed) return NextResponse.json({ ...precomputed, source: 'precomputed' });
    return NextResponse.json(buildFallbackSecondRead(row, 'rate-limited'), {
      headers: { 'Retry-After': String(limit.retryAfterSeconds) },
    });
  }

  try {
    const client = new OpenAI({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
    const completion = await client.chat.completions.create(
      {
        model: MODEL,
        temperature: 0,
        max_tokens: MAX_OUTPUT_TOKENS,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'second_read', strict: true, schema: SECOND_READ_SCHEMA },
        },
        messages: [
          {
            role: 'system',
            content:
              'You are a second reader on a renewal account. A scoring model has already read the structured columns; your only job is the free-text note. Refer to clauses by number, never by quoting them. Never mention a risk score, a rank or a probability. Be brief and concrete. If the note only restates what the signals already show, say adds-nothing.',
          },
          { role: 'user', content: buildSecondReadPrompt(row) },
        ],
      },
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return NextResponse.json(buildFallbackSecondRead(row, 'empty-response'));

    const validated = validateSecondRead(row, JSON.parse(raw));
    const result: SecondReadResult = {
      ...validated,
      source: 'llm',
      model: MODEL,
      generatedAt: new Date().toISOString(),
    };
    cache.set(cacheKey, result);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    const reason = /timeout|aborted/i.test(message) ? 'timeout' : /429|rate/i.test(message) ? 'rate-limited' : 'error';
    console.error(`[api/second-read] falling back (${reason}): ${redactSecrets(message)}`);

    const precomputed = (await readSecondReadBatch())?.[customerId];
    if (precomputed) return NextResponse.json({ ...precomputed, source: 'precomputed' });
    return NextResponse.json(buildFallbackSecondRead(row, reason));
  }
}
