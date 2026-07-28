/**
 * THE DECISION STORE — and the seam where a real CRM write-back goes.
 *
 * The README claims persistence is "one function away" from being real. This
 * module is that claim made structural: the component below it knows nothing
 * about localStorage, and swapping this file for one that POSTs to a CRM changes
 * no UI code.
 *
 * Implemented against `useSyncExternalStore` rather than an effect, so the
 * server render and the first client render agree and no cascading render is
 * needed to hydrate. It also means a decision recorded in one browser tab
 * appears in another.
 */

export interface Decision {
  customerId: string;
  action: string;
  note: string;
  owner: string;
  decidedAt: string;
  source: 'suggested' | 'overridden';
}

const KEY = 'renewal-decisions-v1';
const listeners = new Set<() => void>();

/**
 * `getSnapshot` must return a referentially stable value between changes or
 * React re-renders forever. The raw string from localStorage is stable; the
 * parsed object is not, so parsing happens above this line and is memoised here.
 */
let cachedRaw: string | null = null;
let cachedParsed: Record<string, Decision> = {};

function emit() {
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Cross-tab updates. `storage` only fires in *other* tabs, which is why local
  // mutations also call emit() directly.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function getSnapshot(): string {
  try {
    return window.localStorage.getItem(KEY) ?? '{}';
  } catch {
    // Private browsing, disabled storage, or a sandboxed iframe.
    return '{}';
  }
}

/** The server has no decisions. Returning a constant keeps hydration consistent. */
export function getServerSnapshot(): string {
  return '{}';
}

export function parseDecisions(raw: string): Record<string, Decision> {
  if (raw === cachedRaw) return cachedParsed;
  try {
    const parsed = JSON.parse(raw);
    cachedRaw = raw;
    cachedParsed = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    cachedRaw = raw;
    cachedParsed = {};
  }
  return cachedParsed;
}

export class DecisionWriteError extends Error {}

/** THE SEAM. Replace this body with a CRM call and nothing above it changes. */
function write(all: Record<string, Decision>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    throw new DecisionWriteError(
      'Could not save the decision. Browser storage may be full, or disabled in this context.',
    );
  }
  emit();
}

export function saveDecision(decision: Decision): void {
  const all = parseDecisions(getSnapshot());
  write({ ...all, [decision.customerId]: decision });
}

export function clearDecision(customerId: string): void {
  const all = { ...parseDecisions(getSnapshot()) };
  delete all[customerId];
  write(all);
}
