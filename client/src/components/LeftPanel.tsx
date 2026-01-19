import AIChatButton from './aiChat/AIChatButton'
import DrivingSupportPanel from './DrivingSupportPanel'
import MissionListPanel from './MissionListPanel'

type LeftPanelProps = {
  isNavigating: boolean
  missionSteps: string[]
  onStartNavigation: () => void
}

const LeftPanel = ({ isNavigating, missionSteps, onStartNavigation }: LeftPanelProps) => {
  if (!isNavigating) {
    return (
      <div className="left-panel w-full">
        <MissionListPanel steps={missionSteps} />
        <DrivingSupportPanel onStartNavigation={onStartNavigation} isNavigating={isNavigating} />
      </div>
    )
  }

  return (
    <div className="left-panel w-full">
      <MissionListPanel steps={missionSteps} />
      <div className="ai-consult-card">
        <div className="ai-consult-title">AIに相談（音声）</div>
        <div className="ai-consult-subtitle">運転中の疑問を話しかけてください</div>
        <div className="ai-consult-action">
          <AIChatButton autoStart={isNavigating} placement="inline" alwaysListen={true} />
        </div>
      </div>
      <DrivingSupportPanel onStartNavigation={onStartNavigation} isNavigating={isNavigating} />
    </div>
  )
}

export default LeftPanel
