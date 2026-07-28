import Link from 'next/link';
import { Suspense } from 'react';
import CsvDropzone from '@/components/CsvDropzone';

export const metadata = {
  title: 'Try your own export — Renewal Prioritisation',
  description: 'Run a different renewal book through the same parser, validator and scoring engine.',
};

export default function TryPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Try your own export</h1>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted">
          The README claims this works on a book it has never seen. This is where you check that rather
          than take my word for it. Drop in a renewal export and watch the same pipeline run: parse,
          validate, quarantine what it cannot trust, score what is left, and rank it.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-lg border border-border-subtle bg-surface p-4">
          <h2 className="text-[12px] font-semibold">What it will do well</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            Cope with a byte-order mark, Windows line endings, trailing commas, missing optional columns
            and a book of a completely different size. The value axis rescales to your ARR distribution
            rather than to a constant tuned for the supplied file.
          </p>
        </section>
        <section className="rounded-lg border border-border-subtle bg-surface p-4">
          <h2 className="text-[12px] font-semibold">What it will refuse to guess</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            An unrecognised value in a status column is excluded from scoring and reported by name, never
            quietly treated as healthy. A row with an unparseable date is quarantined and the rest still
            load. Missing required columns stop the whole file, loudly.
          </p>
        </section>
        <section className="rounded-lg border border-border-subtle bg-surface p-4">
          <h2 className="text-[12px] font-semibold">Where it will struggle</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            The keyword scanner over the notes column is written for one company&rsquo;s phrasing and scores
            7% once the wording changes. Expect the note tags to be thin on a book it has never seen —
            that gap is measured, and it is the reason the AI feature exists.
          </p>
        </section>
      </div>

      <Suspense fallback={<div className="skeleton h-40 rounded-lg" aria-hidden />}>
        <CsvDropzone />
      </Suspense>

      <p className="text-[12px] leading-relaxed text-muted-2">
        No file is uploaded and nothing is stored. Everything above runs in your browser, using the same
        modules the server does.{' '}
        <Link href="/" className="text-accent hover:underline">
          Back to the supplied portfolio
        </Link>
        .
      </p>
    </div>
  );
}
