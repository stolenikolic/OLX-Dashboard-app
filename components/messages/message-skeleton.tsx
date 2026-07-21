export function DateSeparator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <div className="h-px flex-1 bg-zinc-200" />
      <span className="text-xs font-medium text-zinc-400" suppressHydrationWarning>
        {label}
      </span>
      <div className="h-px flex-1 bg-zinc-200" />
    </div>
  );
}

export function MessageSkeleton() {
  return (
    <div className="space-y-3 p-4 animate-pulse">
      <div className="ml-auto h-10 w-2/3 rounded-2xl bg-teal-100" />
      <div className="h-10 w-1/2 rounded-2xl bg-zinc-100" />
      <div className="ml-auto h-16 w-3/4 rounded-2xl bg-teal-100" />
      <div className="h-8 w-2/5 rounded-2xl bg-zinc-100" />
    </div>
  );
}

export function ConversationListSkeleton() {
  return (
    <div className="divide-y divide-zinc-100 animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex gap-3 p-3">
          <div className="h-12 w-12 rounded-lg bg-zinc-100" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-3 w-1/3 rounded bg-zinc-100" />
            <div className="h-3 w-2/3 rounded bg-zinc-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
