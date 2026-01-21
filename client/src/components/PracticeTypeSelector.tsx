import './PracticeTypeSelector.css'

export type PracticeType =
  | 'U_TURN'
  | 'INTERSECTION_TURN'
  | 'NARROW_ROAD'
  | 'BACK_PARKING'
  | 'BASIC_START_STOP'
  | 'MERGE_LANECHANGE'

interface PracticeTypeSelectorProps {
  onSelect: (type: PracticeType) => void
  onClose: () => void
}

const PRACTICE_OPTIONS: { type: PracticeType; label: string; icon: JSX.Element }[] = [
  {
    type: 'U_TURN',
    label: 'Uターン',
    icon: <img src="/U-turn.svg" alt="Uターン" />,
  },
  {
    type: 'INTERSECTION_TURN',
    label: '交差点',
    icon: <img src="/Intersection.svg" alt="交差点" />,
  },
  {
    type: 'NARROW_ROAD',
    label: '細い道',
    icon: <img src="/narrow-road.svg" alt="細い道" />,
  },
  {
    type: 'BACK_PARKING',
    label: '駐車',
    icon: <img src="/Parking.svg" alt="駐車" />,
  },
  {
    type: 'BASIC_START_STOP',
    label: '発進・停車',
    icon: <img src="/Start&Stop.svg" alt="発進・停車" />,
  },
  {
    type: 'MERGE_LANECHANGE',
    label: '合流',
    icon: <img src="/Confluence.svg" alt="合流" />,
  },
]

const PracticeTypeSelector = ({ onSelect, onClose }: PracticeTypeSelectorProps) => {
  return (
    <div className="practice-selector-overlay" onClick={onClose}>
      <div className="practice-selector-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="practice-selector-title">苦手ポイントを選択してください</h2>

        <div className="practice-grid">
          {PRACTICE_OPTIONS.map((option) => (
            <button
              key={option.type}
              className="practice-option"
              onClick={() => onSelect(option.type)}
            >
              <div className="practice-icon">{option.icon}</div>
              <span className="practice-label">{option.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default PracticeTypeSelector
