import { useState } from 'react'
import './NavigationStartModal.css'

// 練習タイプの定義
export const PRACTICE_TYPES = [
  "BACK_PARKING",
  "BASIC_START_STOP",
  "U_TURN",
  "INTERSECTION_TURN",
  "MERGE_LANECHANGE",
  "NARROW_ROAD",
] as const

export type PracticeType = (typeof PRACTICE_TYPES)[number]

export const PRACTICE_TYPE_LABELS: Record<PracticeType, string> = {
  BACK_PARKING: "バック駐車",
  BASIC_START_STOP: "基本発進・停止",
  U_TURN: "Uターン",
  INTERSECTION_TURN: "交差点右左折",
  MERGE_LANECHANGE: "合流・車線変更",
  NARROW_ROAD: "狭路走行",
}

export interface NavigationFormData {
  departure: string      // 出発地点
  practiceType: PracticeType  // 練習タイプ
}

interface NavigationStartModalProps {
  isOpen: boolean
  onClose: () => void
  onStartNavigation: (formData: NavigationFormData) => void
}

interface LocationData {
  latitude: number
  longitude: number
  accuracy: number
  city: string
  region: string
}

const NavigationStartModal = ({
  isOpen,
  onClose,
  onStartNavigation,
}: NavigationStartModalProps) => {
  const [formData, setFormData] = useState<NavigationFormData>({
    departure: '',
    practiceType: 'INTERSECTION_TURN'
  })
  const [isLoadingLocation, setIsLoadingLocation] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)

  const handleInputChange = (field: keyof NavigationFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const getLocation = async (): Promise<LocationData> => {
    const res = await fetch('https://ipapi.co/json/')
    const data = await res.json()
    return {
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy: 5000,
      city: data.city,
      region: data.region,
    }
  }

  const handleGetCurrentLocation = async () => {
    setIsLoadingLocation(true)
    setLocationError(null)
    try {
      const location = await getLocation()
      const locationString = `${location.latitude}, ${location.longitude}`
      setFormData(prev => ({ ...prev, departure: locationString }))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '不明なエラー'
      setLocationError('位置情報の取得に失敗しました: ' + errorMessage)
    } finally {
      setIsLoadingLocation(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onStartNavigation(formData)
  }

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="navigation-start-modal">
        <div className="modal-header">
          <h2 className="modal-title">ナビゲーション設定</h2>
          <button onClick={onClose} className="modal-close-button" aria-label="閉じる">
            <span>×</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label className="form-label">出発地点</label>
            <div className="departure-input-container">
              <input
                type="text"
                className="form-input"
                value={formData.departure}
                onChange={(e) => handleInputChange('departure', e.target.value)}
                placeholder="現在地または出発地点を入力"
              />
              <button
                type="button"
                className="get-location-button"
                onClick={handleGetCurrentLocation}
                disabled={isLoadingLocation}
              >
                {isLoadingLocation ? '取得中...' : '現在地を取得'}
              </button>
            </div>
            {locationError && (
              <p className="location-error">{locationError}</p>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">練習項目</label>
            <select
              className="form-input form-select"
              value={formData.practiceType}
              onChange={(e) => handleInputChange('practiceType', e.target.value)}
            >
              {PRACTICE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {PRACTICE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="cancel-button">
              キャンセル
            </button>
            <button type="submit" className="start-button">
              ナビゲーション開始
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default NavigationStartModal
