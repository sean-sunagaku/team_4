import { QRCodeCanvas } from 'qrcode.react'

type NavigationActionPanelProps = {
  googleMapsNavUrl: string
  qrUrl: string
  onQrUrlChange: (value: string) => void
  onOpenGoogleMaps: () => void
}

const NavigationActionPanel = ({
  googleMapsNavUrl,
  qrUrl,
  onQrUrlChange,
  onOpenGoogleMaps,
}: NavigationActionPanelProps) => {
  return (
    <div className="map-nav-button-container">
      <button className="google-maps-nav-button" onClick={onOpenGoogleMaps}>
        🗺️ Google Mapsで案内開始
      </button>

      <div className="qr-section">
        <div className="qr-section-title">QRコード（URL読み込み）</div>
        <input
          className="qr-url-input"
          type="url"
          inputMode="url"
          value={qrUrl}
          onChange={(e) => onQrUrlChange(e.target.value)}
          placeholder="https://..."
        />
        {qrUrl.trim() && (
          <div className="qr-code-and-link">
            <div className="qr-code-wrapper">
              <QRCodeCanvas value={qrUrl.trim()} size={220} includeMargin />
            </div>
            <a className="qr-open-link" href={qrUrl.trim()} target="_blank" rel="noreferrer">
              このURLを開く
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

export default NavigationActionPanel
