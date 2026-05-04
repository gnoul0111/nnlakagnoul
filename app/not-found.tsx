import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center gap-5">
      {/* Large 404 */}
      <p className="text-8xl font-black text-primary/15 select-none leading-none">404</p>

      {/* Message */}
      <div className="space-y-2 max-w-sm -mt-2">
        <h2 className="text-xl font-bold text-foreground">Không tìm thấy trang</h2>
        <p className="text-sm text-muted-foreground">
          Trang bạn đang tìm không tồn tại hoặc đã bị xóa.
        </p>
      </div>

      {/* Home link */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
      >
        Về trang chủ
      </Link>
    </div>
  )
}
