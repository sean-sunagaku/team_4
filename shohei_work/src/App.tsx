import { useState } from 'react'
import { GoogleMap, LoadScript, DirectionsRenderer, Marker } from '@react-google-maps/api'
import SearchPanel from './components/SearchPanel'
import NavigationPanel from './components/NavigationPanel'
import { useNavigation } from './hooks/useNavigation'
import './App.css'

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

const defaultCenter = {
  lat: 35.6762,
  lng: 139.6503,
}

const mapContainerStyle = {
  width: '100%',
  height: '100%',
}

const defaultOptions = {
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: true,
}

function App() {
  const [destination, setDestination] = useState<string>('')
  const [isNavigating, setIsNavigating] = useState(false)
  const {
    currentLocation,
    directions,
    routeInfo,
    isLocationLoading,
    getCurrentLocation,
    calculateRoute,
    clearRoute,
  } = useNavigation()

  const handleSearch = async (address: string) => {
    setDestination(address)
    if (currentLocation) {
      await calculateRoute(currentLocation, address)
      setIsNavigating(true)
    }
  }

  const handleStartNavigation = async () => {
    if (!currentLocation) {
      await getCurrentLocation()
    }
    if (destination && currentLocation) {
      await calculateRoute(currentLocation, destination)
      setIsNavigating(true)
    }
  }

  const handleStopNavigation = () => {
    setIsNavigating(false)
    clearRoute()
    setDestination('')
  }

  const handleGetCurrentLocation = async () => {
    await getCurrentLocation()
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
    <LoadScript googleMapsApiKey={GOOGLE_MAPS_API_KEY} libraries={['places', 'directions']}>
      <div className="app-container">
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={currentLocation || defaultCenter}
          zoom={currentLocation ? 15 : 10}
          options={defaultOptions}
        >
          {currentLocation && (
            <Marker
              position={currentLocation}
              icon={{
                url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png',
              }}
              label="現在地"
            />
          )}
          {directions && <DirectionsRenderer directions={directions} />}
        </GoogleMap>

        {!isNavigating ? (
          <SearchPanel
            onSearch={handleSearch}
            onGetCurrentLocation={handleGetCurrentLocation}
            isLocationLoading={isLocationLoading}
            destination={destination}
            onDestinationChange={setDestination}
            onStartNavigation={handleStartNavigation}
          />
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
