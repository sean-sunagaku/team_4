/**
 * Places Service - Google Places API (New) による周辺施設検索
 */

import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../utils/logger.js';
import type { SearchConfig } from '../config/searchAssets.js';
import type {
  Coordinates,
  POICandidate,
  PlacesSearchResponse,
  PlacesNearbyRequest,
} from '../types/index.js';

const PLACES_API_URL =
  'https://places.googleapis.com/v1/places:searchNearby';

export async function searchNearbyPlaces(
  location: Coordinates,
  config: SearchConfig
): Promise<POICandidate[]> {
  logger.debug({ location, config }, 'Searching nearby places');

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
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': env.GOOGLE_API_KEY,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.rating,places.userRatingCount',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw AppError.placesApi(
      `Places API request failed: ${response.status}`,
      { status: response.status, error: errorText }
    );
  }

  const data = (await response.json()) as PlacesSearchResponse;

  if (!data.places || data.places.length === 0) {
    logger.warn({ location }, 'No places found nearby');
    return [];
  }

  const candidates: POICandidate[] = data.places.map((place) => ({
    id: place.id,
    name: place.displayName?.text ?? '名称不明',
    address: place.formattedAddress ?? '住所不明',
    location: {
      lat: place.location?.latitude ?? 0,
      lng: place.location?.longitude ?? 0,
    },
    types: place.types ?? [],
    rating: place.rating,
    userRatingsTotal: place.userRatingCount,
  }));

  logger.debug({ count: candidates.length }, 'Places search successful');

  return candidates;
}
