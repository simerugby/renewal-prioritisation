/**
 * `npm run eval` — the head-to-head that decides whether the API call earns its place.
 *
 * Two test sets, two systems:
 *
 *   IN-CORPUS    the 40 supplied notes, labelled by hand.
 *                Biased FOR the rules: I wrote the regexes having read these.
 *   PARAPHRASED  14 of those facts rewritten in another team's voice.
 *                Biased AGAINST the rules: I wrote them knowing what the rules match.
 *
 * Neither number is trustworthy alone. The gap between them is the finding, and
 * it is the answer to "what happens at the next company in the portfolio?"
 *
 * The LLM columns run only when OPENAI_API_KEY is set. Without a key the rule
 * columns still run and the output says plainly that the comparison is
 * incomplete — an eval that silently reports half of itself is worse than none.
 */

import { config as loadEnv } from 'dotenv';
import OpenAI from 'openai';

// `.env.local` first, matching Next.js's own precedence. Plain `dotenv/config`
// only reads `.env`, so the key sat there unread and the eval quietly reported
// half of itself as if no key existed.
loadEnv({ path: '.env.local', quiet: true });
loadEnv({ quiet: true });
import { NOTE_RULE_KEYS, scanNotes } from '../lib/noteScan';
import { LABELS, runNoteScanEval } from './noteScanEval';
import { PARAPHRASES } from './paraphraseSet';

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-4.1-nano';

const SYSTEM = `You classify free-text CRM account notes for a renewal-risk tool.
Return the single category that best describes the most material renewal risk or opportunity in the note.
Categories: ${NOTE_RULE_KEYS.join(', ')}.
Return "none" only if the note contains nothing a customer success manager would act on.
Answer with the category token alone, no punctuation or explanation.`;

async function classify(client: OpenAI, note: string): Promise<string> {
  const res = await client.chat.completions.create({
    model: MODEL,
    temperature: 0,
    max_tokens: 12,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: note },
    ],
  });
  return (res.choices[0]?.message?.content ?? '').trim().toLowerCase();
}

function pct(n: number, d: number) {
  return d === 0 ? '—' : `${Math.round((n / d) * 100)}%`;
}

async function main() {
  const key = process.env.OPENAI_API_KEY;
  const client = key ? new OpenAI({ apiKey: key, maxRetries: 2 }) : null;

  console.log(`Note-classification eval${client ? ` — rules vs ${MODEL}` : ' — RULES ONLY (no OPENAI_API_KEY set)'}\n`);

  // ---- Set 1: in-corpus -----------------------------------------------------
  const inCorpus = runNoteScanEval();
  console.log('SET 1 — the 40 supplied notes (biased FOR the rules: written after reading them)');
  console.log(`  labelled risks      ${inCorpus.expectedCount}`);
  console.log(`  rules caught        ${inCorpus.caught}  (${pct(inCorpus.caught, inCorpus.expectedCount)})`);
  console.log(`  rules missed        ${inCorpus.missed.length}`);
  console.log(`  false positives     ${inCorpus.falsePositives.length}`);

  let llmInCorpus = 0;
  let llmInCorpusDetected = 0;
  if (client) {
    const entries = Object.entries(LABELS).filter(([, v]) => v !== null) as [string, string][];
    const fs = await import('fs');
    const { parseCsv } = await import('../lib/csv');
    const rows = parseCsv(fs.readFileSync('data/renewal_customers.csv', 'utf8'));
    const noteById = new Map(rows.map((r) => [r.customer_id, r.customer_notes]));
    for (const [id, label] of entries) {
      const got = await classify(client, noteById.get(id) ?? '');
      if (got === label) llmInCorpus++;
      if (got && got !== 'none') llmInCorpusDetected++;
    }
    console.log(`  ${MODEL} exact label ${llmInCorpus}  (${pct(llmInCorpus, entries.length)})`);
    console.log(`  ${MODEL} detected any ${llmInCorpusDetected}  (${pct(llmInCorpusDetected, entries.length)})`);
  }

  // ---- Set 2: paraphrased ---------------------------------------------------
  console.log('\nSET 2 — the same facts in another team\'s voice (biased AGAINST the rules)');
  let ruleHits = 0;
  const ruleMisses: ParaMiss[] = [];
  type ParaMiss = { id: string; label: string; got: string; paraphrase: string };

  for (const p of PARAPHRASES) {
    const flags = scanNotes(p.paraphrase).map((f) => f.key);
    if (flags.includes(p.label)) ruleHits++;
    else ruleMisses.push({ id: p.id, label: p.label, got: flags.join('+') || 'nothing', paraphrase: p.paraphrase });
  }
  console.log(`  cases               ${PARAPHRASES.length}`);
  console.log(`  rules caught        ${ruleHits}  (${pct(ruleHits, PARAPHRASES.length)})`);

  // Detection versus taxonomy agreement, measured separately.
  //
  // Scoring a multi-label problem as single-label punishes a defensible answer.
  // "Our main advocate is no longer with the business" is sponsor-loss by my
  // label and a blocker with no named owner by the model's, and both readings
  // send a CSM to the same place. What actually matters for the product is
  // whether the note was flagged as carrying material risk at all — so that is
  // measured on its own line.
  const ruleDetectedPara = PARAPHRASES.filter((p) => scanNotes(p.paraphrase).length > 0).length;
  console.log(`  rules detected any  ${ruleDetectedPara}  (${pct(ruleDetectedPara, PARAPHRASES.length)})`);

  let llmPara = 0;
  let llmParaDetected = 0;
  const llmMisses: { id: string; label: string; got: string }[] = [];
  if (client) {
    for (const p of PARAPHRASES) {
      const got = await classify(client, p.paraphrase);
      if (got === p.label) llmPara++;
      else llmMisses.push({ id: p.id, label: p.label, got });
      if (got && got !== 'none') llmParaDetected++;
    }
    console.log(`  ${MODEL} exact label ${llmPara}  (${pct(llmPara, PARAPHRASES.length)})`);
    console.log(`  ${MODEL} detected any ${llmParaDetected}  (${pct(llmParaDetected, PARAPHRASES.length)})`);
  }

  if (ruleMisses.length) {
    console.log('\n  Rule failures on paraphrase:');
    for (const m of ruleMisses) {
      console.log(`    ${m.id} expected ${m.label}, got ${m.got}`);
      console.log(`      "${m.paraphrase}"`);
    }
  }
  if (client && llmMisses.length) {
    console.log('\n  Model failures on paraphrase:');
    for (const m of llmMisses) console.log(`    ${m.id} expected ${m.label}, got ${m.got}`);
  }

  // ---- Verdict --------------------------------------------------------------
  console.log('\n--- READ THIS BEFORE QUOTING ANY NUMBER ABOVE ---');
  console.log(
    `Rules score ${pct(inCorpus.caught, inCorpus.expectedCount)} on the notes they were written against and ` +
      `${pct(ruleHits, PARAPHRASES.length)} once the wording changes.`,
  );
  console.log('Both figures are biased, in opposite directions, and I wrote both sets — see eval/paraphraseSet.ts.');
  console.log('The finding is the gap, not either number: the rules encode one company\'s phrasing, not the meaning.');
  if (!client) {
    console.log('\nNo OPENAI_API_KEY set, so the model columns did not run. Set the key and re-run for the comparison.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
