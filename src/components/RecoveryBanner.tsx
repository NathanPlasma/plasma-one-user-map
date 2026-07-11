import { AlertTriangle, RotateCcw, Save } from 'lucide-react'

type RecoveryBannerProps = {
  message: string
  canRetry: boolean
  onRetry: () => void
  onSaveCopy: () => void
}

export function RecoveryBanner({
  message,
  canRetry,
  onRetry,
  onSaveCopy,
}: RecoveryBannerProps) {
  return (
    <section className="recovery-banner" role="alert">
      <AlertTriangle size={18} aria-hidden="true" />
      <p>{message}</p>
      <div>
        {canRetry ? (
          <button type="button" className="button" onClick={onRetry}>
            <RotateCcw size={16} aria-hidden="true" />
            Retry
          </button>
        ) : null}
        <button type="button" className="button" onClick={onSaveCopy}>
          <Save size={16} aria-hidden="true" />
          Save copy
        </button>
      </div>
    </section>
  )
}
