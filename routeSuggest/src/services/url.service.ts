/**
 * URL Service - Google Maps URL生成
 */

import { logger } from '../utils/logger.js';
import type { Coordinates, RouteConstraints, GoogleMapsUrlParams } from '../types/index.js';

const GOOGLE_MAPS_DIRECTIONS_URL = 'https://www.google.com/maps/dir/';

export interface RouteUrlParams {
  origin: {
    address: string;
    location: Coordinates;
  };
  destination: {
    address: string;
    location: Coordinates;
  };
  waypoints?: Array<{
    address: string;
    location: Coordinates;
  }>;
  constraints?: RouteConstraints;
}

/**
 * Google Maps Directions URLを生成
 * @see https://developers.google.com/maps/documentation/urls/get-started#directions-action
 */
export function generateGoogleMapsUrl(params: RouteUrlParams): string {
  logger.debug({ params }, 'Generating Google Maps URL');

  const url = new URL(GOOGLE_MAPS_DIRECTIONS_URL);
  url.searchParams.set('api', '1');

  // 出発地（座標形式）
  url.searchParams.set(
    'origin',
    `${params.origin.location.lat},${params.origin.location.lng}`
  );

  // 目的地（座標形式）
  url.searchParams.set(
    'destination',
    `${params.destination.location.lat},${params.destination.location.lng}`
  );

  // 経由地（最大2箇所）
  if (params.waypoints && params.waypoints.length > 0) {
    const waypointCoords = params.waypoints
      .slice(0, 2)
      .map((wp) => `${wp.location.lat},${wp.location.lng}`)
      .join('|');
    url.searchParams.set('waypoints', waypointCoords);
  }

  // 移動モード
  url.searchParams.set('travelmode', 'driving');

  // 回避設定
  const avoidOptions: string[] = [];
  if (params.constraints?.avoidHighways) {
    avoidOptions.push('highways');
  }
  if (params.constraints?.avoidTolls) {
    avoidOptions.push('tolls');
  }
  if (avoidOptions.length > 0) {
    url.searchParams.set('avoid', avoidOptions.join('|'));
  }

  const generatedUrl = url.toString();
  logger.debug({ generatedUrl }, 'Google Maps URL generated');

  return generatedUrl;
}

/**
 * 座標文字列のフォーマット
 */
export function formatCoordinates(location: Coordinates): string {
  return `${location.lat.toFixed(6)},${location.lng.toFixed(6)}`;
}
