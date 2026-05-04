/** Skeleton shimmer cho trang Analytics — thay Spinner khi isLoading */
export function AnalyticsSkeleton() {
  return (
    <div className="space-y-4 max-w-2xl mx-auto animate-pulse">

      {/* Period selector */}
      <div className="space-y-3">
        <div className="flex bg-muted rounded-xl p-1 gap-1">
          <div className="skeleton flex-1 h-9 rounded-lg" />
          <div className="skeleton flex-1 h-9 rounded-lg" />
          <div className="skeleton flex-1 h-9 rounded-lg" />
        </div>
        <div className="flex items-center justify-between px-1">
          <div className="skeleton w-8 h-8 rounded-lg" />
          <div className="skeleton h-5 w-32 rounded-lg" />
          <div className="skeleton w-8 h-8 rounded-lg" />
        </div>
      </div>

      {/* Stats cards 2×2 */}
      <div className="grid grid-cols-2 gap-3">
        {([72, 80, 56, 64] as const).map((w, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-2.5">
            <div className={`skeleton h-3 w-${w === 72 ? 20 : w === 80 ? 24 : w === 56 ? 16 : 20} rounded`} />
            <div className="skeleton h-7 w-28 rounded" />
          </div>
        ))}
      </div>

      {/* Donut chart */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="skeleton h-3.5 w-32 rounded mb-4" />
        <div className="flex gap-6 items-center">
          <div className="skeleton w-28 h-28 rounded-full shrink-0" />
          <div className="flex-1 space-y-2.5">
            {[55, 40, 65, 35].map((w, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="skeleton w-3 h-3 rounded-full shrink-0" />
                <div className="skeleton h-3 rounded flex-1" style={{ maxWidth: `${w}%` }} />
                <div className="skeleton h-3 w-12 rounded shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bar chart */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="skeleton h-3.5 w-40 rounded mb-4" />
        <div className="flex items-end gap-1.5 h-28 pb-1">
          {[40, 65, 30, 80, 55, 70, 45].map((h, i) => (
            <div key={i} className="flex-1 flex flex-col gap-1 items-center">
              <div className="skeleton w-full rounded-t-sm" style={{ height: `${h}%` }} />
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2">
          {['T2','T3','T4','T5','T6','T7','CN'].map(d => (
            <div key={d} className="skeleton h-2.5 w-4 rounded" />
          ))}
        </div>
      </div>

      {/* Line chart */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="skeleton h-3.5 w-36 rounded mb-4" />
        <div className="skeleton w-full h-24 rounded-lg" />
      </div>

      {/* Top expenses */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="skeleton h-3.5 w-28 rounded" />
        {[32, 40, 28].map((w, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton w-9 h-9 rounded-xl shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-3 rounded" style={{ width: `${w + 20}%` }} />
              <div className="skeleton h-2.5 w-16 rounded" />
            </div>
            <div className="skeleton h-3.5 w-20 rounded shrink-0" />
          </div>
        ))}
      </div>

      {/* Compare card */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="skeleton h-3.5 w-40 rounded" />
        <div className="flex gap-4">
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-3 w-16 rounded" />
            <div className="skeleton h-6 w-24 rounded" />
          </div>
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-3 w-16 rounded" />
            <div className="skeleton h-6 w-24 rounded" />
          </div>
        </div>
      </div>

    </div>
  )
}
