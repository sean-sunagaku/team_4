type MissionListPanelProps = {
  steps: string[]
}

const MissionListPanel = ({ steps }: MissionListPanelProps) => {
  if (steps.length === 0) return null

  return (
    <div className="mission-list-panel">
      <h2 className="mission-list-title">ミッションリスト</h2>
      <ul className="mission-list">
        {steps.map((step, index) => (
          <li key={index} className="mission-item">
            {step}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default MissionListPanel
