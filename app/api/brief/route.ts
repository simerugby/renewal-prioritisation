import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { loadPortfolio } from '@/lib/data';
import { buildFallbackBrief, buildPrompt, type BriefResponse } from '@/lib/brief';

export const runtime = 'nodejs';

/**
 * THE ONE AI FEATURE.
 *
 * Contract, and it is enforced by the shape of this file rather than by a
 * promise in the README:
 *
 *  1. The risk score, the priority rank and the suggested action are all
 *     computed by `loadCustomer` BEFORE this route talks to a model. They are
 *     passed into the prompt as read-only facts. There is no code path in which
 *     a model response changes a number the user sees ranked.
 *  2. The model's job is the one thing arithmetic cannot do: read the free-text
 *     account note, reconcile it against the computed signals, and say what a
 *     CSM should understand before they pick up the phone.
 *  3. Every failure — no key, timeout, rate limit, malformed JSON — falls back
 *     to a deterministic brief assembled from the same evidence. The feature
 *     degrades, the app does not.
 *
 * Cost control, because an eval endpoint a reviewer can click 40 times should
 * not be able to run up a bill: small model, capped output, low temperature,
 * 12-second timeout, and an in-process cache keyed by customer so repeat views
 * are free.
 */

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
const TIMEOUT_MS = 12_000;
const MAX_OUTPUT_TOKENS = 400;

const cache = new Map<string, BriefResponse>();

export async function POST(request: Request) {
  let customerId: string;
  try {
    const body = await request.json();
    customerId = String(body?.customerId ?? '');
  } catch {
    return NextResponse.json({ error: 'Malformed request body.' }, { status: 400 });
  }

  if (!customerId) {
    return NextResponse.json({ error: 'customerId is required.' }, { status: 400 });
  }

  const portfolio = await loadPortfolio().catch(() => null);
  const row = portfolio?.rows.find((r) => r.customer.customerId === customerId) ?? null;
  if (!row) {
    return NextResponse.json({ error: `No account found with id ${customerId}.` }, { status: 404 });
  }

  const cacheKey = `${MODEL}:${customerId}`;
  const cached = cache.get(cacheKey);
  if (cached) return NextResponse.json({ ...cached, cached: true });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Not an error state. The app is fully usable without a key, and saying so
    // plainly is more useful to a reviewer than a red banner.
    return NextResponse.json(buildFallbackBrief(row, 'no-key'));
  }

  try {
    const client = new OpenAI({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
    const completion = await client.chat.completions.create(
      {
        model: MODEL,
        temperature: 0.2,
        max_tokens: MAX_OUTPUT_TOKENS,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'renewal_brief',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['headline', 'reading', 'noteRiskPresent', 'noteRiskSummary', 'openingLine'],
              properties: {
                headline: {
                  type: 'string',
                  description: 'One sentence a CSM could say out loud to summarise this account today.',
                },
                reading: {
                  type: 'string',
                  description:
                    'Two to four sentences reconciling the computed signals with the account note. Name any place they disagree.',
                },
                noteRiskPresent: {
                  type: 'boolean',
                  description:
                    'True only if the account note contains material renewal risk that the listed structured signals do not already capture.',
                },
                noteRiskSummary: {
                  type: 'string',
                  description:
                    'If noteRiskPresent, what that risk is and why the signals missed it. Otherwise an empty string.',
                },
                openingLine: {
                  type: 'string',
                  description: 'A first sentence for the outreach, specific to this account. No greeting, no sign-off.',
                },
              },
            },
          },
        },
        messages: [
          {
            role: 'system',
            content:
              'You are briefing a customer success manager before a renewal conversation. You are given a risk score and its evidence, already computed. Never dispute, recalculate or restate the score as a different number, and never express risk as a probability or percentage chance of churn. Your value is reading the free-text account note against the computed signals. Be specific, name dates and people from the note, and be brief. If the note adds nothing the signals do not already show, say so.',
          },
          { role: 'user', content: buildPrompt(row, portfolio?.rows.length) },
        ],
      },
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return NextResponse.json(buildFallbackBrief(row, 'empty-response'));

    const parsed = JSON.parse(raw) as Omit<BriefResponse, 'source' | 'model'>;
    const response: BriefResponse = { ...parsed, source: 'llm', model: MODEL };
    cache.set(cacheKey, response);
    return NextResponse.json(response);
  } catch (err) {
    const reason =
      err instanceof Error && /timeout|aborted/i.test(err.message)
        ? 'timeout'
        : err instanceof Error && /429|rate/i.test(err.message)
          ? 'rate-limited'
          : 'error';
    console.error('[api/brief] falling back:', err);
    return NextResponse.json(buildFallbackBrief(row, reason));
  }
}
