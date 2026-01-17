/**
 * Google API 型定義
 */

// Geocoding API レスポンス
export interface GeocodingResponse {
  results: GeocodingResult[];
  status: string;
  error_message?: string;
}

export interface GeocodingResult {
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  formatted_address: string;
  place_id: string;
}

// Places API (New) レスポンス
export interface PlacesSearchResponse {
  places?: PlaceResult[];
}

export interface PlaceResult {
  id: string;
  displayName?: {
    text: string;
    languageCode: string;
  };
  formattedAddress?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  types?: string[];
  rating?: number;
  userRatingCount?: number;
}

// Places API リクエスト
export interface PlacesNearbyRequest {
  includedTypes: string[];
  maxResultCount: number;
  rankPreference: 'DISTANCE' | 'POPULARITY';
  locationRestriction: {
    circle: {
      center: {
        latitude: number;
        longitude: number;
      };
      radius: number;
    };
  };
}

// Google Maps URL パラメータ
export interface GoogleMapsUrlParams {
  origin: string;
  destination: string;
  waypoints?: string[];
  travelMode?: 'driving' | 'walking' | 'bicycling' | 'transit';
  avoid?: ('tolls' | 'highways' | 'ferries')[];
}
