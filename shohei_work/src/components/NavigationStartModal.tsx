import { useState } from 'react'
import './NavigationStartModal.css'

export interface NavigationFormData {
  departure: string      // 出発地点
  weakPoints: string     // 苦手項目
}

interface NavigationStartModalProps {
  isOpen: boolean
  onClose: () => void
  onStartNavigation: (formData: NavigationFormData) => void
}

const NavigationStartModal = ({
  isOpen,
  onClose,
  onStartNavigation,
}: NavigationStartModalProps) => {
  const [formData, setFormData] = useState<NavigationFormData>({
    departure: '',
    weakPoints: ''
  })

  const handleInputChange = (field: keyof NavigationFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
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
            <input
              type="text"
              className="form-input"
              value={formData.departure}
              onChange={(e) => handleInputChange('departure', e.target.value)}
              placeholder="現在地または出発地点を入力"
            />
          </div>

          <div className="form-group">
            <label className="form-label">苦手項目</label>
            <input
              type="text"
              className="form-input"
              value={formData.weakPoints}
              onChange={(e) => handleInputChange('weakPoints', e.target.value)}
              placeholder="例: 右折、車線変更、駐車"
            />
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
