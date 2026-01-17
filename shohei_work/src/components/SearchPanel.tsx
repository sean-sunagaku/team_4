import { useState } from 'react'
import './SearchPanel.css'

interface SearchPanelProps {
  onSearch: (address: string) => void
  onGetCurrentLocation: () => void
  isLocationLoading: boolean
  destination: string
  onDestinationChange: (destination: string) => void
  onStartNavigation: () => void
}

const SearchPanel = ({
  onSearch,
  onGetCurrentLocation,
  isLocationLoading,
  destination,
  onDestinationChange,
  onStartNavigation,
}: SearchPanelProps) => {
  const [searchQuery, setSearchQuery] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      onSearch(searchQuery.trim())
      onDestinationChange(searchQuery.trim())
    }
  }

  return (
    <div className="search-panel">
      <div className="search-panel-content">
        <h2 className="panel-title">目的地を検索</h2>
        
        <form onSubmit={handleSubmit} className="search-form">
          <div className="input-group">
            <input
              type="text"
              placeholder="住所または場所を入力"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            <button type="submit" className="search-button">
              <span className="search-icon">🔍</span>
            </button>
          </div>
        </form>

        <div className="button-group">
          <button
            onClick={onGetCurrentLocation}
            disabled={isLocationLoading}
            className="location-button"
          >
            {isLocationLoading ? (
              <>
                <span className="spinner"></span>
                取得中...
              </>
            ) : (
              <>
                <span className="location-icon">📍</span>
                現在地を取得
              </>
            )}
          </button>

          {destination && (
            <button onClick={onStartNavigation} className="start-button">
              <span className="nav-icon">🚗</span>
              ナビゲーション開始
            </button>
          )}
        </div>

        {destination && (
          <div className="destination-info">
            <p className="destination-label">目的地:</p>
            <p className="destination-text">{destination}</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default SearchPanel
