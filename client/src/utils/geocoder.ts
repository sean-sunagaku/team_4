import { LatLng } from '../hooks/useNavigation'

export class Geocoder {
  private geocoder: google.maps.Geocoder

  constructor() {
    this.geocoder = new google.maps.Geocoder()
  }

  async geocode(address: string): Promise<LatLng | null> {
    return new Promise((resolve, reject) => {
      this.geocoder.geocode({ address }, (results, status) => {
        if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
          const location = results[0].geometry.location
          resolve({
            lat: location.lat(),
            lng: location.lng(),
          })
        } else {
          reject(new Error(`Geocoding failed: ${status}`))
        }
      })
    })
  }

  async reverseGeocode(lat: number, lng: number): Promise<string | null> {
    return new Promise((resolve, reject) => {
      this.geocoder.geocode({ location: { lat, lng } }, (results, status) => {
        if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
          resolve(results[0].formatted_address)
        } else {
          reject(new Error(`Reverse geocoding failed: ${status}`))
        }
      })
    })
  }
}
