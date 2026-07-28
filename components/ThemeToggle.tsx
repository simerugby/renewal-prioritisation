'use client';

import { useSyncExternalStore } from 'react';

/**
 * Light / dark toggle.
 *
 * Three states, not two: `system` follows the OS, and the explicit choices
 * override it in both directions. A reader on a dark OS who wants light gets
 * light, which a two-state toggle built on `prefers-color-scheme` cannot do.
 *
 * The choice is written to `data-theme` on <html>, which `globals.css` reads
 * with a selector that beats the media query. `ThemeScript` in the layout
 * applies the stored value before first paint so there is no flash.
 *
 * Built on useSyncExternalStore rather than an effect for the same reason the
 * decision store is: the server render and the first client render agree.
 */

export type Theme = 'light' | 'dark' | 'system';
const KEY = 'renewal-theme';

const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) cb();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

const getSnapshot = () => read();
const getServerSnapshot = (): Theme => 'system';

function set(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    delete root.dataset.theme;
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable; the in-memory choice still applies */
    }
  } else {
    root.dataset.theme = theme;
    try {
      window.localStorage.setItem(KEY, theme);
    } catch {
      /* as above */
    }
  }
  for (const l of listeners) l();
}

/**
 * Runs before paint. Inline rather than imported so it executes ahead of
 * hydration — otherwise a reader who chose light on a dark OS sees a dark flash
 * on every navigation.
 */
export function ThemeScript() {
  const js = `try{var t=localStorage.getItem('${KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}

const OPTIONS: { value: Theme; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: '☀' },
  { value: 'system', label: 'System', icon: '◐' },
  { value: 'dark', label: 'Dark', icon: '☾' },
];

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div
      className="flex overflow-hidden rounded border border-border-subtle"
      role="radiogroup"
      aria-label="Colour theme"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={theme === o.value}
          aria-label={o.label}
          title={`${o.label} theme`}
          onClick={() => set(o.value)}
          className={`px-2 py-1 text-[12px] leading-none transition-colors ${
            theme === o.value ? 'bg-accent-soft text-accent' : 'text-muted-2 hover:text-foreground'
          }`}
        >
          <span aria-hidden>{o.icon}</span>
        </button>
      ))}
    </div>
  );
}
