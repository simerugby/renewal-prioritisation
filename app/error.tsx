'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/ui';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorState
      title="Something went wrong loading this view"
      detail={
        error.message ||
        'An unexpected error occurred. If it persists, check that data/renewal_customers.csv is present and well formed.'
      }
      retry={
        <button
          onClick={reset}
          className="rounded border border-border-subtle bg-surface px-3 py-1.5 text-[12px] hover:border-border-strong"
        >
          Try again
        </button>
      }
    />
  );
}
