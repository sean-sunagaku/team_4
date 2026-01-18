import { RouteInfo } from '../hooks/useNavigation'
import './NavigationPanel.css'

interface NavigationPanelProps {
  routeInfo: RouteInfo | null
  onStopNavigation: () => void
}

const NavigationPanel = ({ routeInfo, onStopNavigation }: NavigationPanelProps) => {
  return (
    <div className="navigation-panel">
      <div className="navigation-panel-content">
        <div className="navigation-header">
          {/* <h2 className="navigation-title">ナビゲーション中</h2> */}
          <button onClick={onStopNavigation} className="stop-button">
            <span className="stop-icon">⏹</span>
            停止
          </button>
        </div>

        {routeInfo && (
          <div className="route-info">
            <div className="info-card">
              <div className="info-item">
                <span className="info-label">距離</span>
                <span className="info-value">{routeInfo.distance}</span>
              </div>
              <div className="info-item">
                <span className="info-label">所要時間</span>
                <span className="info-value">{routeInfo.duration}</span>
              </div>
            </div>

            <div className="steps-section">
              <h3 className="steps-title">ルート案内</h3>
              <div className="steps-list">
                {routeInfo.steps.map((step, index) => (
                  <div key={index} className="step-item">
                    <span className="step-number">{index + 1}</span>
                    <span className="step-text" dangerouslySetInnerHTML={{ __html: step }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default NavigationPanel
