import { Spinner } from '@/components/ui/spinner'

// Skeleton nhẹ cho Finance — tránh flash khi JS chunk chưa load
export default function FinanceLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Tab bar */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {[80, 64, 72, 56, 88, 64, 56].map((w, i) => (
          <div key={i} className={`skeleton h-9 rounded-full shrink-0`} style={{ width: w }} />
        ))}
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2">
        <div className="skeleton h-8 w-24 rounded-lg" />
        <div className="skeleton h-8 flex-1 rounded-lg" />
        <div className="skeleton h-8 w-8 rounded-lg" />
      </div>

      {/* List items */}
      <div className="bg-card border border-border rounded-xl divide-y divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <div className="skeleton w-9 h-9 rounded-xl shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-3.5 rounded" style={{ width: `${40 + (i * 13) % 35}%` }} />
              <div className="skeleton h-2.5 w-20 rounded" />
            </div>
            <div className="skeleton h-4 w-20 rounded shrink-0" />
          </div>
        ))}
      </div>
    </div>
  )
}