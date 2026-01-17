/**
 * POI (Point of Interest) 型定義
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface POICandidate {
  id: string;
  name: string;
  address: string;
  location: Coordinates;
  types: string[];
  rating?: number;
  userRatingsTotal?: number;
}

export interface SelectedPOI {
  id: string;
  name: string;
  address: string;
  location: Coordinates;
  reason?: string;
}
