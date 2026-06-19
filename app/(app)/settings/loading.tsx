// Skeleton cho Settings
export default function SettingsLoading() {
  return (
    <div className="flex flex-col h-full animate-pulse overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-border shrink-0">
        {[72, 88, 64].map((w, i) => (
          <div key={i} className="px-4 py-3">
            <div className="skeleton h-4 rounded" style={{ width: w }} />
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Avatar section */}
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="skeleton w-20 h-20 rounded-full" />
          <div className="skeleton h-4 w-28 rounded" />
          <div className="skeleton h-3 w-40 rounded" />
        </div>

        {/* Form fields */}
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="skeleton h-3 w-20 rounded" />
            <div className="skeleton h-10 w-full rounded-lg" />
          </div>
        ))}

        <div className="skeleton h-10 w-full rounded-lg mt-2" />
      </div>
    </div>
  )
}