import { cn } from '@/lib/utils/cn'

interface AvatarProps {
  src?: string | null
  name?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 'w-7 h-7 text-xs',
  md: 'w-9 h-9 text-sm',
  lg: 'w-12 h-12 text-base',
}

// Generate gradient background từ tên
function nameToGradient(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const h = Math.abs(hash) % 360
  return `hsl(${h}, 65%, 55%)`
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const sizeClass = sizes[size]

  if (src) {
    return (
      <img
        src={src}
        alt={name ?? 'Avatar'}
        className={cn('rounded-full object-cover', sizeClass, className)}
      />
    )
  }

  const initials = name ? getInitials(name) : '?'
  const bg = name ? nameToGradient(name) : 'hsl(var(--muted))'

  return (
    <div
      className={cn('rounded-full flex items-center justify-center font-semibold text-white select-none shrink-0', sizeClass, className)}
      style={{ backgroundColor: bg }}
      aria-label={name ?? 'Avatar'}
    >
      {initials}
    </div>
  )
}
