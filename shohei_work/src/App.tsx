import { useState } from 'react'
import { GoogleMap, LoadScript, DirectionsRenderer, Marker } from '@react-google-maps/api'
import AIChatButton from './components/AIChatButton'
import NavigationPanel from './components/NavigationPanel'
import DrivingSupportPanel from './components/DrivingSupportPanel'
import NavigationStartModal, { NavigationFormData } from './components/NavigationStartModal'
import { useNavigation } from './hooks/useNavigation'
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
  const {
    currentLocation,
    directions,
    routeInfo,
    clearRoute,
    calculateRoute,
  } = useNavigation()

  const handleStopNavigation = () => {
    setIsNavigating(false)
    clearRoute()
  }

  const handleAIChatClick = () => {
    // TODO: AIチャット機能を実装
    console.log('AIと話すボタンがクリックされました')
    alert('AIチャット機能は今後実装予定です')
  }

  const handleOpenNavigationModal = () => {
    setIsModalOpen(true)
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
        const suggestion = result.data
        // レスポンスを表示
        alert(
          `ルート提案:\n\n` +
          `目的地: ${suggestion.destination?.name || '不明'}\n` +
          `住所: ${suggestion.destination?.address || '不明'}\n\n` +
          `ステップ:\n${suggestion.steps?.join('\n') || 'なし'}\n\n` +
          `注意事項:\n${suggestion.notes?.join('\n') || 'なし'}\n\n` +
          `Google Maps URL:\n${suggestion.googleMapsUrl || '不明'}`
        )

        // Google Maps URLがあれば開く
        if (suggestion.googleMapsUrl) {
          window.open(suggestion.googleMapsUrl, '_blank')
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
      <div className="app-container">
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

        <DrivingSupportPanel
          onStartNavigation={handleOpenNavigationModal}
          isNavigating={isNavigating}
        />

        <NavigationStartModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onStartNavigation={handleNavigationFormSubmit}
        />
        {!isNavigating ? (
          <AIChatButton onClick={handleAIChatClick} />
        ) : (
          <NavigationPanel
            routeInfo={routeInfo}
            onStopNavigation={handleStopNavigation}
          />
        )}
      </div>
    </LoadScript>
  )
}

export default App
