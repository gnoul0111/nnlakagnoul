// Skeleton cho Calendar — hiển thị trong khi JS chunk load
export default function CalendarLoading() {
  return (
    <div className="flex flex-col h-full gap-3 animate-pulse">
      {/* Header toolbar */}
      <div className="flex items-center justify-between">
        <div className="skeleton h-8 w-28 rounded-lg" />
        <div className="flex gap-2">
          <div className="skeleton h-8 w-8 rounded-lg" />
          <div className="skeleton h-8 w-8 rounded-lg" />
        </div>
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          <div className="skeleton h-7 w-14 rounded-md" />
          <div className="skeleton h-7 w-14 rounded-md" />
          <div className="skeleton h-7 w-14 rounded-md" />
        </div>
      </div>

      {/* Summary bar */}
      <div className="bg-card border border-border rounded-xl p-3 flex gap-4">
        <div className="skeleton h-4 w-24 rounded" />
        <div className="skeleton h-4 w-24 rounded" />
        <div className="skeleton h-4 w-20 rounded" />
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-px">
        {['T2','T3','T4','T5','T6','T7','CN'].map(d => (
          <div key={d} className="skeleton h-6 w-full rounded" />
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px flex-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-lg min-h-[56px] p-1 space-y-1">
            <div className="skeleton h-5 w-5 rounded-full" />
            {i % 5 === 0 && <div className="skeleton h-2.5 w-full rounded" />}
            {i % 7 === 3 && <div className="skeleton h-2.5 w-3/4 rounded" />}
          </div>
        ))}
      </div>
    </div>
  )
}