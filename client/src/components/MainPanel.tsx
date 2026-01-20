import { useState } from 'react'
import './MainPanel.css'

type Mode = 'practice' | 'drowsiness' | 'translation'

interface MainPanelProps {
  onModeSelect: (mode: Mode) => void
}

const MainPanel = ({ onModeSelect }: MainPanelProps) => {
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null)

  const handleModeClick = (mode: Mode) => {
    setSelectedMode(mode)
    onModeSelect(mode)
  }

  return (
    <div className="main-panel-wrapper">
      {/* メニューパネル */}
      <div className="main-panel">
        <h1 className="app-logo">DriBuddy</h1>

        <div className="mode-grid">
          {/* 練習 - ハンドルアイコン */}
          <button
            className={`mode-card ${selectedMode === 'practice' ? 'selected' : ''}`}
            onClick={() => handleModeClick('practice')}
          >
            <span className="mode-label">練習</span>
            <div className="mode-icon">
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* ハンドル外枠 */}
                <circle cx="32" cy="32" r="26" stroke="#333" strokeWidth="4" fill="none"/>
                {/* 中心 */}
                <circle cx="32" cy="32" r="6" fill="#333"/>
                {/* スポーク3本 */}
                <line x1="32" y1="26" x2="32" y2="10" stroke="#333" strokeWidth="4" strokeLinecap="round"/>
                <line x1="27" y1="35" x2="14" y2="46" stroke="#333" strokeWidth="4" strokeLinecap="round"/>
                <line x1="37" y1="35" x2="50" y2="46" stroke="#333" strokeWidth="4" strokeLinecap="round"/>
              </svg>
            </div>
          </button>

          {/* 居眠り防止 - 人物アイコン */}
          <button
            className={`mode-card ${selectedMode === 'drowsiness' ? 'selected' : ''}`}
            onClick={() => handleModeClick('drowsiness')}
          >
            <span className="mode-label">居眠り防止</span>
            <div className="mode-icon person-icon">
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* 髪の毛 */}
                <path d="M20 28c0-8 5-14 12-14s12 6 12 14" fill="#333"/>
                {/* 顔 */}
                <ellipse cx="32" cy="32" rx="11" ry="12" fill="#FFE4C4"/>
                {/* 髪の前髪 */}
                <path d="M21 28c0-6 5-10 11-10s11 4 11 10c0 2-1 3-2 3H23c-1 0-2-1-2-3z" fill="#333"/>
                {/* 目 */}
                <ellipse cx="27" cy="34" rx="1.5" ry="2" fill="#333"/>
                <ellipse cx="37" cy="34" rx="1.5" ry="2" fill="#333"/>
                {/* 口 */}
                <path d="M29 40c1.5 1.5 4.5 1.5 6 0" stroke="#333" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                {/* 体 */}
                <path d="M20 58c0-7 5-12 12-12s12 5 12 12" fill="#4A9EFF"/>
              </svg>
            </div>
          </button>

          {/* 翻訳 - A/あアイコン */}
          <button
            className={`mode-card ${selectedMode === 'translation' ? 'selected' : ''}`}
            onClick={() => handleModeClick('translation')}
          >
            <span className="mode-label">翻訳</span>
            <div className="mode-icon">
              <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <text x="8" y="32" fontSize="22" fontWeight="bold" fill="#333" fontFamily="Arial">A</text>
                <text x="32" y="52" fontSize="18" fontWeight="bold" fill="#333" fontFamily="sans-serif">あ</text>
                <path d="M26 18l4 12" stroke="#333" strokeWidth="2" strokeLinecap="round"/>
                <path d="M42 36l-8 8" stroke="#333" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2"/>
              </svg>
            </div>
          </button>

          {/* プレースホルダー */}
          <div className="mode-card-placeholder"></div>
          <div className="mode-card-placeholder"></div>
          <div className="mode-card-placeholder"></div>
        </div>
      </div>

      {/* 車の画像パネル */}
      <div className="car-panel">
        <img
          src="/prius-image.png"
          alt="Toyota Prius"
          className="car-image"
        />
      </div>
    </div>
  )
}

export default MainPanel
