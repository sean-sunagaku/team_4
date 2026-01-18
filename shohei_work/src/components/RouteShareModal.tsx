import { useMemo, useState } from 'react'
import './RouteShareModal.css'

interface RouteShareModalProps {
  isOpen: boolean
  onClose: () => void
  url: string
}

const RouteShareModal = ({ isOpen, onClose, url }: RouteShareModalProps) => {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')

  const qrImageUrl = useMemo(() => {
    // Lightweight QR without adding dependencies.
    // If this external QR service becomes unavailable, replace with a local QR lib.
    return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url)}`
  }, [url])

  const canShare = typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function'

  const handleCopy = async () => {
    setCopyStatus('idle')
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
      } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea')
        textarea.value = url
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      setCopyStatus('copied')
      window.setTimeout(() => setCopyStatus('idle'), 1200)
    } catch {
      setCopyStatus('error')
      window.setTimeout(() => setCopyStatus('idle'), 1500)
    }
  }

  const handleNativeShare = async () => {
    try {
      await (navigator as any).share({
        title: 'Google Maps ルート',
        text: 'このルートで案内を開始してください',
        url,
      })
    } catch {
      // user cancelled or unsupported target; ignore
    }
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  if (!isOpen) return null

  return (
    <div className="route-share-overlay" onClick={handleOverlayClick}>
      <div className="route-share-modal" role="dialog" aria-modal="true" aria-label="ルート共有">
        <div className="route-share-header">
          <h2 className="route-share-title">ルートを共有</h2>
          <button onClick={onClose} className="route-share-close" aria-label="閉じる">
            <span>×</span>
          </button>
        </div>

        <div className="route-share-body">
          <div className="route-share-qr">
            <img src={qrImageUrl} alt="ルート共有QRコード" />
            <p className="route-share-hint">スマホでQRを読み取って、Google Mapsアプリで「開始」してください</p>
          </div>

          <div className="route-share-link">
            <label className="route-share-label">共有リンク</label>
            <div className="route-share-link-row">
              <input className="route-share-input" value={url} readOnly />
              <button className="route-share-copy" onClick={handleCopy}>
                {copyStatus === 'copied' ? 'コピー済み' : copyStatus === 'error' ? '失敗' : 'コピー'}
              </button>
            </div>

            {canShare && (
              <button className="route-share-native" onClick={handleNativeShare}>
                共有（端末の共有メニュー）
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default RouteShareModal

