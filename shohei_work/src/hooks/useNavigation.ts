import { useState, useCallback } from 'react'
import { Geocoder } from '../utils/geocoder'

export interface RouteInfo {
  distance: string
  duration: string
  steps: string[]
}

export interface LatLng {
  lat: number
  lng: number
}

export const useNavigation = () => {
  const [currentLocation, setCurrentLocation] = useState<LatLng | null>(null)
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null)
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null)
  const geocodeAddress = useCallback(async (address: string): Promise<LatLng | null> => {
    try {
      const geocoder = new Geocoder()
      const result = await geocoder.geocode(address)
      return result
    } catch (error) {
      console.error('住所の変換に失敗しました:', error)
      return null
    }
  }, [])

  const calculateRoute = useCallback(
    async (origin: LatLng, destination: string) => {
      try {
        const destinationLatLng = await geocodeAddress(destination)
        if (!destinationLatLng) {
          alert('目的地の住所を認識できませんでした')
          return
        }

        const directionsService = new google.maps.DirectionsService()

        directionsService.route(
          {
            origin: origin,
            destination: destinationLatLng,
            travelMode: google.maps.TravelMode.DRIVING,
            unitSystem: google.maps.UnitSystem.METRIC,
          },
          (result, status) => {
            if (status === google.maps.DirectionsStatus.OK && result) {
              setDirections(result)
              
              // ルート情報を抽出
              const route = result.routes[0]
              const leg = route.legs[0]
              
              const info: RouteInfo = {
                distance: leg.distance?.text || '',
                duration: leg.duration?.text || '',
                steps: leg.steps.map((step) => step.instructions || ''),
              }
              setRouteInfo(info)
            } else {
              console.error('ルート計算に失敗しました:', status)
              alert('ルート計算に失敗しました')
            }
          }
        )
      } catch (error) {
        console.error('ルート計算エラー:', error)
        alert('ルート計算中にエラーが発生しました')
      }
    },
    [geocodeAddress]
  )

  const clearRoute = useCallback(() => {
    setDirections(null)
    setRouteInfo(null)
  }, [])

  return {
    currentLocation,
    directions,
    routeInfo,
    calculateRoute,
    clearRoute,
  }
}
