export default function DashboardLoading() {
  return (
    <div className="p-8 space-y-6 animate-pulse">
      {/* Header */}
      <div className="space-y-2">
        <div className="h-7 w-40 bg-[var(--bg-muted)] rounded-lg" />
        <div className="h-4 w-72 bg-[var(--bg-muted)]/60 rounded" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-28 bg-[var(--bg-muted)]/50 rounded-xl border border-[var(--border)] border-t-2 border-t-[var(--border-strong)]" />
        ))}
      </div>

      {/* Two column section */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="h-5 w-24 bg-[var(--bg-muted)] rounded" />
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-14 bg-[var(--bg-muted)]/50 rounded-lg border border-[var(--border)]" />
          ))}
        </div>
        <div className="space-y-3">
          <div className="h-5 w-32 bg-[var(--bg-muted)] rounded" />
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-10 bg-[var(--bg-muted)]/50 rounded-lg border border-[var(--border)]" />
          ))}
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-[var(--bg-muted)]/50 rounded-xl border border-[var(--border)] p-5 space-y-3">
        <div className="h-4 w-40 bg-[var(--border-strong)] rounded" />
        <div className="h-4 w-full bg-[var(--bg-muted)] rounded-full" />
        <div className="flex gap-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-3 w-20 bg-[var(--bg-muted)] rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
