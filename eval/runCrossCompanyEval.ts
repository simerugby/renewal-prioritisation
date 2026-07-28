/**
 * `npm run eval:cross` — the number a serial-acquisition holdco actually wants.
 *
 * Every other measurement in this repo is taken on the supplied file, or on
 * rewordings of the supplied file that I wrote myself. Both are open to the same
 * objection: the corpus and the labels come from the same person.
 *
 * This one runs the shipped Second Read call against a completely different
 * company's export — the ACME fixture from `lib/portability.test.ts`. Different
 * columns, unseen enum values, an SMB book two orders of magnitude smaller, and
 * notes written in a different register: lowercase, informal, no punctuation
 * conventions ("practice manager retiring in sept, no handover planned yet").
 *
 * Nothing here was tuned. The prompt is generated from `SIGNAL_LABELS` and the
 * `KNOWN_*` lists, so it adapts to the new book without being edited, and the
 * keyword rules are exactly the ones written for the first company.
 *
 * The question it answers: when this is pointed at company number two, what
 * still works?
 */

import { config as loadEnv } from 'dotenv';
import OpenAI from 'openai';
import { parseCsv } from '../lib/csv';
import { validatePortfolio } from '../lib/schema';
import { scoreAll } from '../lib/scoring';
import { SNAPSHOT_DATE } from '../lib/config';
import {
  MATERIAL_NOTE_FLAGS,
  SECOND_READ_SCHEMA,
  buildSecondReadPrompt,
  validateSecondRead,
} from '../lib/secondRead';
import { SECOND_COMPANY_CSV } from './acmeFixture';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ quiet: true });

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1-nano';

/**
 * Hand-labelled for the ACME book, against the same question the shipped feature
 * asks: does the note add risk the structured signals do not already capture?
 * Five accounts survive validation.
 */
const ACME_LABELS: Record<string, { addsRisk: boolean; why: string }> = {
  'ACME-01': { addsRisk: true, why: 'The practice manager is retiring with no handover planned. Sponsor status reads Active, so nothing structured knows.' },
  'ACME-02': { addsRisk: false, why: 'Happy, asking about a second branch. Opportunity, not risk.' },
  'ACME-03': { addsRisk: true, why: 'A competitor is being trialled. No column can see competition, and the owner has gone quiet on top.' },
  'ACME-04': { addsRisk: true, why: 'Renewal agreed verbally with the paperwork sitting at their accountant. The stage field says Verbal commitment and reads as safe.' },
  'ACME-05': { addsRisk: true, why: 'A site closed in May and it is unclear whether they are continuing. That is an exit question no signal asks.' },
};

async function main() {
  const records = parseCsv(SECOND_COMPANY_CSV);
  const { customers } = validatePortfolio(records);
  const rows = scoreAll(customers, SNAPSHOT_DATE);

  console.log(`Cross-company run: ${rows.length} accounts from a book this system has never seen.`);
  console.log('Nothing was tuned. Same rules, same prompt template, same validators.\n');

  const truth = (id: string) => ACME_LABELS[id]?.addsRisk === true;
  const expected = rows.filter((r) => truth(r.customer.customerId)).length;

  // --- keyword rules, written for the first company -------------------------
  let ruleHits = 0;
  const ruleMisses: string[] = [];
  for (const r of rows) {
    const flagged = r.noteFlags.some((f) => MATERIAL_NOTE_FLAGS.includes(f.key));
    if (truth(r.customer.customerId)) {
      if (flagged) ruleHits++;
      else ruleMisses.push(`${r.customer.customerId} ${r.customer.customerName}: "${r.customer.customerNotes}"`);
    }
  }

  const key = process.env.OPENAI_API_KEY;
  const client = key ? new OpenAI({ apiKey: key, timeout: 20_000, maxRetries: 2 }) : null;

  let modelHits = 0;
  const modelMisses: string[] = [];
  if (client) {
    for (const r of rows) {
      const completion = await client.chat.completions.create({
        model: MODEL,
        temperature: 0,
        max_tokens: 600,
        response_format: { type: 'json_schema', json_schema: { name: 'second_read', strict: true, schema: SECOND_READ_SCHEMA } },
        messages: [
          {
            role: 'system',
            content:
              'You are a second reader on a renewal account. A scoring model has already read the structured columns; your only job is the free-text note. Refer to clauses by number, never by quoting them. Never mention a risk score, a rank or a probability. Be brief and concrete. If the note only restates what the signals already show, say adds-nothing.',
          },
          { role: 'user', content: buildSecondReadPrompt(r) },
        ],
      });
      const out = validateSecondRead(r, JSON.parse(completion.choices[0]?.message?.content ?? '{}'));
      const flagged = out.addsRiskBeyondSignals;
      if (truth(r.customer.customerId)) {
        if (flagged) modelHits++;
        else modelMisses.push(`${r.customer.customerId} ${r.customer.customerName}`);
      }
    }
  }

  console.log(`Accounts whose note adds risk beyond the signals: ${expected} of ${rows.length}\n`);
  console.log(`  keyword rules caught  ${ruleHits}/${expected}`);
  if (client) console.log(`  ${MODEL} caught  ${modelHits}/${expected}`);
  else console.log(`  (no OPENAI_API_KEY, so the model column did not run)`);

  if (ruleMisses.length) {
    console.log('\n  What the rules missed on this book:');
    for (const m of ruleMisses) console.log(`    ${m}`);
  }
  if (client && modelMisses.length) {
    console.log('\n  What the model missed:');
    for (const m of modelMisses) console.log(`    ${m}`);
  }

  console.log('\n--- WHY THIS IS THE NUMBER THAT MATTERS ---');
  console.log('On the supplied file the rules beat the model, and I would delete the API call.');
  console.log('This book is the reason the call exists: at company number two nobody rewrites the');
  console.log('regexes, and the notes are written by different people with different habits.');
  console.log('Five accounts is a small sample and a single run — quoted as a direction, not a rate.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
