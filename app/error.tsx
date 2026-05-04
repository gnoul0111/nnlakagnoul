'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ErrorPageProps {
  error:  Error & { digest?: string }
  reset:  () => void
}

export default function RootError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('[Root Error]', error)
  }, [error])

  const router = useRouter()

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center gap-5">
      {/* Icon */}
      <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertTriangle className="w-10 h-10 text-destructive" />
      </div>

      {/* Message */}
      <div className="space-y-2 max-w-sm">
        <h1 className="text-xl font-bold text-foreground">Oops, có lỗi rồi!</h1>
        <p className="text-sm text-muted-foreground">
          Ứng dụng gặp sự cố không mong muốn. Vui lòng thử lại hoặc về trang chủ.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/60 font-mono">
            Mã lỗi: {error.digest}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => router.push('/')}
          leftIcon={<Home className="w-4 h-4" />}
        >
          Trang chủ
        </Button>
        <Button
          onClick={reset}
          leftIcon={<RefreshCw className="w-4 h-4" />}
        >
          Thử lại
        </Button>
      </div>
    </div>
  )
}
