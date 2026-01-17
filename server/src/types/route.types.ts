/**
 * Route Suggestion API - 型定義
 */

import { z } from "zod";

// ============================================
// 練習タイプ
// ============================================

export const PRACTICE_TYPES = [
  "BACK_PARKING",
  "BASIC_START_STOP",
  "U_TURN",
  "INTERSECTION_TURN",
  "MERGE_LANECHANGE",
  "NARROW_ROAD",
] as const;

export type PracticeType = (typeof PRACTICE_TYPES)[number];

export const PRACTICE_TYPE_LABELS: Record<PracticeType, string> = {
  BACK_PARKING: "バック駐車",
  BASIC_START_STOP: "基本発進・停止",
  U_TURN: "Uターン",
  INTERSECTION_TURN: "交差点右左折",
  MERGE_LANECHANGE: "合流・車線変更",
  NARROW_ROAD: "狭路走行",
};

export const PRACTICE_TYPE_DESCRIPTIONS: Record<PracticeType, string> = {
  BACK_PARKING: "駐車場でのバック駐車練習",
  BASIC_START_STOP: "安全な場所での発進・停止の練習",
  U_TURN: "Uターンの練習",
  INTERSECTION_TURN: "交差点での右左折練習",
  MERGE_LANECHANGE: "道路での合流・車線変更練習",
  NARROW_ROAD: "狭い道での走行練習",
};

// ============================================
// 座標・POI
// ============================================

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

// ============================================
// ルート
// ============================================

export interface RouteConstraints {
  avoidHighways?: boolean;
  avoidTolls?: boolean;
}

export interface Waypoint {
  name: string;
  address: string;
  location: Coordinates;
}

export interface RouteSuggestion {
  googleMapsUrl: string;
  steps: string[];
  notes: string[];
  waypoints: Waypoint[];
  destination: Waypoint;
  practiceType: PracticeType;
  origin: {
    address: string;
    location: Coordinates;
  };
}

export interface AIRouteSelection {
  waypointIds: string[];
  destinationId: string;
  steps: string[];
  notes: string[];
}

// ============================================
// Google API型
// ============================================

export interface GeocodingResponse {
  results: GeocodingResult[];
  status: string;
  error_message?: string;
}

export interface GeocodingResult {
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  formatted_address: string;
  place_id: string;
}

export interface PlacesSearchResponse {
  places?: PlaceResult[];
}

export interface PlaceResult {
  id: string;
  displayName?: {
    text: string;
    languageCode: string;
  };
  formattedAddress?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  types?: string[];
  rating?: number;
  userRatingCount?: number;
}

export interface PlacesNearbyRequest {
  includedTypes: string[];
  maxResultCount: number;
  rankPreference: "DISTANCE" | "POPULARITY";
  locationRestriction: {
    circle: {
      center: {
        latitude: number;
        longitude: number;
      };
      radius: number;
    };
  };
}

// ============================================
// API リクエスト/レスポンス（Zodスキーマ）
// ============================================

export const RouteSuggestRequestSchema = z.object({
  origin: z.string().min(1, "出発地点は必須です"),
  practiceType: z.enum(PRACTICE_TYPES, "無効な練習タイプです"),
  constraints: z
    .object({
      avoidHighways: z.boolean().optional(),
      avoidTolls: z.boolean().optional(),
    })
    .optional(),
});

export type RouteSuggestRequest = z.infer<typeof RouteSuggestRequestSchema>;

export const AIRouteSelectionSchema = z.object({
  waypointIds: z
    .array(z.string())
    .min(0)
    .max(2, "経由地は最大2箇所までです"),
  destinationId: z.string().min(1, "目的地は必須です"),
  steps: z.array(z.string()).min(1, "ステップは1つ以上必要です"),
  notes: z.array(z.string()),
});

export type AIRouteSelectionResponse = z.infer<typeof AIRouteSelectionSchema>;

// ============================================
// エラークラス
// ============================================

export type RouteErrorCode =
  | "VALIDATION_ERROR"
  | "GEOCODING_ERROR"
  | "PLACES_API_ERROR"
  | "AI_SERVICE_ERROR"
  | "ROUTE_GENERATION_ERROR"
  | "INTERNAL_ERROR";

export class RouteError extends Error {
  public readonly code: RouteErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(
    message: string,
    code: RouteErrorCode,
    statusCode: number = 500,
    details?: unknown
  ) {
    super(message);
    this.name = "RouteError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  static validation(message: string, details?: unknown): RouteError {
    return new RouteError(message, "VALIDATION_ERROR", 400, details);
  }

  static geocoding(message: string, details?: unknown): RouteError {
    return new RouteError(message, "GEOCODING_ERROR", 400, details);
  }

  static placesApi(message: string, details?: unknown): RouteError {
    return new RouteError(message, "PLACES_API_ERROR", 502, details);
  }

  static aiService(message: string, details?: unknown): RouteError {
    return new RouteError(message, "AI_SERVICE_ERROR", 502, details);
  }

  static routeGeneration(message: string, details?: unknown): RouteError {
    return new RouteError(message, "ROUTE_GENERATION_ERROR", 500, details);
  }

  static internal(message: string, details?: unknown): RouteError {
    return new RouteError(message, "INTERNAL_ERROR", 500, details);
  }
}
