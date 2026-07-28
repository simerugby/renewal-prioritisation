'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Header navigation.
 *
 * Three links with no active state read as three words in a row — nothing told
 * you which page you were on, and on the account pages nothing told you that
 * "Portfolio" was where you came from. The current section now carries a filled
 * pill, so position is legible without reading the URL.
 */
const LINKS = [
  { href: '/', label: 'Portfolio', match: (p: string) => p === '/' || p.startsWith('/customer') },
  { href: '/method', label: 'How the score works', match: (p: string) => p.startsWith('/method') },
  { href: '/try', label: 'Try your own data', match: (p: string) => p.startsWith('/try') },
];

export default function SiteNav() {
  const pathname = usePathname() ?? '/';

  return (
    <nav className="flex items-center gap-1" aria-label="Sections">
      {LINKS.map((l) => {
        const active = l.match(pathname);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded px-2.5 py-1 text-[13px] transition-colors ${
              active
                ? 'bg-accent-soft font-medium text-accent'
                : 'text-muted hover:bg-surface-2 hover:text-foreground'
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
