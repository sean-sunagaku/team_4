/**
 * Mock Data for Testing
 *
 * このファイルで位置情報や車ブランドなどのモックデータを定義します。
 * テスト時はこのファイルの値が使用されます。
 */

// ============================================
// Mock Configuration
// ============================================

/**
 * モック機能を有効にするかどうか
 * true: モックデータを使用
 * false: 実際のデータを使用
 */
export const MOCK_ENABLED = true;

// ============================================
// Mock Location
// ============================================

export interface MockLocation {
  lat: number;
  lng: number;
  name: string; // 場所の名前（ログ用）
}

/**
 * 現在地のモックデータ
 * MOCK_ENABLED が true の場合、この位置情報が使用されます
 */
export const MOCK_LOCATION: MockLocation = {
  lat: 35.6762,    // 東京駅
  lng: 139.6503,
  name: '東京駅付近',
};

// 他の場所のプリセット（必要に応じて切り替え可能）
export const MOCK_LOCATIONS = {
  tokyo: { lat: 35.6762, lng: 139.6503, name: '東京駅' },
  shibuya: { lat: 35.6580, lng: 139.7016, name: '渋谷駅' },
  osaka: { lat: 34.7024, lng: 135.4959, name: '大阪駅' },
  nagoya: { lat: 35.1709, lng: 136.8815, name: '名古屋駅' },
  fukuoka: { lat: 33.5902, lng: 130.4017, name: '博多駅' },
};

// ============================================
// Mock Car Brands
// ============================================

/**
 * 車ブランドのモックデータ
 * Web検索なしで車情報を返すためのサンプルデータ
 */
export const MOCK_CAR_DATA = {
  // トヨタ
  'プリウス': {
    brand: 'トヨタ',
    model: 'プリウス',
    fuelEfficiency: '32.6 km/L (WLTCモード)',
    price: '2,750,000円〜3,920,000円',
    bodyType: 'ハッチバック',
    features: ['ハイブリッドシステム', 'Toyota Safety Sense', '大容量荷室'],
  },
  'カローラ': {
    brand: 'トヨタ',
    model: 'カローラ',
    fuelEfficiency: '25.3 km/L (WLTCモード)',
    price: '2,010,000円〜2,990,000円',
    bodyType: 'セダン',
    features: ['低燃費', 'コンパクト', 'Toyota Safety Sense'],
  },
  'アクア': {
    brand: 'トヨタ',
    model: 'アクア',
    fuelEfficiency: '35.8 km/L (WLTCモード)',
    price: '1,997,000円〜2,598,000円',
    bodyType: 'コンパクト',
    features: ['クラストップレベルの燃費', 'コンパクトボディ'],
  },
  // ホンダ
  'フィット': {
    brand: 'ホンダ',
    model: 'フィット',
    fuelEfficiency: '29.4 km/L (WLTCモード)',
    price: '1,592,800円〜2,664,200円',
    bodyType: 'コンパクト',
    features: ['広い室内空間', 'Honda SENSING'],
  },
  'ヴェゼル': {
    brand: 'ホンダ',
    model: 'ヴェゼル',
    fuelEfficiency: '24.8 km/L (WLTCモード)',
    price: '2,279,200円〜3,298,900円',
    bodyType: 'SUV',
    features: ['スタイリッシュデザイン', 'e:HEV', 'Honda SENSING'],
  },
  // 日産
  'リーフ': {
    brand: '日産',
    model: 'リーフ',
    fuelEfficiency: '電費 155Wh/km',
    price: '4,081,000円〜5,832,200円',
    bodyType: '電気自動車',
    features: ['100%電気自動車', 'プロパイロット', 'e-Pedal'],
  },
  'ノート': {
    brand: '日産',
    model: 'ノート',
    fuelEfficiency: '28.4 km/L (WLTCモード)',
    price: '2,029,500円〜2,954,600円',
    bodyType: 'コンパクト',
    features: ['e-POWER', '広い室内', 'プロパイロット'],
  },
  // テスラ
  'モデル3': {
    brand: 'テスラ',
    model: 'Model 3',
    fuelEfficiency: '電費 147Wh/km',
    price: '5,314,000円〜6,914,000円',
    bodyType: 'セダン (電気自動車)',
    features: ['長距離航続', 'オートパイロット', 'OTAアップデート'],
  },
};

// ============================================
// Mock Dealers (近くの店舗)
// ============================================

export interface MockDealer {
  name: string;
  brand: string;
  address: string;
  phone: string;
  distance: string;
}

/**
 * 近くの販売店のモックデータ
 */
export const MOCK_DEALERS: MockDealer[] = [
  {
    name: 'トヨタモビリティ東京 東京店',
    brand: 'トヨタ',
    address: '東京都千代田区丸の内1-9-2',
    phone: '03-1234-5678',
    distance: '0.3km',
  },
  {
    name: 'Honda Cars 東京中央',
    brand: 'ホンダ',
    address: '東京都中央区銀座7-4-5',
    phone: '03-2345-6789',
    distance: '0.8km',
  },
  {
    name: '日産プリンス東京 銀座店',
    brand: '日産',
    address: '東京都中央区銀座4-2-15',
    phone: '03-3456-7890',
    distance: '1.2km',
  },
];

// ============================================
// Helper Functions
// ============================================

/**
 * 現在地を取得（モック有効時はモック位置を返す）
 */
export function getMockLocation(): MockLocation | null {
  if (MOCK_ENABLED) {
    return MOCK_LOCATION;
  }
  return null;
}

/**
 * 車情報を取得（モック有効時はモックデータを返す）
 */
export function getMockCarData(modelName: string): typeof MOCK_CAR_DATA[keyof typeof MOCK_CAR_DATA] | null {
  if (!MOCK_ENABLED) return null;

  // 部分一致で検索
  for (const [key, value] of Object.entries(MOCK_CAR_DATA)) {
    if (modelName.includes(key) || key.includes(modelName)) {
      return value;
    }
  }
  return null;
}

/**
 * 近くの販売店を取得（モック有効時はモックデータを返す）
 */
export function getMockDealers(brand?: string): MockDealer[] {
  if (!MOCK_ENABLED) return [];

  if (brand) {
    return MOCK_DEALERS.filter(d => d.brand.includes(brand) || brand.includes(d.brand));
  }
  return MOCK_DEALERS;
}
