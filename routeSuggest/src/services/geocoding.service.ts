/**
 * Geocoding Service - 住所→座標変換
 */

import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../utils/logger.js';
import type { Coordinates, GeocodingResponse } from '../types/index.js';

const GEOCODING_API_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

export interface GeocodingResult {
  address: string;
  location: Coordinates;
  placeId: string;
}

export async function geocodeAddress(address: string): Promise<GeocodingResult> {
  logger.debug({ address }, 'Geocoding address');

  const url = new URL(GEOCODING_API_URL);
  url.searchParams.set('address', address);
  url.searchParams.set('key', env.GOOGLE_API_KEY);
  url.searchParams.set('language', 'ja');
  url.searchParams.set('region', 'jp');

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw AppError.geocoding(
      `Geocoding API request failed: ${response.status}`,
      { status: response.status }
    );
  }

  const data = (await response.json()) as GeocodingResponse;

  if (data.status !== 'OK') {
    throw AppError.geocoding(
      `Geocoding failed: ${data.status}`,
      { status: data.status, errorMessage: data.error_message }
    );
  }

  const result = data.results[0];
  if (!result) {
    throw AppError.geocoding('No geocoding results found', { address });
  }

  const geocodingResult: GeocodingResult = {
    address: result.formatted_address,
    location: {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
    },
    placeId: result.place_id,
  };

  logger.debug({ geocodingResult }, 'Geocoding successful');

  return geocodingResult;
}
