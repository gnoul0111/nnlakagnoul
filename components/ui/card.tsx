import { cn } from '@/lib/utils/cn'

interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
  as?: 'div' | 'button' | 'article'
}

export function Card({ children, className, onClick, as: Tag = 'div' }: CardProps) {
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'bg-card border border-border rounded-xl',
        onClick && 'cursor-pointer hover:border-ring/50 transition-colors active:scale-[0.99]',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-4 pt-4 pb-2 flex items-center justify-between', className)}>{children}</div>
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn('text-sm font-semibold text-muted-foreground uppercase tracking-wide', className)}>{children}</h3>
}

export function CardBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-4 pb-4', className)}>{children}</div>
}
