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
    <div className={cn(
      'rounded-xl overflow-hidden',
      hasSummary || isLoading || summaryStatus === 'error'
        ? 'border border-border bg-card p-4 space-y-3'
        : 'bg-brand-gradient p-[1px]',
      className,
    )}>
      {/* Idle — gradient banner CTA */}
      {summaryStatus === 'idle' && (
        <div className="rounded-[10px] bg-[hsl(263_70%_10%/0.85)] dark:bg-[hsl(240_25%_9%/0.9)] p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">✨</span>
              <h3 className="text-sm font-semibold text-white">AI Phân tích</h3>
            </div>
            <p className="text-xs text-white/70 leading-relaxed">AI sẽ phân tích thói quen chi tiêu và đưa ra gợi ý giúp bạn quản lý tài chính tốt hơn.</p>
          </div>
          <button
            onClick={() => generateSummary()}
            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-medium transition-colors whitespace-nowrap"
          >
            <span>Bắt đầu phân tích →</span>
          </button>
        </div>
      )}

      {/* Header — khi đã có summary hoặc đang load */}
      {(hasSummary || isLoading || summaryStatus === 'error') && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">✨</span>
            <h3 className="text-sm font-semibold text-foreground">AI Phân tích</h3>
          </div>
          {!isLoading && (
            <button
              onClick={() => generateSummary(hasSummary)}
              className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              {hasSummary ? 'Tạo lại' : 'Tạo tóm tắt'}
            </button>
          )}
        </div>
      )}

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

      {/* Summary text */}
      {hasSummary && summary && (
        <p className="text-sm text-foreground leading-relaxed">{summary}</p>
      )}

      {/* TTS player — chỉ hiện khi có summary */}
      {hasSummary && hasTts && summary && (
        <div className="flex items-center gap-2 pt-1 border-t border-border">
          <span className="text-xs text-muted-foreground mr-auto">
            {ttsStatus === 'loading'  ? 'Đang tải giọng đọc...'
              : ttsStatus === 'speaking' ? 'Đang đọc...'
              : ttsStatus === 'paused'   ? 'Đã dừng'
              : 'Nghe AI đọc'}
          </span>

          {ttsStatus === 'loading' ? (
            // Đang tải audio — hiện spinner, khóa nút để chống bấm lại (chống đọc chồng)
            <span className="flex items-center justify-center w-8 h-8 text-muted-foreground">
              <SpinnerIcon />
            </span>
          ) : ttsStatus === 'speaking' ? (
            <TtsButton onClick={pauseSpeech} label="Tạm dừng" title="Tạm dừng">
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

          {/* Stop — chỉ khi đang đọc hoặc tạm dừng */}
          {(ttsStatus === 'speaking' || ttsStatus === 'paused') && (
            <TtsButton onClick={stopSpeech} label="Dừng hẳn" title="Dừng hẳn">
              <StopIcon />
            </TtsButton>
          )}
        </div>
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

function SpinnerIcon() {
  return (
    <svg className="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
