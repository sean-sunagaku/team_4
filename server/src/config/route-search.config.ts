/**
 * Route Search Configuration - 練習タイプ→検索テンプレート設定
 */

import type { PracticeType } from "../types/route.types.js";

export interface SearchConfig {
  includedTypes: string[];
  radiusMeters: number;
  maxResults: number;
  rankPreference: "DISTANCE" | "POPULARITY";
  description: string;
}

export const SEARCH_CONFIGS: Record<PracticeType, SearchConfig> = {
  BACK_PARKING: {
    includedTypes: ["parking", "convenience_store", "supermarket", "shopping_mall"],
    radiusMeters: 3000,
    maxResults: 20,
    rankPreference: "DISTANCE",
    description: "バック駐車練習に適した広めの駐車場を持つ施設",
  },
  BASIC_START_STOP: {
    includedTypes: ["parking", "convenience_store", "supermarket"],
    radiusMeters: 3000,
    maxResults: 20,
    rankPreference: "DISTANCE",
    description: "発進・停止練習に適した安全な駐車場",
  },
  U_TURN: {
    includedTypes: ["gas_station", "parking", "convenience_store"],
    radiusMeters: 3000,
    maxResults: 20,
    rankPreference: "DISTANCE",
    description: "Uターン練習に適した広いスペースがある場所",
  },
  INTERSECTION_TURN: {
    includedTypes: ["convenience_store", "supermarket", "parking"],
    radiusMeters: 3000,
    maxResults: 20,
    rankPreference: "DISTANCE",
    description: "交差点での右左折練習に適したルート上の施設",
  },
  MERGE_LANECHANGE: {
    includedTypes: ["gas_station", "convenience_store", "parking"],
    radiusMeters: 3000,
    maxResults: 20,
    rankPreference: "DISTANCE",
    description: "合流・車線変更練習に適した幹線道路沿いの施設",
  },
  NARROW_ROAD: {
    includedTypes: ["convenience_store", "parking", "supermarket"],
    radiusMeters: 3000,
    maxResults: 20,
    rankPreference: "DISTANCE",
    description: "狭路走行練習に適した住宅街や商店街近くの施設",
  },
};

export function getSearchConfig(practiceType: PracticeType): SearchConfig {
  return SEARCH_CONFIGS[practiceType];
}
