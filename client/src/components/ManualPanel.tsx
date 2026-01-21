import { useState } from 'react'
import './ManualPanel.css'
import { aiManualData, AIManualItem } from '../data/aiManualData'

interface ManualPanelProps {
  isOpen: boolean
  onClose: () => void
}

const ManualPanel = ({ isOpen, onClose }: ManualPanelProps) => {
  const [selectedItem, setSelectedItem] = useState<AIManualItem | null>(null)

  if (!isOpen) return null

  const handleItemClick = (item: AIManualItem) => {
    setSelectedItem(item)
  }

  const handleBack = () => {
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
      if (line.startsWith('# ')) {
        flushList()
        // タイトルは表示しない（ヘッダーで表示済み）
      } else if (line.startsWith('## ')) {
        flushList()
        elements.push(<h3 key={key++} className="manual-section-title">{line.replace('## ', '')}</h3>)
      } else if (/^\s*- /.test(line)) {
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
    <div className="manual-panel-overlay" onClick={onClose}>
      <div className="manual-panel-container" onClick={(e) => e.stopPropagation()}>
        <div className="manual-panel-header">
          {selectedItem ? (
            <>
              <button className="manual-back-button" onClick={handleBack}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <h2 className="manual-panel-title">{selectedItem.title}</h2>
            </>
          ) : (
            <h2 className="manual-panel-title">運転マニュアル</h2>
          )}
          <button className="manual-close-button" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <div className="manual-panel-content">
          {selectedItem ? (
            <div className="manual-detail-view">
              {renderContent(selectedItem.content)}
            </div>
          ) : (
            <div className="manual-list-view">
              {aiManualData.map((item) => (
                <button
                  key={item.id}
                  className="manual-item-button"
                  onClick={() => handleItemClick(item)}
                >
                  <span className="manual-item-title">{item.title}</span>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ManualPanel
