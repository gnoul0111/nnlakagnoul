export function DashboardSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Month picker */}
      <div className="flex items-center justify-between">
        <div className="skeleton h-5 w-32 rounded-lg" />
        <div className="skeleton h-8 w-36 rounded-lg" />
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex justify-between">
              <div className="skeleton h-3 w-16 rounded" />
              <div className="skeleton h-8 w-8 rounded-lg" />
            </div>
            <div className="skeleton h-7 w-28 rounded" />
          </div>
        ))}
      </div>

      {/* Budget */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex justify-between">
          <div className="skeleton h-3 w-24 rounded" />
          <div className="skeleton h-5 w-16 rounded-full" />
        </div>
        <div className="skeleton h-2 w-full rounded-full" />
        <div className="flex justify-between">
          <div className="skeleton h-3 w-32 rounded" />
          <div className="skeleton h-4 w-8 rounded" />
        </div>
      </div>

      {/* Savings */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="skeleton h-3 w-28 rounded" />
        <div className="skeleton h-2 w-full rounded-full" />
        <div className="skeleton h-3 w-24 rounded" />
      </div>

      {/* Recent expenses */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="skeleton h-3 w-28 rounded" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton w-9 h-9 rounded-xl" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-3 w-32 rounded" />
              <div className="skeleton h-2.5 w-20 rounded" />
            </div>
            <div className="skeleton h-4 w-20 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
