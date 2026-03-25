export default function DashboardLoading() {
  return (
    <div className="p-8 space-y-6 animate-pulse">
      {/* Header */}
      <div className="space-y-2">
        <div className="h-7 w-40 bg-slate-800 rounded-lg" />
        <div className="h-4 w-72 bg-slate-800/60 rounded" />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-28 bg-slate-800/50 rounded-xl border border-slate-800 border-t-2 border-t-slate-700" />
        ))}
      </div>

      {/* Two column section */}
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="h-5 w-24 bg-slate-800 rounded" />
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-14 bg-slate-800/50 rounded-lg border border-slate-800" />
          ))}
        </div>
        <div className="space-y-3">
          <div className="h-5 w-32 bg-slate-800 rounded" />
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-10 bg-slate-800/50 rounded-lg border border-slate-800" />
          ))}
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-800 p-5 space-y-3">
        <div className="h-4 w-40 bg-slate-700 rounded" />
        <div className="h-4 w-full bg-slate-800 rounded-full" />
        <div className="flex gap-4">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-3 w-20 bg-slate-800 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
