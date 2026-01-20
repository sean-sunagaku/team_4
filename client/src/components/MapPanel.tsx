import { DirectionsRenderer, GoogleMap, Marker } from '@react-google-maps/api'
import { LatLng } from '../hooks/useNavigation'

const naviIcon = new URL('../icon/navi_icon.png', import.meta.url).href

const defaultCenter = {
  lat: 35.6762,
  lng: 139.6503,
}

const mapContainerStyle = {
  width: '100%',
  height: '100%',
}

// 明るいスタイル（デフォルト）
const defaultOptions: google.maps.MapOptions = {
  zoomControl: true,
  streetViewControl: false,
  mapTypeControl: false,
  fullscreenControl: false,
  disableDefaultUI: false,
  // ダークテーマのスタイルを削除して標準の明るい地図に
}

type MapPanelProps = {
  currentLocation: LatLng | null
  directions: google.maps.DirectionsResult | null
}

const MapPanel = ({ currentLocation, directions }: MapPanelProps) => {
  return (
    <div className="center-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={currentLocation || defaultCenter}
          zoom={currentLocation ? 16 : 12}
          options={defaultOptions}
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
  )
}

export default MapPanel
