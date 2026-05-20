'use client'

import { useAiSummary } from '@/hooks/useAiSummary'
import { cn } from '@/lib/utils/cn'

interface AiSummaryWidgetProps {
  monthKey:  string
  className?: string
}

export function AiSummaryWidget({ monthKey, className }: AiSummaryWidgetProps) {
  const {
    summaryStatus, summary, summaryError, generateSummary,
    ttsStatus, hasTts, speak, pauseSpeech, resumeSpeech, stopSpeech,
  } = useAiSummary(monthKey)

  const isLoading  = summaryStatus === 'loading'
  const hasSummary = summaryStatus === 'done' && !!summary

  return (
    <div className={cn('rounded-xl border border-border bg-card p-4 space-y-3', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">✨</span>
          <h3 className="text-sm font-semibold text-foreground">AI Phân tích</h3>
        </div>

        {/* Nút tạo / tạo lại */}
        {!isLoading && (
          <button
            onClick={generateSummary}
            className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            {hasSummary ? 'Tạo lại' : 'Tạo tóm tắt'}
          </button>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <SpinnerIcon />
          <span>AI đang phân tích tháng của bạn...</span>
        </div>
      )}

      {/* Error state */}
      {summaryStatus === 'error' && summaryError && (
        <p className="text-xs text-destructive">{summaryError}</p>
      )}

      {/* Idle — CTA */}
      {summaryStatus === 'idle' && (
        <button
          onClick={generateSummary}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <MicIcon />
          <span>Nghe AI tóm tắt tháng này</span>
        </button>
      )}

      {/* Summary text */}
      {hasSummary && summary && (
        <p className="text-sm text-foreground leading-relaxed">{summary}</p>
      )}

      {/* TTS player — chỉ hiện khi có summary và browser hỗ trợ */}
      {hasSummary && hasTts && summary && (
        <div className="flex items-center gap-2 pt-1 border-t border-border">
          <span className="text-xs text-muted-foreground mr-auto">
            {ttsStatus === 'speaking' ? 'Đang đọc...' : ttsStatus === 'paused' ? 'Đã dừng' : 'Nghe AI đọc'}
          </span>

          {/* Play / Pause */}
          {ttsStatus === 'speaking' ? (
            <TtsButton onClick={pauseSpeech} label="Dừng" title="Tạm dừng">
              <PauseIcon />
            </TtsButton>
          ) : ttsStatus === 'paused' ? (
            <TtsButton onClick={resumeSpeech} label="Tiếp tục" title="Tiếp tục đọc">
              <PlayIcon />
            </TtsButton>
          ) : (
            <TtsButton onClick={() => speak(summary)} label="Đọc" title="Nghe tóm tắt">
              <PlayIcon />
            </TtsButton>
          )}

          {/* Stop — chỉ hiện khi đang nói hoặc paused */}
          {ttsStatus !== 'idle' && (
            <TtsButton onClick={stopSpeech} label="Dừng hẳn" title="Dừng hẳn">
              <StopIcon />
            </TtsButton>
          )}

          {/* Đọc lại từ đầu */}
          {ttsStatus === 'idle' && summaryStatus === 'done' && (
            <TtsButton onClick={() => speak(summary)} label="Nghe lại" title="Nghe lại">
              <ReplayIcon />
            </TtsButton>
          )}
        </div>
      )}

      {/* Fallback nếu browser không hỗ trợ TTS */}
      {hasSummary && !hasTts && (
        <p className="text-xs text-muted-foreground border-t border-border pt-2">
          Browser không hỗ trợ đọc to. Hãy dùng Chrome hoặc Edge để nghe AI đọc.
        </p>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TtsButton({ onClick, label, title, children }: {
  onClick: () => void
  label: string
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={label}
      className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
    >
      {children}
    </button>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function MicIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 6h12v12H6z" />
    </svg>
  )
}

function ReplayIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  )
}

function SpinnerIcon() {
  return (
    <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
