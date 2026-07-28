import type { Metadata } from 'next';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import { SNAPSHOT_DATE } from '@/lib/config';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Renewal Prioritisation',
  description:
    'Which customer renewals need attention, why, and what to do next — a transparent scoring model over a portfolio snapshot.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="border-b border-border-subtle bg-surface">
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
            <Link href="/" className="text-[15px] font-semibold tracking-tight">
              Renewal Prioritisation
            </Link>
            <nav className="flex items-center gap-4 text-[13px] text-muted">
              <Link href="/" className="transition-colors hover:text-foreground">
                Portfolio
              </Link>
              <Link href="/method" className="transition-colors hover:text-foreground">
                How the score works
              </Link>
            </nav>
            <div className="ml-auto flex items-center gap-2 text-[12px] text-muted-2">
              {/*
                The snapshot date sits in the chrome on every page, deliberately.
                Every "days to renewal" in this app counts from here, not from
                today, so the numbers reproduce whenever anyone opens it.
              */}
              <span className="inline-block size-1.5 rounded-full bg-muted-2" aria-hidden />
              Portfolio snapshot &mdash; {SNAPSHOT_DATE}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-5 py-6">{children}</main>

        <footer className="border-t border-border-subtle px-5 py-4 text-[12px] text-muted-2">
          <div className="mx-auto max-w-[1400px]">
            Scores are a transparent rubric for ordering work, not a prediction. This dataset carries no
            historical renewal outcomes, so nothing here is a churn probability.
          </div>
        </footer>
      </body>
    </html>
  );
}
