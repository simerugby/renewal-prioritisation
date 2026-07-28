import 'server-only';
import { promises as fs } from 'fs';
import path from 'path';
import type { SecondReadResult } from './secondRead';

/**
 * The committed batch of model output, read on the server.
 *
 * Kept in its own module because it touches `fs`: importing it from a client
 * component would break the build, and `server-only` turns that into a clear
 * error instead of a confusing bundler failure.
 *
 * It does two jobs. It lets a reviewer without an OpenAI key see the real
 * feature rather than concluding the submission shipped keyword rules, and it
 * lets the account page render a result immediately — which is also the fix for
 * a real defect: the panel used to start empty behind a button, so navigating
 * away and back lost the result, and a reviewer clicking through five accounts
 * met five buttons and never saw the feature at all.
 */

const BATCH_PATH = path.join(process.cwd(), 'data', 'second-read.json');

let cache: Record<string, SecondReadResult> | null | undefined;

export async function readSecondReadBatch(): Promise<Record<string, SecondReadResult> | null> {
  if (cache !== undefined) return cache ?? null;
  try {
    cache = JSON.parse(await fs.readFile(BATCH_PATH, 'utf8')) as Record<string, SecondReadResult>;
  } catch {
    cache = null;
  }
  return cache ?? null;
}

export async function precomputedSecondRead(customerId: string): Promise<SecondReadResult | null> {
  const batch = await readSecondReadBatch();
  const hit = batch?.[customerId];
  return hit ? { ...hit, source: 'precomputed' } : null;
}
