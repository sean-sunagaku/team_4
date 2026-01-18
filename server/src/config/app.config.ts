/**
 * Application Configuration
 */

import dotenv from "dotenv";
import {
  MOCK_ENABLED,
  MOCK_LOCATION,
  getMockLocation,
} from "../mock/mock-data.js";
import type { Location, TTSMode } from "../types/common.types.js";

dotenv.config();

// ============================================
// Server Configuration
// ============================================

export const PORT = process.env.PORT || 3001;
export const ANONYMOUS_USER_ID = "anonymous-user";

// ============================================
// TTS Configuration
// ============================================

export const TTS_MODE: TTSMode = (process.env.TTS_MODE as TTSMode) || "browser";
export const USE_BROWSER_TTS = TTS_MODE === "browser";
export const USE_LOCAL_TTS = TTS_MODE === "local";

// ============================================
// Mock Configuration
// ============================================

export const mockConfig = {
  enabled: MOCK_ENABLED,
  location: MOCK_LOCATION,
};

/**
 * Get location (use mock if enabled, otherwise use provided location)
 */
export function getLocation(providedLocation?: Location): Location | undefined {
  const mockLoc = getMockLocation();
  if (mockLoc) {
    return { lat: mockLoc.lat, lng: mockLoc.lng };
  }
  return providedLocation;
}

/**
 * Log startup information
 */
export function logStartupInfo(): void {
  if (MOCK_ENABLED) {
    console.log(
      `Mock mode enabled: location=${MOCK_LOCATION.name} (${MOCK_LOCATION.lat}, ${MOCK_LOCATION.lng})`
    );
  }

  const ttsInfo = USE_BROWSER_TTS
    ? "Browser (Web Speech API) - <50ms"
    : USE_LOCAL_TTS
      ? "Local (Edge TTS) - 50-200ms"
      : "Qwen API - 500-2000ms";
  console.log(`TTS Service: ${ttsInfo} per sentence`);
}
