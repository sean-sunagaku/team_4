/**
 * Route Service - メインオーケストレーション
 */

import { getSearchConfig } from "../config/route-search.config.js";
import { geocodeAddress, type GeocodingResultData } from "./geocoding-service.js";
import { searchNearbyPlaces } from "./places-service.js";
import { selectRouteWithAI } from "./route-ai-service.js";
import { generateGoogleMapsUrl } from "./maps-url-service.js";
import {
  RouteError,
  type PracticeType,
  type RouteConstraints,
  type RouteSuggestion,
  type POICandidate,
} from "../types/route.types.js";

export interface SuggestRouteParams {
  origin: string;
  practiceType: PracticeType;
  constraints?: RouteConstraints;
}

/**
 * ルート提案のメイン処理
 *
 * 処理フロー:
 * 1. 住所→座標変換 (Geocoding)
 * 2. 検索設定取得
 * 3. 周辺POI検索 (Places API)
 * 4. AI経由地選択 (Qwen API)
 * 5. Google Maps URL生成
 * 6. レスポンス構築
 */
async function suggestRoute(params: SuggestRouteParams): Promise<RouteSuggestion> {
  console.log("Starting route suggestion:", params);

  // Step 1: 住所→座標変換
  const geocodingResult = await geocodeAddress(params.origin);
  console.log("Geocoding completed:", geocodingResult);

  // Step 2: 検索設定取得
  const searchConfig = getSearchConfig(params.practiceType);

  // Step 3: 周辺POI検索
  const candidates = await searchNearbyPlaces(
    geocodingResult.location,
    searchConfig
  );

  if (candidates.length === 0) {
    throw RouteError.routeGeneration(
      "周辺に適切な練習場所が見つかりませんでした",
      { location: geocodingResult.location }
    );
  }

  console.log(`Places search completed: ${candidates.length} candidates`);

  // Step 4: AI経由地選択
  const aiSelection = await selectRouteWithAI({
    practiceType: params.practiceType,
    originAddress: geocodingResult.address,
    candidates,
  });

  console.log("AI selection completed:", aiSelection);

  // 選択されたPOIを取得
  const candidateMap = new Map(candidates.map((c) => [c.id, c]));

  const selectedWaypoints = aiSelection.waypointIds
    .map((id) => candidateMap.get(id))
    .filter((poi): poi is POICandidate => poi !== undefined);

  const destination = candidateMap.get(aiSelection.destinationId);
  if (!destination) {
    throw RouteError.routeGeneration("目的地が見つかりませんでした", {
      destinationId: aiSelection.destinationId,
    });
  }

  // Step 5: Google Maps URL生成
  const googleMapsUrl = generateGoogleMapsUrl({
    origin: {
      address: geocodingResult.address,
      location: geocodingResult.location,
    },
    destination: {
      address: destination.address,
      location: destination.location,
    },
    waypoints: selectedWaypoints.map((wp) => ({
      address: wp.address,
      location: wp.location,
    })),
    constraints: params.constraints,
  });

  // Step 6: レスポンス構築
  const suggestion: RouteSuggestion = {
    googleMapsUrl,
    steps: aiSelection.steps,
    notes: aiSelection.notes,
    waypoints: selectedWaypoints.map((wp) => ({
      name: wp.name,
      address: wp.address,
      location: wp.location,
    })),
    destination: {
      name: destination.name,
      address: destination.address,
      location: destination.location,
    },
    practiceType: params.practiceType,
    origin: {
      address: geocodingResult.address,
      location: geocodingResult.location,
    },
  };

  console.log(
    `Route suggestion completed: ${selectedWaypoints.length} waypoints`
  );

  return suggestion;
}

/**
 * Google APIs疎通テスト（AIをスキップ）
 * 検索結果の最初の施設を目的地として使用
 */
async function testGoogleApis(params: SuggestRouteParams): Promise<{
  geocoding: {
    inputAddress: string;
    resolvedAddress: string;
    location: { lat: number; lng: number };
  };
  placesSearch: {
    totalFound: number;
    searchTypes: string[];
  };
  demoRoute: {
    destination: { name: string; address: string };
    waypoints: Array<{ name: string; address: string }>;
  };
  googleMapsUrl: string;
}> {
  console.log("[TEST] Google Maps API test request:", params);

  // Step 1: Geocoding
  const geocodingResult = await geocodeAddress(params.origin);
  console.log("[TEST] Geocoding成功:", geocodingResult);

  // Step 2: Places検索
  const searchConfig = getSearchConfig(params.practiceType);
  const candidates = await searchNearbyPlaces(
    geocodingResult.location,
    searchConfig
  );
  console.log(`[TEST] Places検索成功: ${candidates.length} candidates`);

  if (candidates.length === 0) {
    return {
      geocoding: {
        inputAddress: params.origin,
        resolvedAddress: geocodingResult.address,
        location: geocodingResult.location,
      },
      placesSearch: {
        totalFound: 0,
        searchTypes: searchConfig.includedTypes,
      },
      demoRoute: {
        destination: { name: "", address: "" },
        waypoints: [],
      },
      googleMapsUrl: "",
    };
  }

  // Step 3: デモ用 - 最初の施設を目的地、2番目を経由地として使用
  const destination = candidates[0]!;
  const secondCandidate = candidates[1];
  const waypoints = secondCandidate ? [secondCandidate] : [];

  // Step 4: URL生成
  const googleMapsUrl = generateGoogleMapsUrl({
    origin: {
      address: geocodingResult.address,
      location: geocodingResult.location,
    },
    destination: {
      address: destination.address,
      location: destination.location,
    },
    waypoints: waypoints.map((wp) => ({
      address: wp.address,
      location: wp.location,
    })),
    constraints: params.constraints,
  });

  return {
    geocoding: {
      inputAddress: params.origin,
      resolvedAddress: geocodingResult.address,
      location: geocodingResult.location,
    },
    placesSearch: {
      totalFound: candidates.length,
      searchTypes: searchConfig.includedTypes,
    },
    demoRoute: {
      destination: {
        name: destination.name,
        address: destination.address,
      },
      waypoints: waypoints.map((wp) => ({
        name: wp.name,
        address: wp.address,
      })),
    },
    googleMapsUrl,
  };
}

export const routeService = {
  suggestRoute,
  testGoogleApis,
};
