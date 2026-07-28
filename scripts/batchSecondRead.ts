/**
 * `npm run second-read:batch`
 *
 * Runs Second Read over the whole book once and commits the result to
 * `data/second-read.json`.
 *
 * This exists for one reason: a reviewer opens the live link without an OpenAI
 * key of their own. Without a committed batch they see the deterministic
 * fallback everywhere and reasonably conclude the submission shipped keyword
 * rules. With it they see the actual model output, labelled as precomputed and
 * stamped with the model and the date, which is honest and checkable — the
 * prompt is in the repo, so anyone with a key can regenerate it and compare.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { config as loadEnv } from 'dotenv';
import OpenAI from 'openai';
import { loadPortfolio } from '../lib/data';
import { SNAPSHOT_DATE } from '../lib/config';
import {
  SECOND_READ_SCHEMA,
  buildSecondReadPrompt,
  validateSecondRead,
  type SecondReadResult,
} from '../lib/secondRead';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ quiet: true });

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1-nano';
const CONCURRENCY = 5;
const OUT = path.join(process.cwd(), 'data', 'second-read.json');

async function main() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error('No OPENAI_API_KEY. Set it in .env.local to regenerate the batch.');
    process.exit(1);
  }

  const { rows } = await loadPortfolio(SNAPSHOT_DATE);
  const client = new OpenAI({ apiKey: key, timeout: 20_000, maxRetries: 2 });
  const out: Record<string, SecondReadResult> = {};
  const generatedAt = new Date().toISOString();

  console.log(`Second Read batch over ${rows.length} accounts, model ${MODEL}, concurrency ${CONCURRENCY}`);

  let done = 0;
  const queue = [...rows];
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const row = queue.shift();
      if (!row) return;
      try {
        const completion = await client.chat.completions.create({
          model: MODEL,
          temperature: 0,
          max_tokens: 600,
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
        });
        const raw = completion.choices[0]?.message?.content;
        if (!raw) throw new Error('empty response');
        out[row.customer.customerId] = {
          ...validateSecondRead(row, JSON.parse(raw)),
          source: 'llm',
          model: MODEL,
          generatedAt,
        };
      } catch (err) {
        console.error(`  ${row.customer.customerId} failed: ${err instanceof Error ? err.message : err}`);
      }
      done++;
      if (done % 10 === 0) console.log(`  ${done}/${rows.length}`);
    }
  });

  await Promise.all(workers);

  await fs.writeFile(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');

  const byDirection: Record<string, number> = {};
  let droppedTotal = 0;
  for (const r of Object.values(out)) {
    byDirection[r.direction] = (byDirection[r.direction] ?? 0) + 1;
    droppedTotal += r.dropped.length;
  }

  console.log(`\nWrote ${Object.keys(out).length}/${rows.length} results to data/second-read.json`);
  console.log('directions:', JSON.stringify(byDirection));
  console.log(`outputs dropped by validation: ${droppedTotal}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
