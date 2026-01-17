/**
 * Express アプリケーション設定
 */

import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { routeRouter } from './controllers/route.controller.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';

export function createApp(): Express {
  const app = express();

  // セキュリティミドルウェア
  app.use(helmet());
  app.use(cors());

  // リクエストパーサー
  app.use(express.json());

  // リクエストロギング
  app.use((req, _res, next) => {
    logger.debug({ method: req.method, path: req.path }, 'Request received');
    next();
  });

  // ルート登録
  app.use('/api/v1/routes', routeRouter);

  // ルートヘルスチェック
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // 404ハンドラー
  app.use(notFoundHandler);

  // エラーハンドラー
  app.use(errorHandler);

  return app;
}
