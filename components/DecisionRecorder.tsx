'use client';

import { useState, useSyncExternalStore } from 'react';
import {
  clearDecision,
  getServerSnapshot,
  getSnapshot,
  parseDecisions,
  saveDecision,
  subscribe,
  type Decision,
} from '@/lib/decisions';

/**
 * "Decide and record what to do next."
 *
 * Persistence is deliberately a prototype: a reviewer needs the decision to
 * survive a refresh, which it does, and it does not need auth and a schema to
 * prove the workflow. All storage lives behind `lib/decisions.ts` so making it
 * real is one module, not a refactor.
 */

const OPTIONS = [
  'Accept the suggested action',
  'Escalate to leadership',
  'Schedule a call this week',
  'Hand to Finance',
  'Refresh the data first',
  'No action — deprioritise',
];

/**
 * Keyed on the saved decision's identity by the parent, so it remounts with the
 * right defaults when the stored value changes. That is what removes the need
 * for a hydration effect.
 */
function DecisionForm({
  customerId,
  saved,
  suggestedAction,
  suggestedOwner,
}: {
  customerId: string;
  saved: Decision | null;
  suggestedAction: string;
  suggestedOwner: string;
}) {
  const [choice, setChoice] = useState(
    saved && OPTIONS.includes(saved.action) ? saved.action : OPTIONS[0],
  );
  const [note, setNote] = useState(saved?.note ?? '');
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setError(null);
    try {
      saveDecision({
        customerId,
        action: choice,
        note: note.trim(),
        owner: suggestedOwner,
        decidedAt: new Date().toISOString(),
        source: choice === OPTIONS[0] ? 'suggested' : 'overridden',
      });
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 2200);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the decision.');
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-[12px] text-muted" htmlFor={`decision-choice-${customerId}`}>
        Decision
      </label>
      <select
        id={`decision-choice-${customerId}`}
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

      <label className="text-[12px] text-muted" htmlFor={`decision-note-${customerId}`}>
        Note <span className="text-muted-2">(optional)</span>
      </label>
      <textarea
        id={`decision-note-${customerId}`}
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
  );
}

export default function DecisionRecorder({
  customerId,
  suggestedAction,
  suggestedOwner,
}: {
  customerId: string;
  suggestedAction: string;
  suggestedOwner: string;
}) {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const saved = parseDecisions(raw)[customerId] ?? null;

  return (
    <div className="flex flex-col gap-3">
      {saved && (
        <div className="rounded border border-border-subtle bg-surface-2 px-3 py-2 text-[12px]">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">Recorded: {saved.action}</span>
            <time dateTime={saved.decidedAt} className="text-muted-2">
              {new Date(saved.decidedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
            </time>
          </div>
          {saved.note && <p className="mt-1 leading-snug text-muted">{saved.note}</p>}
          <button onClick={() => clearDecision(customerId)} className="mt-1.5 text-[11px] text-accent hover:underline">
            Clear this decision
          </button>
        </div>
      )}

      <DecisionForm
        key={saved?.decidedAt ?? 'new'}
        customerId={customerId}
        saved={saved}
        suggestedAction={suggestedAction}
        suggestedOwner={suggestedOwner}
      />

      <p className="text-[11px] leading-relaxed text-muted-2">
        Stored in this browser only, and shared across open tabs. In production one module changes —
        the decision writes back to the CRM instead — and no UI code moves.
      </p>
    </div>
  );
}
