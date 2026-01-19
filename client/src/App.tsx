import { useEffect, useState } from 'react'
import { LoadScript } from '@react-google-maps/api'
import AIChatButton from './components/aiChat/AIChatButton'
import LeftPanel from './components/LeftPanel'
import MapPanel from './components/MapPanel'
import NavigationActionPanel from './components/NavigationActionPanel'
import NavigationStartModal, { NavigationFormData } from './components/NavigationStartModal'
import { useNavigation } from './hooks/useNavigation'
import './App.css'

const GOOGLE_MAPS_API_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || ''
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3001'

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
        <LeftPanel
          isNavigating={isNavigating}
          missionSteps={missionSteps}
          onStartNavigation={handleOpenNavigationModal}
        />

        {/* 中央: 地図（ナビゲーション中は非表示） */}
        {!isNavigating && (
          <MapPanel currentLocation={currentLocation} directions={directions} />
        )}

        {/* 右: Google Maps ナビ開始ボタン（ナビゲーション中のみ表示） */}
        {isNavigating && googleMapsNavUrl && (
          <NavigationActionPanel
            googleMapsNavUrl={googleMapsNavUrl}
            qrUrl={qrUrl}
            onQrUrlChange={setQrUrl}
            onOpenGoogleMaps={openGoogleMapsPopup}
          />
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
