/**
 * Route Service - メインオーケストレーション
 */

import { getSearchConfig } from '../config/searchAssets.js';
import { AppError } from '../errors/AppError.js';
import { logger } from '../utils/logger.js';
import { geocodeAddress } from './geocoding.service.js';
import { searchNearbyPlaces } from './places.service.js';
import { selectRouteWithAI } from './ai.service.js';
import { generateGoogleMapsUrl } from './url.service.js';
import type {
  PracticeType,
  RouteConstraints,
  RouteSuggestion,
  POICandidate,
} from '../types/index.js';

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
 * 4. AI経由地選択 (Claude API)
 * 5. Google Maps URL生成
 * 6. レスポンス構築
 */
export async function suggestRoute(
  params: SuggestRouteParams
): Promise<RouteSuggestion> {
  logger.info({ params }, 'Starting route suggestion');

  // Step 1: 住所→座標変換
  const geocodingResult = await geocodeAddress(params.origin);
  logger.debug({ geocodingResult }, 'Geocoding completed');

  // Step 2: 検索設定取得
  const searchConfig = getSearchConfig(params.practiceType);
  logger.debug({ searchConfig }, 'Search config retrieved');

  // Step 3: 周辺POI検索
  const candidates = await searchNearbyPlaces(
    geocodingResult.location,
    searchConfig
  );

  if (candidates.length === 0) {
    throw AppError.routeGeneration(
      '周辺に適切な練習場所が見つかりませんでした',
      { location: geocodingResult.location }
    );
  }

  logger.debug({ candidateCount: candidates.length }, 'Places search completed');

  // Step 4: AI経由地選択
  const aiSelection = await selectRouteWithAI({
    practiceType: params.practiceType,
    originAddress: geocodingResult.address,
    candidates,
  });

  logger.debug({ aiSelection }, 'AI selection completed');

  // 選択されたPOIを取得
  const candidateMap = new Map(candidates.map((c) => [c.id, c]));

  const selectedWaypoints = aiSelection.waypointIds
    .map((id) => candidateMap.get(id))
    .filter((poi): poi is POICandidate => poi !== undefined);

  const destination = candidateMap.get(aiSelection.destinationId);
  if (!destination) {
    throw AppError.routeGeneration('目的地が見つかりませんでした', {
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

  logger.info(
    { practiceType: params.practiceType, waypointCount: selectedWaypoints.length },
    'Route suggestion completed'
  );

  return suggestion;
}
