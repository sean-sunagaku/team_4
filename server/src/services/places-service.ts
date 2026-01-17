/**
 * Places Service - Google Places API (New) による周辺施設検索
 */

import type { SearchConfig } from "../config/route-search.config.js";
import {
  RouteError,
  type Coordinates,
  type POICandidate,
  type PlacesSearchResponse,
  type PlacesNearbyRequest,
} from "../types/route.types.js";

const PLACES_API_URL = "https://places.googleapis.com/v1/places:searchNearby";

export async function searchNearbyPlaces(
  location: Coordinates,
  config: SearchConfig
): Promise<POICandidate[]> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw RouteError.internal("GOOGLE_API_KEY is not set");
  }

  const requestBody: PlacesNearbyRequest = {
    includedTypes: config.includedTypes,
    maxResultCount: config.maxResults,
    rankPreference: config.rankPreference,
    locationRestriction: {
      circle: {
        center: {
          latitude: location.lat,
          longitude: location.lng,
        },
        radius: config.radiusMeters,
      },
    },
  };

  const response = await fetch(PLACES_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location,places.types,places.rating,places.userRatingCount",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw RouteError.placesApi(
      `Places API request failed: ${response.status}`,
      { status: response.status, error: errorText }
    );
  }

  const data = (await response.json()) as PlacesSearchResponse;

  if (!data.places || data.places.length === 0) {
    console.log("No places found nearby:", location);
    return [];
  }

  const candidates: POICandidate[] = data.places.map((place) => ({
    id: place.id,
    name: place.displayName?.text ?? "名称不明",
    address: place.formattedAddress ?? "住所不明",
    location: {
      lat: place.location?.latitude ?? 0,
      lng: place.location?.longitude ?? 0,
    },
    types: place.types ?? [],
    rating: place.rating,
    userRatingsTotal: place.userRatingCount,
  }));

  return candidates;
}
