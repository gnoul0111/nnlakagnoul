'use client'

import { Modal } from './modal'
import { cn } from '@/lib/utils/cn'

export interface CascadeChoice {
  label: string
  description?: string
  variant: 'danger' | 'warning' | 'default'
  value: string
}

interface CascadeModalProps {
  open: boolean
  onClose: () => void
  onChoose: (value: string) => void
  title: string
  description?: string
  choices: CascadeChoice[]
  loading?: boolean
}

const choiceStyles: Record<CascadeChoice['variant'], string> = {
  danger:  'border-destructive/40 text-destructive hover:bg-destructive/5',
  warning: 'border-warning/40 text-warning hover:bg-warning/5',
  default: 'border-border text-foreground hover:bg-muted',
}

export function CascadeModal({
  open, onClose, onChoose, title, description, choices, loading,
}: CascadeModalProps) {
  return (
    <Modal open={open} onClose={onClose} variant="center">
      <div className="p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
          )}
        </div>

        <div className="space-y-2">
          {choices.map(choice => (
            <button
              key={choice.value}
              onClick={() => onChoose(choice.value)}
              disabled={loading}
              className={cn(
                'w-full text-left px-4 py-3 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50',
                choiceStyles[choice.variant],
              )}
            >
              <p>{choice.label}</p>
              {choice.description && (
                <p className="mt-0.5 text-xs opacity-70 font-normal">{choice.description}</p>
              )}
            </button>
          ))}

          <button
            onClick={onClose}
            disabled={loading}
            className="w-full text-center px-4 py-2.5 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
          >
            Hủy
          </button>
        </div>
      </div>
    </Modal>
  )
}
