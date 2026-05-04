import { cn } from '@/lib/utils/cn'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizes = {
  sm:  'w-4 h-4 border-2',
  md:  'w-6 h-6 border-2',
  lg:  'w-8 h-8 border-[3px]',
  xl:  'w-12 h-12 border-4',
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Đang tải..."
      className={cn(
        'rounded-full border-primary border-t-transparent animate-spin',
        sizes[size],
        className,
      )}
    />
  )
}

/** Full-page loading overlay */
export function PageSpinner() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-background">
      <Spinner size="lg" />
      <p className="text-sm text-muted-foreground">Đang tải...</p>
    </div>
  )
}
