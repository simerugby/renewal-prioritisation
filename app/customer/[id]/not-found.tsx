import Link from 'next/link';
import { EmptyState } from '@/components/ui';

export default function NotFound() {
  return (
    <EmptyState
      title="No such account"
      hint="That customer id is not in this portfolio snapshot. It may have been renamed, or the link may be stale."
      action={
        <Link href="/" className="mt-1 rounded border border-border-subtle px-2.5 py-1 text-[12px] hover:border-border-strong">
          Back to the portfolio
        </Link>
      }
    />
  );
}
