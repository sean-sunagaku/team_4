import { useState } from 'react'
import './DrivingSupportPanel.css'

const naviIcon = new URL('../icon/navi_icon.png', import.meta.url).href

interface DrivingSupportPanelProps {
  onStartNavigation?: () => void
  isNavigating?: boolean
}

const DrivingSupportPanel = ({ onStartNavigation, isNavigating }: DrivingSupportPanelProps) => {
  const [isOpen, setIsOpen] = useState(true)
  
  // ナビゲーション中は非表示
  if (isNavigating) {
    return null
  }
  
  const supportItems = [
    '基本の車内操作',
    '右折と左折',
    '低速での車両感覚',
    '左寄せと巻き込み確認',
    'コンビニ駐車',
    '車線変更と合流',
    '路側帯への停車・路駐',
  ]

  return (
    <>
      {onStartNavigation && (
        <button 
          onClick={onStartNavigation}
          className="start-navigation-button"
        >
          <img src={naviIcon} alt="ナビゲーション開始" className="nav-icon-image" />
        </button>
      )}
      <div className={`driving-support-panel ${isOpen ? 'open' : 'closed'}`}>
        <div className="support-header">
          <h2 className="support-title">運転サポート</h2>
          <button 
            onClick={() => setIsOpen(!isOpen)} 
            className="toggle-button"
            aria-label={isOpen ? '閉じる' : '開く'}
          >
            <span className={`toggle-icon ${isOpen ? 'open' : 'closed'}`}>
              {isOpen ? '▼' : '▲'}
            </span>
          </button>
        </div>
        {isOpen && (
          <ul className="support-list">
            {supportItems.map((item, index) => (
              <li key={index} className="support-item">
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

export default DrivingSupportPanel
