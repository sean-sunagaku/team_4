/**
 * リクエスト検証ミドルウェア
 */

import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';

/**
 * Zodスキーマでリクエストボディを検証するミドルウェアを生成
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = formatZodErrors(result.error);
      const error = AppError.validation('リクエストの検証に失敗しました', errors);
      next(error);
      return;
    }

    req.body = result.data;
    next();
  };
}

/**
 * Zodエラーを読みやすい形式に変換
 */
function formatZodErrors(error: ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'root';
    if (!errors[path]) {
      errors[path] = [];
    }
    errors[path].push(issue.message);
  }

  return errors;
}
