'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, RefreshCw, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ErrorPageProps {
  error:  Error & { digest?: string }
  reset:  () => void
}

export default function AppError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('[App Error]', error)
  }, [error])

  const router = useRouter()

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-5">
      {/* Icon */}
      <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <AlertTriangle className="w-8 h-8 text-destructive" />
      </div>

      {/* Message */}
      <div className="space-y-1.5 max-w-xs">
        <h2 className="text-base font-semibold text-foreground">Trang này gặp lỗi</h2>
        <p className="text-sm text-muted-foreground">
          {error.message || 'Đã xảy ra lỗi không mong muốn. Thử lại hoặc quay về trang trước.'}
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.back()}
          leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
        >
          Quay lại
        </Button>
        <Button
          size="sm"
          onClick={reset}
          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
        >
          Thử lại
        </Button>
      </div>
    </div>
  )
}
