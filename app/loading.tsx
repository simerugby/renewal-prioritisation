import { Skeleton } from '@/components/ui';

export default function Loading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading the renewal portfolio</span>
      <div>
        <Skeleton className="h-6 w-52" />
        <Skeleton className="mt-2 h-4 w-full max-w-3xl" />
      </div>
      <div className="grid grid-cols-2 gap-4 rounded-lg border border-border-subtle bg-surface px-4 py-3.5 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-6 w-20" />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border-subtle bg-surface">
        <div className="border-b border-border-subtle px-3 py-2.5">
          <Skeleton className="h-7 w-full" />
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="border-b border-border-subtle px-3 py-3 last:border-0">
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
