/**
 * Geocoding Service - 住所→座標変換
 */

import {
  RouteError,
  type Coordinates,
  type GeocodingResponse,
} from "../types/route.types.js";

const GEOCODING_API_URL = "https://maps.googleapis.com/maps/api/geocode/json";

export interface GeocodingResultData {
  address: string;
  location: Coordinates;
  placeId: string;
}

export async function geocodeAddress(address: string): Promise<GeocodingResultData> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw RouteError.internal("GOOGLE_API_KEY is not set");
  }

  const url = new URL(GEOCODING_API_URL);
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("language", "ja");
  url.searchParams.set("region", "jp");

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw RouteError.geocoding(
      `Geocoding API request failed: ${response.status}`,
      { status: response.status }
    );
  }

  const data = (await response.json()) as GeocodingResponse;

  if (data.status !== "OK") {
    throw RouteError.geocoding(
      `Geocoding failed: ${data.status}`,
      { status: data.status, errorMessage: data.error_message }
    );
  }

  const result = data.results[0];
  if (!result) {
    throw RouteError.geocoding("No geocoding results found", { address });
  }

  return {
    address: result.formatted_address,
    location: {
      lat: result.geometry.location.lat,
      lng: result.geometry.location.lng,
    },
    placeId: result.place_id,
  };
}
