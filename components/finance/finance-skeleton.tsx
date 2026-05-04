/** Skeleton shimmer cho trang Finance — dùng làm Suspense fallback */
export function FinanceSkeleton() {
  return (
    <div className="space-y-4 max-w-2xl mx-auto animate-pulse">

      {/* Tab bar */}
      <div className="flex gap-2 overflow-x-hidden">
        {[56, 48, 56, 48, 72, 56, 48].map((w, i) => (
          <div key={i} className="skeleton h-9 rounded-xl shrink-0" style={{ width: w }} />
        ))}
      </div>

      {/* Summary card */}
      <div className="bg-card border border-border rounded-xl p-4 flex gap-4">
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3 w-20 rounded" />
          <div className="skeleton h-6 w-32 rounded" />
        </div>
        <div className="skeleton w-px self-stretch" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3 w-16 rounded" />
          <div className="skeleton h-6 w-28 rounded" />
        </div>
      </div>

      {/* List items */}
      <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <div className="skeleton w-10 h-10 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-3 rounded" style={{ width: `${45 + (i % 3) * 15}%` }} />
              <div className="skeleton h-2.5 w-16 rounded" />
            </div>
            <div className="skeleton h-4 w-20 rounded shrink-0" />
          </div>
        ))}
      </div>

    </div>
  )
}
