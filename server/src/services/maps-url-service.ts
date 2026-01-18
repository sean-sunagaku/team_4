/**
 * Maps URL Service - Google Maps URL生成
 */

import type { Coordinates, RouteConstraints } from "../types/route.types.js";

const GOOGLE_MAPS_EMBED_URL = "https://www.google.com/maps/embed/v1/directions";
const GOOGLE_MAPS_NAV_URL = "https://www.google.com/maps/dir/";
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";

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
 * Google Maps Embed API URLを生成（iframe用）
 * @see https://developers.google.com/maps/documentation/embed/embedding-map#directions_mode
 */
export function generateGoogleMapsUrl(params: RouteUrlParams): string {
  const url = new URL(GOOGLE_MAPS_EMBED_URL);
  url.searchParams.set("key", GOOGLE_MAPS_API_KEY);

  // 出発地（座標形式）
  url.searchParams.set(
    "origin",
    `${params.origin.location.lat},${params.origin.location.lng}`
  );

  // 目的地（座標形式）
  url.searchParams.set(
    "destination",
    `${params.destination.location.lat},${params.destination.location.lng}`
  );

  // 経由地
  if (params.waypoints && params.waypoints.length > 0) {
    const waypointCoords = params.waypoints
      .map((wp) => `${wp.location.lat},${wp.location.lng}`)
      .join("|");
    url.searchParams.set("waypoints", waypointCoords);
  }

  // 移動モード
  url.searchParams.set("mode", "driving");

  // 回避設定
  const avoidOptions: string[] = [];
  if (params.constraints?.avoidTolls) {
    avoidOptions.push("tolls");
  }
  if (params.constraints?.avoidHighways) {
    avoidOptions.push("highways");
  }
  if (avoidOptions.length > 0) {
    url.searchParams.set("avoid", avoidOptions.join("|"));
  }

  return url.toString();
}

/**
 * Google Maps ナビゲーション用URLを生成（ポップアップウィンドウ用）
 * @see https://developers.google.com/maps/documentation/urls/get-started#directions-action
 */
export function generateGoogleMapsNavUrl(params: RouteUrlParams): string {
  const url = new URL(GOOGLE_MAPS_NAV_URL);
  url.searchParams.set("api", "1");

  // 出発地（座標形式）
  url.searchParams.set(
    "origin",
    `${params.origin.location.lat},${params.origin.location.lng}`
  );

  // 目的地（座標形式）
  url.searchParams.set(
    "destination",
    `${params.destination.location.lat},${params.destination.location.lng}`
  );

  // 経由地
  if (params.waypoints && params.waypoints.length > 0) {
    const waypointCoords = params.waypoints
      .map((wp) => `${wp.location.lat},${wp.location.lng}`)
      .join("|");
    url.searchParams.set("waypoints", waypointCoords);
  }

  // 移動モード
  url.searchParams.set("travelmode", "driving");

  // 回避設定
  const avoidOptions: string[] = [];
  if (params.constraints?.avoidTolls) {
    avoidOptions.push("tolls");
  }
  if (params.constraints?.avoidHighways) {
    avoidOptions.push("highways");
  }
  if (avoidOptions.length > 0) {
    url.searchParams.set("avoid", avoidOptions.join(","));
  }

  return url.toString();
}

/**
 * 座標文字列のフォーマット
 */
export function formatCoordinates(location: Coordinates): string {
  return `${location.lat.toFixed(6)},${location.lng.toFixed(6)}`;
}
