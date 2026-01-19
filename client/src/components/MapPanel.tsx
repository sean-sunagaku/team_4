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
      stylers: [{ visibility: 'off' }],
    },
    {
      featureType: 'transit',
      elementType: 'labels',
      stylers: [{ visibility: 'off' }],
    },
    {
      featureType: 'road',
      elementType: 'geometry',
      stylers: [{ color: '#2d2d2d' }, { weight: 1 }],
    },
    {
      featureType: 'road.highway',
      elementType: 'geometry',
      stylers: [{ color: '#3d3d3d' }, { weight: 2 }],
    },
    {
      featureType: 'water',
      elementType: 'geometry',
      stylers: [{ color: '#1a1a2e' }],
    },
    {
      featureType: 'landscape',
      elementType: 'geometry',
      stylers: [{ color: '#2d2d2d' }],
    },
    {
      featureType: 'all',
      elementType: 'labels.text.fill',
      stylers: [{ color: '#ffffff' }],
    },
    {
      featureType: 'all',
      elementType: 'labels.text.stroke',
      stylers: [{ color: '#000000' }],
    },
  ],
  tilt: 45,
  heading: 0,
}

type MapPanelProps = {
  currentLocation: LatLng | null
  directions: google.maps.DirectionsResult | null
}

const MapPanel = ({ currentLocation, directions }: MapPanelProps) => {
  return (
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
  )
}

export default MapPanel
