/**
 * 練習タイプ定義
 */

export const PRACTICE_TYPES = [
  'BACK_PARKING',
  'BASIC_START_STOP',
  'U_TURN',
  'INTERSECTION_TURN',
  'MERGE_LANECHANGE',
  'NARROW_ROAD',
] as const;

export type PracticeType = (typeof PRACTICE_TYPES)[number];

export const PRACTICE_TYPE_LABELS: Record<PracticeType, string> = {
  BACK_PARKING: 'バック駐車',
  BASIC_START_STOP: '基本発進・停止',
  U_TURN: 'Uターン',
  INTERSECTION_TURN: '交差点右左折',
  MERGE_LANECHANGE: '合流・車線変更',
  NARROW_ROAD: '狭路走行',
};

export const PRACTICE_TYPE_DESCRIPTIONS: Record<PracticeType, string> = {
  BACK_PARKING: '駐車場でのバック駐車練習',
  BASIC_START_STOP: '安全な場所での発進・停止の練習',
  U_TURN: 'Uターンの練習',
  INTERSECTION_TURN: '交差点での右左折練習',
  MERGE_LANECHANGE: '道路での合流・車線変更練習',
  NARROW_ROAD: '狭い道での走行練習',
};
