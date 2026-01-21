import { useState, useCallback } from 'react'
import { LoadScript } from '@react-google-maps/api'
import AIChatButton, { VideoModalData } from './components/aiChat/AIChatButton'
import MainPanel from './components/MainPanel'
import MissionListPanel from './components/MissionListPanel'
import MapPanel from './components/MapPanel'
import LoadingScreen, { LoadingStep } from './components/LoadingScreen'
import PracticeTypeSelector, { PracticeType } from './components/PracticeTypeSelector'
import YouTubeVideoModal from './components/YouTubeVideoModal'
import MissionCompleteModal from './components/MissionCompleteModal'
import { useNavigation } from './hooks/useNavigation'
import './App.css'

const GOOGLE_MAPS_API_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || ''
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3001'

type AppScreen = 'home' | 'practice-select' | 'navigating'

function App() {
  const [screen, setScreen] = useState<AppScreen>('home')
  const [loadingStep, setLoadingStep] = useState<LoadingStep | null>(null)
  const [showPracticeSelector, setShowPracticeSelector] = useState(false)
  const [missionSteps, setMissionSteps] = useState<string[]>([])
  const [, setGoogleMapsNavUrl] = useState<string | null>(null)
  const [currentLocation, setCurrentLocation] = useState<string>('')
  const [videoModal, setVideoModal] = useState<{ isOpen: boolean; data: VideoModalData | null }>({
    isOpen: false,
    data: null,
  })
  const [showMissionCompleteModal, setShowMissionCompleteModal] = useState(false)

  const {
    currentLocation: geoLocation,
    directions,
    calculateRouteFromLocations,
    clearRoute,
  } = useNavigation()

  // ビデオモーダル表示ハンドラー
  const handleShowVideoModal = useCallback((data: VideoModalData) => {
    console.log('Opening video modal:', data)
    setVideoModal({ isOpen: true, data })
  }, [])

  // ビデオモーダルを閉じる
  const handleCloseVideoModal = useCallback(() => {
    setVideoModal({ isOpen: false, data: null })
  }, [])

  // 全ミッション完了時の処理
  const handleAllMissionsComplete = useCallback(() => {
    setShowMissionCompleteModal(true)
  }, [])

  // ミッション完了モーダルを閉じてホームに戻る
  const handleCloseMissionCompleteModal = useCallback(() => {
    setShowMissionCompleteModal(false)
    setScreen('home')
    setMissionSteps([])
    setGoogleMapsNavUrl(null)
    clearRoute()
  }, [clearRoute])

  // モード選択時の処理
  const handleModeSelect = async (mode: string) => {
    if (mode === 'practice') {
      // 現在地取得開始
      setLoadingStep('location')

      try {
        // IP APIで現在地を取得
        const res = await fetch('https://ipapi.co/json/')
        const data = await res.json()
        const locationString = `${data.latitude}, ${data.longitude}`
        setCurrentLocation(locationString)

        // 取得完了後、苦手ポイント選択画面へ
        setTimeout(() => {
          setLoadingStep(null)
          setShowPracticeSelector(true)
        }, 1500)
      } catch (error) {
        console.error('位置情報の取得に失敗しました:', error)
        setLoadingStep(null)
        setShowPracticeSelector(true)
      }
    }
    // 他のモードは未実装
  }

  // 練習タイプ選択時の処理
  const handlePracticeTypeSelect = async (practiceType: PracticeType) => {
    setShowPracticeSelector(false)
    setLoadingStep('generating')

    try {
      const response = await fetch(`${API_BASE_URL}/api/route/suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          origin: currentLocation,
          practiceType: practiceType,
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

        if (suggestion.steps && Array.isArray(suggestion.steps)) {
          setMissionSteps(suggestion.steps)
        }

        if (suggestion.googleMapsNavUrl) {
          setGoogleMapsNavUrl(suggestion.googleMapsNavUrl)
        }

        // 地図上にルートを表示
        if (suggestion.origin && suggestion.destination) {
          const origin = {
            address: suggestion.origin.address,
            location: suggestion.origin.location,
          }
          const destination = {
            address: suggestion.destination.address,
            location: suggestion.destination.location,
          }
          const waypoints = suggestion.waypoints?.map((wp: { address: string; location: { lat: number; lng: number } }) => ({
            address: wp.address,
            location: wp.location,
          }))

          // ルートを計算して地図に表示
          calculateRouteFromLocations(origin, destination, waypoints)
        }

        // 生成完了表示
        setLoadingStep('complete')
      } else {
        alert(`エラー: ${result.error}`)
        setLoadingStep(null)
        setScreen('home')
      }
    } catch (error) {
      console.error('API呼び出しエラー:', error)
      alert('ルート提案の取得に失敗しました。サーバーが起動しているか確認してください。')
      setLoadingStep(null)
      setScreen('home')
    }
  }

  // ローディング完了時の処理
  const handleLoadingComplete = () => {
    setLoadingStep(null)
    setScreen('navigating')
  }

  // ホームに戻る
  const handleBackToHome = () => {
    setScreen('home')
    setMissionSteps([])
    setGoogleMapsNavUrl(null)
    clearRoute()
  }

  // Google Mapsをポップアップで開く（将来使用予定）
  // const openGoogleMapsPopup = () => {
  //   if (googleMapsNavUrl) {
  //     const screenWidth = window.screen.width
  //     const screenHeight = window.screen.height
  //     const windowWidth = Math.floor(screenWidth * 0.7)
  //     const windowHeight = screenHeight
  //     const left = Math.max(0, screenWidth - windowWidth)
  //     const top = 0

  //     const popup = window.open(
  //       googleMapsNavUrl,
  //       'googleMapsNav',
  //       [
  //         `width=${windowWidth}`,
  //         `height=${windowHeight}`,
  //         `left=${left}`,
  //         `top=${top}`,
  //         'resizable=yes',
  //         'scrollbars=yes',
  //         'toolbar=yes',
  //         'location=yes',
  //         'menubar=no',
  //         'status=no',
  //       ].join(',')
  //     )

  //     if (!popup) {
  //       window.location.assign(googleMapsNavUrl)
  //       return
  //     }

  //     popup.focus()
  //   }
  // }

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="error-message">
        <h1>Google Maps API キーが設定されていません</h1>
        <div className="error-instructions">
          <p>以下の手順でAPIキーを設定してください：</p>
          <ol>
            <li>プロジェクトフォルダに <code>.env</code> ファイルを作成</li>
            <li>以下の内容を書き込んで保存：</li>
            <li><code>VITE_GOOGLE_MAPS_API_KEY=あなたのAPIキー</code></li>
            <li>開発サーバーを再起動</li>
          </ol>
        </div>
      </div>
    )
  }

  return (
    <LoadScript googleMapsApiKey={GOOGLE_MAPS_API_KEY} libraries={['places']}>
      <div className="app-container">
        {/* 左パネル */}
        <div className="left-panel">
          {screen === 'home' && (
            <MainPanel onModeSelect={handleModeSelect} />
          )}

          {screen === 'navigating' && (
            <MissionListPanel
              steps={missionSteps}
              onBackToHome={handleBackToHome}
              onAllMissionsComplete={handleAllMissionsComplete}
            />
          )}
        </div>

        {/* 地図パネル */}
        <div className="map-panel">
          <MapPanel currentLocation={geoLocation} directions={directions} />
        </div>

        {/* AIチャットボタン */}
        <AIChatButton alwaysListen={true} onShowModal={handleShowVideoModal} />

        {/* ローディング画面 */}
        {loadingStep && (
          <LoadingScreen
            step={loadingStep}
            onComplete={handleLoadingComplete}
          />
        )}

        {/* 苦手ポイント選択 */}
        {showPracticeSelector && (
          <PracticeTypeSelector
            onSelect={handlePracticeTypeSelect}
            onClose={() => setShowPracticeSelector(false)}
          />
        )}

        {/* YouTubeビデオモーダル */}
        <YouTubeVideoModal
          isOpen={videoModal.isOpen}
          onClose={handleCloseVideoModal}
          data={videoModal.data}
        />

        {/* ミッション完了モーダル */}
        <MissionCompleteModal
          isOpen={showMissionCompleteModal}
          onClose={handleCloseMissionCompleteModal}
        />
      </div>
    </LoadScript>
  )
}

export default App
