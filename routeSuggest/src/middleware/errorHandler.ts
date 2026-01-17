/**
 * エラーハンドリングミドルウェア
 */

import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { AppError } from '../errors/AppError.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import type { ApiResponse } from '../types/api.js';

/**
 * グローバルエラーハンドラー
 */
export const errorHandler: ErrorRequestHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // AppErrorの場合
  if (err instanceof AppError) {
    logger.warn(
      { code: err.code, message: err.message, details: err.details },
      'Application error'
    );

    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: env.NODE_ENV === 'development' ? err.details : undefined,
      },
    };

    res.status(err.statusCode).json(response);
    return;
  }

  // 予期しないエラー
  logger.error({ err }, 'Unexpected error');

  const response: ApiResponse<never> = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: '予期しないエラーが発生しました',
      details:
        env.NODE_ENV === 'development'
          ? { message: err.message, stack: err.stack }
          : undefined,
    },
  };

  res.status(500).json(response);
};

/**
 * 404ハンドラー
 */
export function notFoundHandler(req: Request, res: Response): void {
  const response: ApiResponse<never> = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `エンドポイントが見つかりません: ${req.method} ${req.path}`,
    },
  };

  res.status(404).json(response);
}
