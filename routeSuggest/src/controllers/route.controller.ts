/**
 * ルートコントローラー
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { suggestRoute } from '../services/route.service.js';
import { validateBody } from '../middleware/validation.js';
import { RouteSuggestRequestSchema, type RouteSuggestRequest, type RouteSuggestResponse } from '../types/api.js';
import { logger } from '../utils/logger.js';

export const routeRouter = Router();

/**
 * POST /api/v1/routes/suggest
 * ルート提案エンドポイント
 */
routeRouter.post(
  '/suggest',
  validateBody(RouteSuggestRequestSchema),
  async (
    req: Request<unknown, unknown, RouteSuggestRequest>,
    res: Response<RouteSuggestResponse>,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { origin, practiceType, constraints } = req.body;

      logger.info({ origin, practiceType }, 'Route suggestion request received');

      const suggestion = await suggestRoute({
        origin,
        practiceType,
        constraints,
      });

      const response: RouteSuggestResponse = {
        success: true,
        data: suggestion,
      };

      res.json(response);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/routes/health
 * ヘルスチェックエンドポイント
 */
routeRouter.get('/health', (_req: Request, res: Response): void => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * POST /api/v1/routes/test-google
 * Google Maps API疎通テスト用エンドポイント（AIをスキップ）
 * 検索結果の最初の施設を目的地として使用
 */
import { geocodeAddress } from '../services/geocoding.service.js';
import { searchNearbyPlaces } from '../services/places.service.js';
import { generateGoogleMapsUrl } from '../services/url.service.js';
import { getSearchConfig } from '../config/searchAssets.js';

routeRouter.post(
  '/test-google',
  validateBody(RouteSuggestRequestSchema),
  async (
    req: Request<unknown, unknown, RouteSuggestRequest>,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { origin, practiceType, constraints } = req.body;

      logger.info({ origin, practiceType }, '[TEST] Google Maps API test request');

      // Step 1: Geocoding（住所→座標）
      const geocodingResult = await geocodeAddress(origin);
      logger.info({ geocodingResult }, '[TEST] Geocoding成功');

      // Step 2: Places検索
      const searchConfig = getSearchConfig(practiceType);
      const candidates = await searchNearbyPlaces(
        geocodingResult.location,
        searchConfig
      );
      logger.info({ candidateCount: candidates.length }, '[TEST] Places検索成功');

      if (candidates.length === 0) {
        res.json({
          success: true,
          message: 'Google APIs疎通OK（ただし周辺施設が見つかりませんでした）',
          data: {
            geocoding: geocodingResult,
            placesCount: 0,
          },
        });
        return;
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
        constraints,
      });

      res.json({
        success: true,
        message: 'Google Maps API疎通テスト成功！',
        data: {
          geocoding: {
            inputAddress: origin,
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
        },
      });
    } catch (error) {
      next(error);
    }
  }
);
