import { useState } from 'react'
import './MainPanel.css'
import ManualPanel from './ManualPanel'

type Mode = 'practice' | 'drowsiness' | 'translation'

interface MainPanelProps {
  onModeSelect: (mode: Mode) => void
}

const MainPanel = ({ onModeSelect }: MainPanelProps) => {
  const [selectedMode, setSelectedMode] = useState<Mode | null>(null)
  const [isManualOpen, setIsManualOpen] = useState(false)

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
              <img src="/Handle.svg" alt="ハンドル" />
            </div>
          </button>

          {/* 居眠り防止 - 人物アイコン */}
          <button
            className={`mode-card ${selectedMode === 'drowsiness' ? 'selected' : ''}`}
            onClick={() => handleModeClick('drowsiness')}
          >
            <span className="mode-label">居眠り防止</span>
            <div className="mode-icon">
              <img src="/No-sleep.svg" alt="居眠り防止" />
            </div>
          </button>

          {/* 翻訳 - A/あアイコン */}
          <button
            className={`mode-card ${selectedMode === 'translation' ? 'selected' : ''}`}
            onClick={() => handleModeClick('translation')}
          >
            <span className="mode-label">翻訳</span>
            <div className="mode-icon">
              <img src="/Translate.svg" alt="翻訳" />
            </div>
          </button>

          {/* マニュアル - 本アイコン */}
          <button
            className="mode-card"
            onClick={() => setIsManualOpen(true)}
          >
            <span className="mode-label">マニュアル</span>
            <div className="mode-icon">
              <img src="/Manual.svg" alt="マニュアル" />
            </div>
          </button>

          {/* プレースホルダー */}
          <div className="mode-card-placeholder"></div>
          <div className="mode-card-placeholder"></div>
        </div>
      </div>

      {/* マニュアルパネル */}
      <ManualPanel isOpen={isManualOpen} onClose={() => setIsManualOpen(false)} />
    </div>
  )
}

export default MainPanel
