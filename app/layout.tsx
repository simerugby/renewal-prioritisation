import type { Metadata } from 'next';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import SiteNav from '@/components/SiteNav';
import ThemeToggle, { ThemeScript } from '@/components/ThemeToggle';
import { SNAPSHOT_DATE } from '@/lib/config';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Renewal Prioritisation',
  description:
    'Which customer renewals need attention, why, and what to do next — a transparent scoring model over a portfolio snapshot.',
  // The Aries mark in black, with a white copy for a dark tab strip — the same
  // glyph either way, so it never dissolves into the browser chrome.
  icons: {
    icon: [
      { url: '/icon-light.png', media: '(prefers-color-scheme: light)', type: 'image/png' },
      { url: '/icon-dark.png', media: '(prefers-color-scheme: dark)', type: 'image/png' },
      { url: '/icon-light.png', type: 'image/png' },
    ],
    apple: '/apple-icon.png',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-border-subtle bg-surface">
          {/*
            Full-bleed rather than on the content grid: the mark belongs in the
            corner of the window, the way an app's chrome does, not indented to
            meet the first column of the page.
          */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
            {/*
              A co-brand lockup, not a claim of authorship: the Aries wordmark,
              a hair rule, then the app name. The rule matters — set flush
              against each other the two read as one title.
            */}
            <div className="flex items-center gap-2.5">
              <span
                className="aries-wordmark"
                role="img"
                aria-label="Aries Global"
                title="Case submission for Aries Global"
              />
              <span className="h-3.5 w-px bg-border-strong" aria-hidden />
              <Link href="/" className="text-[15px] font-semibold tracking-tight">
                Renewal Prioritisation
              </Link>
            </div>
            <SiteNav />
            <div className="ml-auto flex items-center gap-3">
              {/*
                The snapshot date sits in the chrome on every page, deliberately.
                Every "days to renewal" in this app counts from here, not from
                today, so the numbers reproduce whenever anyone opens it.
              */}
              <span className="hidden items-center gap-1.5 rounded border border-border-subtle px-2 py-1 text-[11px] text-muted-2 sm:flex">
                <span className="inline-block size-1.5 rounded-full bg-muted-2" aria-hidden />
                <span className="tnum">Snapshot {SNAPSHOT_DATE}</span>
              </span>
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-6">{children}</main>

        <footer className="border-t border-border-subtle px-5 py-4 text-[12px] text-muted-2">
          <div className="mx-auto max-w-[1400px]">
            Scores are a transparent rubric for ordering work, not a prediction. This dataset carries no
            historical renewal outcomes, so nothing here is a churn probability.
            <span className="mt-1 block">
              Built by Simeón Carrera as a case submission for Aries Global. Not an Aries product.
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
