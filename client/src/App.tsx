import { useEffect, useState } from 'react'
import { GoogleMap, LoadScript, DirectionsRenderer, Marker } from '@react-google-maps/api'
import AIChatButton from './components/AIChatButton'
import DrivingSupportPanel from './components/DrivingSupportPanel'
import NavigationStartModal, { NavigationFormData } from './components/NavigationStartModal'
import { useNavigation } from './hooks/useNavigation'
import { QRCodeCanvas } from 'qrcode.react'
import './App.css'

const naviIcon = new URL('./icon/navi_icon.png', import.meta.url).href

const GOOGLE_MAPS_API_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || ''
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3001'

const defaultCenter = {
  lat: 35.6762,
  lng: 139.6503,
}

const mapContainerStyle = {
  width: '100%',
  height: '100%',
}

const defaultOptions = {
  zoomControl: false,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: false,
  disableDefaultUI: true,
  styles: [
    {
      featureType: 'poi',
      elementType: 'labels',
      stylers: [{ visibility: 'off' }]
    },
    {
      featureType: 'transit',
      elementType: 'labels',
      stylers: [{ visibility: 'off' }]
    },
    {
      featureType: 'road',
      elementType: 'geometry',
      stylers: [
        { color: '#2d2d2d' },
        { weight: 1 }
      ]
    },
    {
      featureType: 'road.highway',
      elementType: 'geometry',
      stylers: [
        { color: '#3d3d3d' },
        { weight: 2 }
      ]
    },
    {
      featureType: 'water',
      elementType: 'geometry',
      stylers: [{ color: '#1a1a2e' }]
    },
    {
      featureType: 'landscape',
      elementType: 'geometry',
      stylers: [{ color: '#2d2d2d' }]
    },
    {
      featureType: 'all',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#ffffff' }]
    },
    {
      featureType: 'all',
      elementType: 'labels.text.stroke',
      stylers: [{ color: '#000000' }]
    }
  ],
  tilt: 45,
  heading: 0,
}

function App() {
  const [isNavigating, setIsNavigating] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  // Google Maps ナビゲーション用URL（ポップアップで開く）
  const [googleMapsNavUrl, setGoogleMapsNavUrl] = useState<string | null>(null)
  // QRコード表示用URL（入力で差し替え可能）
  const [qrUrl, setQrUrl] = useState('')
  const [missionSteps, setMissionSteps] = useState<string[]>([])
  const {
    currentLocation,
    directions,
  } = useNavigation()

  useEffect(() => {
    if (googleMapsNavUrl) setQrUrl(googleMapsNavUrl)
  }, [googleMapsNavUrl])

  const handleOpenNavigationModal = () => {
    setIsModalOpen(true)
  }

  // Google Mapsをポップアップで開く
  const openGoogleMapsPopup = () => {
    if (googleMapsNavUrl) {
      // 画面全体に大きく被せる（上からフルサイズ寄せ）
      const screenWidth = window.screen.width
      const screenHeight = window.screen.height
      const windowWidth = Math.floor(screenWidth * 0.7)
      const windowHeight = screenHeight
      const left = Math.max(0, screenWidth - windowWidth)
      const top = 0

      const popup = window.open(
        googleMapsNavUrl,
        'googleMapsNav',
        [
          `width=${windowWidth}`,
          `height=${windowHeight}`,
          `left=${left}`,
          `top=${top}`,
          // ブラウザによっては指定が無視されるが、可能な範囲で「被せる」方向に寄せる
          'resizable=yes',
          'scrollbars=yes',
          'toolbar=yes',
          'location=yes',
          'menubar=no',
          'status=no',
        ].join(',')
      )

      // ポップアップブロック時は同一タブで開く
      if (!popup) {
        window.location.assign(googleMapsNavUrl)
        return
      }

      popup.focus()
    }
  }

  const handleNavigationFormSubmit = async (formData: NavigationFormData) => {
    setIsModalOpen(false)

    try {
      // /api/route/suggest APIを呼び出し
      const response = await fetch(`${API_BASE_URL}/api/route/suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          origin: formData.departure,
          practiceType: formData.practiceType,
          constraints: {
            avoidHighways: true,
            avoidTolls: true,
          },
        }),
      })

      const result = await response.json()
      console.log('API Response:', result)

      if (result.success) {
        // AI さんに向けて、ここでデータを受け取っています。
        const suggestion = result.data

        // ミッションステップを設定
        if (suggestion.steps && Array.isArray(suggestion.steps)) {
          setMissionSteps(suggestion.steps)
        }

        // Google Maps ナビゲーションURLを設定
        if (suggestion.googleMapsNavUrl) {
          setGoogleMapsNavUrl(suggestion.googleMapsNavUrl)
        }

        setIsNavigating(true)
      } else {
        alert(`エラー: ${result.error}`)
      }
    } catch (error) {
      console.error('API呼び出しエラー:', error)
      alert('ルート提案の取得に失敗しました。サーバーが起動しているか確認してください。')
    }
  }

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="error-message">
        <h1>⚠️ Google Maps API キーが設定されていません</h1>
        <div className="error-instructions">
          <p>以下の手順でAPIキーを設定してください：</p>
          <ol>
            <li>プロジェクトフォルダに <code>.env</code> ファイルを作成</li>
            <li>以下の内容を書き込んで保存：</li>
            <li><code>VITE_GOOGLE_MAPS_API_KEY=あなたのAPIキー</code></li>
            <li>開発サーバーを再起動（ターミナルで Ctrl+C で停止後、<code>npm run dev</code> を再実行）</li>
          </ol>
          <p className="error-note">
            📖 詳細な手順は「セットアップ手順.md」ファイルを参照してください
          </p>
        </div>
      </div>
    )
  }

  return (
    <LoadScript googleMapsApiKey={GOOGLE_MAPS_API_KEY} libraries={['places']}>
      <div className={`app-container grid-layout ${isNavigating && googleMapsNavUrl ? 'navigating-mode' : ''}`}>
        {/* 左: ミッションリストと運転サポート（縦並び）- ナビゲーション中は非表示 */}
        {!isNavigating && (
          <div className="left-panel w-full">
            {missionSteps.length > 0 && (
              <div className="mission-list-panel">
                <h2 className="mission-list-title">ミッションリスト</h2>
                <ul className="mission-list">
                  {missionSteps.map((step, index) => (
                    <li key={index} className="mission-item">
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <DrivingSupportPanel
              onStartNavigation={handleOpenNavigationModal}
              isNavigating={isNavigating}
            />
          </div>
        )}

        {/* ナビゲーション中: 左カラム - ミッションリストと運転サポート */}
        {isNavigating && (
          <div className="left-panel w-full">
            {missionSteps.length > 0 && (
              <div className="mission-list-panel">
                <h2 className="mission-list-title">ミッションリスト</h2>
                <ul className="mission-list">
                  {missionSteps.map((step, index) => (
                    <li key={index} className="mission-item">
                      {step}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="ai-consult-card">
              <div className="ai-consult-title">AIに相談（音声）</div>
              <div className="ai-consult-subtitle">
                運転中の疑問を話しかけてください
              </div>
              <div className="ai-consult-action">
                <AIChatButton autoStart={isNavigating} placement="inline" alwaysListen={true} />
              </div>
            </div>

            <DrivingSupportPanel
              onStartNavigation={handleOpenNavigationModal}
              isNavigating={isNavigating}
            />
          </div>
        )}

        {/* 中央: 地図（ナビゲーション中は非表示） */}
        {!isNavigating && (
          <div className="center-panel" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1 }}>
              <GoogleMap
              mapContainerStyle={mapContainerStyle}
              center={currentLocation || defaultCenter}
              zoom={currentLocation ? 18 : 10}
              options={defaultOptions}
              tilt={45}
            >
              {currentLocation && typeof google !== 'undefined' && (
                <Marker
                  position={currentLocation}
                  icon={{
                    url: naviIcon,
                    scaledSize: new google.maps.Size(48, 48),
                    anchor: new google.maps.Point(24, 24),
                  }}
                />
              )}
              {directions && <DirectionsRenderer directions={directions} />}
            </GoogleMap>
            </div>
          </div>
        )}

        {/* 右: Google Maps ナビ開始ボタン（ナビゲーション中のみ表示） */}
        {isNavigating && googleMapsNavUrl && (
          <div className="map-nav-button-container">
            <button
              className="google-maps-nav-button"
              onClick={openGoogleMapsPopup}
            >
              🗺️ Google Mapsで案内開始
            </button>

            <div className="qr-section">
              <div className="qr-section-title">QRコード（URL読み込み）</div>
              <input
                className="qr-url-input"
                type="url"
                inputMode="url"
                value={qrUrl}
                onChange={(e) => setQrUrl(e.target.value)}
                placeholder="https://..."
              />
              {qrUrl.trim() && (
                <div className="qr-code-and-link">
                  <div className="qr-code-wrapper">
                    <QRCodeCanvas value={qrUrl.trim()} size={220} includeMargin />
                  </div>
                  <a
                    className="qr-open-link"
                    href={qrUrl.trim()}
                    target="_blank"
                    rel="noreferrer"
                  >
                    このURLを開く
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        <NavigationStartModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onStartNavigation={handleNavigationFormSubmit}
        />
      </div>
      {!isNavigating && <AIChatButton alwaysListen={true} />}
    </LoadScript>
  )
}

export default App
