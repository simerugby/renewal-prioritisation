'use client';

import { useEffect, useState } from 'react';

/**
 * "Decide and record what to do next."
 *
 * Persistence is localStorage. That is a deliberate prototype choice, not an
 * oversight: a reviewer needs the decision to survive a refresh, and it does not
 * need a database and an auth flow to prove the workflow. The seam where a real
 * CRM write-back would go is a single function — `persist` — and it is the only
 * thing that changes when this becomes real.
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

function readAll(): Record<string, Decision> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

function persist(all: Record<string, Decision>) {
  window.localStorage.setItem(KEY, JSON.stringify(all));
}

const OPTIONS = [
  'Accept the suggested action',
  'Escalate to leadership',
  'Schedule a call this week',
  'Hand to Finance',
  'Refresh the data first',
  'No action — deprioritise',
];

export default function DecisionRecorder({
  customerId,
  suggestedAction,
  suggestedOwner,
}: {
  customerId: string;
  suggestedAction: string;
  suggestedOwner: string;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [saved, setSaved] = useState<Decision | null>(null);
  const [choice, setChoice] = useState(OPTIONS[0]);
  const [note, setNote] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const existing = readAll()[customerId] ?? null;
    setSaved(existing);
    if (existing) {
      setChoice(OPTIONS.includes(existing.action) ? existing.action : OPTIONS[0]);
      setNote(existing.note);
    }
    setHydrated(true);
  }, [customerId]);

  const save = () => {
    setError(null);
    try {
      const decision: Decision = {
        customerId,
        action: choice,
        note: note.trim(),
        owner: suggestedOwner,
        decidedAt: new Date().toISOString(),
        source: choice === OPTIONS[0] ? 'suggested' : 'overridden',
      };
      const all = readAll();
      all[customerId] = decision;
      persist(all);
      setSaved(decision);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2200);
    } catch {
      setError('Could not save. Browser storage may be full or disabled in this context.');
    }
  };

  const clear = () => {
    const all = readAll();
    delete all[customerId];
    persist(all);
    setSaved(null);
    setNote('');
    setChoice(OPTIONS[0]);
  };

  if (!hydrated) {
    return <div className="skeleton h-[124px] rounded" aria-hidden />;
  }

  return (
    <div className="flex flex-col gap-3">
      {saved && (
        <div className="rounded border border-border-subtle bg-surface-2 px-3 py-2 text-[12px]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">Recorded: {saved.action}</span>
            <span className="text-muted-2">
              {new Date(saved.decidedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          </div>
          {saved.note && <p className="mt-1 leading-snug text-muted">{saved.note}</p>}
          <button onClick={clear} className="mt-1.5 text-[11px] text-accent hover:underline">
            Clear this decision
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label className="text-[12px] text-muted" htmlFor="decision-choice">
          Decision
        </label>
        <select
          id="decision-choice"
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className="rounded border border-border-subtle bg-surface px-2.5 py-1.5 text-[13px] focus:outline-none"
        >
          {OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o === OPTIONS[0] ? `${o} — ${suggestedAction}` : o}
            </option>
          ))}
        </select>

        <label className="text-[12px] text-muted" htmlFor="decision-note">
          Note <span className="text-muted-2">(optional)</span>
        </label>
        <textarea
          id="decision-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="Anything the next person picking this up needs to know…"
          className="resize-y rounded border border-border-subtle bg-surface px-2.5 py-1.5 text-[13px] placeholder:text-muted-2 focus:outline-none"
        />

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            className="rounded bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90"
          >
            {saved ? 'Update decision' : 'Record decision'}
          </button>
          {justSaved && <span className="text-[12px] text-risk-stable">Saved</span>}
        </div>

        {error && (
          <p role="alert" className="text-[12px] text-risk-critical">
            {error}
          </p>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-muted-2">
        Stored in this browser only. In production this is the one function that changes — the decision
        writes back to the CRM instead, and the rest of the app is unaffected.
      </p>
    </div>
  );
}
