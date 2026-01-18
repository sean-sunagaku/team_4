import { useState } from 'react'
import './DrivingSupportPanel.css'
import { manualData, ManualItem } from '../data/manualData'

const naviIcon = new URL('../icon/navi_icon.png', import.meta.url).href

interface DrivingSupportPanelProps {
  onStartNavigation?: () => void
  isNavigating?: boolean
}

const DrivingSupportPanel = ({ onStartNavigation, isNavigating }: DrivingSupportPanelProps) => {
  const [isOpen, setIsOpen] = useState(true)
  const [selectedItem, setSelectedItem] = useState<ManualItem | null>(null)

  const handleItemClick = (item: ManualItem) => {
    setSelectedItem(item)
  }

  const handleCloseDetail = () => {
    setSelectedItem(null)
  }

  // Markdown風のテキストをシンプルなHTMLに変換
  const renderContent = (content: string) => {
    const lines = content.split('\n')
    const elements: JSX.Element[] = []
    let currentList: { text: string; level: number }[] = []
    let key = 0

    const flushList = () => {
      if (currentList.length > 0) {
        elements.push(
          <ul key={key++} className="manual-list">
            {currentList.map((item, i) => (
              <li key={i} className={`list-item level-${item.level}`}>{item.text}</li>
            ))}
          </ul>
        )
        currentList = []
      }
    }

    lines.forEach((line) => {
      if (line.startsWith('## ')) {
        flushList()
        elements.push(<h3 key={key++} className="manual-section-title">{line.replace('## ', '')}</h3>)
      } else if (/^\s*- /.test(line)) {
        // インデントされたリストも検出
        const indent = line.match(/^(\s*)- /)?.[1]?.length || 0
        const level = Math.floor(indent / 2)
        const text = line.replace(/^\s*- /, '')
        currentList.push({ text, level })
      } else if (/^\d+\. /.test(line)) {
        flushList()
        elements.push(<p key={key++} className="manual-step">{line}</p>)
      } else if (line.includes('|') && line.includes('---')) {
        // テーブル区切り行は無視
      } else if (line.includes('|')) {
        // テーブル行
        const cells = line.split('|').filter(c => c.trim())
        if (cells.length > 0) {
          elements.push(
            <div key={key++} className="manual-table-row">
              {cells.map((cell, i) => (
                <span key={i} className="manual-table-cell">{cell.trim()}</span>
              ))}
            </div>
          )
        }
      } else if (line.trim() !== '') {
        flushList()
        elements.push(<p key={key++} className="manual-text">{line}</p>)
      }
    })

    flushList()
    return elements
  }

  return (
    <>
      {onStartNavigation && !isNavigating && (
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
            {manualData.map((item) => (
              <li
                key={item.id}
                className="support-item"
                onClick={() => handleItemClick(item)}
              >
                {item.title}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 詳細モーダル */}
      {selectedItem && (
        <div className="manual-detail-overlay" onClick={handleCloseDetail}>
          <div className="manual-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="manual-detail-header">
              <h2 className="manual-detail-title">{selectedItem.title}</h2>
              <button className="manual-close-button" onClick={handleCloseDetail}>
                ×
              </button>
            </div>
            <div className="manual-detail-content">
              {renderContent(selectedItem.content)}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default DrivingSupportPanel
