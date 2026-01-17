/**
 * カスタムエラークラス
 */

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'GEOCODING_ERROR'
  | 'PLACES_API_ERROR'
  | 'AI_SERVICE_ERROR'
  | 'ROUTE_GENERATION_ERROR'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    code: ErrorCode,
    statusCode: number = 500,
    details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError(message, 'VALIDATION_ERROR', 400, details);
  }

  static geocoding(message: string, details?: unknown): AppError {
    return new AppError(message, 'GEOCODING_ERROR', 400, details);
  }

  static placesApi(message: string, details?: unknown): AppError {
    return new AppError(message, 'PLACES_API_ERROR', 502, details);
  }

  static aiService(message: string, details?: unknown): AppError {
    return new AppError(message, 'AI_SERVICE_ERROR', 502, details);
  }

  static routeGeneration(message: string, details?: unknown): AppError {
    return new AppError(message, 'ROUTE_GENERATION_ERROR', 500, details);
  }

  static internal(message: string, details?: unknown): AppError {
    return new AppError(message, 'INTERNAL_ERROR', 500, details);
  }
}
