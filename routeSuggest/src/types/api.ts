/**
 * API リクエスト/レスポンス型定義
 */

import { z } from 'zod';
import { PRACTICE_TYPES } from './practice.js';
import type { RouteSuggestion } from './route.js';

// リクエストスキーマ
export const RouteSuggestRequestSchema = z.object({
  origin: z.string().min(1, '出発地点は必須です'),
  practiceType: z.enum(PRACTICE_TYPES, {
    errorMap: () => ({ message: '無効な練習タイプです' }),
  }),
  constraints: z
    .object({
      avoidHighways: z.boolean().optional(),
      avoidTolls: z.boolean().optional(),
    })
    .optional(),
});

export type RouteSuggestRequest = z.infer<typeof RouteSuggestRequestSchema>;

// レスポンス型
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type RouteSuggestResponse = ApiResponse<RouteSuggestion>;

// AIレスポンススキーマ
export const AIRouteSelectionSchema = z.object({
  waypointIds: z
    .array(z.string())
    .min(0)
    .max(2, '経由地は最大2箇所までです'),
  destinationId: z.string().min(1, '目的地は必須です'),
  steps: z.array(z.string()).min(1, 'ステップは1つ以上必要です'),
  notes: z.array(z.string()),
});

export type AIRouteSelectionResponse = z.infer<typeof AIRouteSelectionSchema>;
