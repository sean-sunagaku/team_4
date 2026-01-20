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
    icon: (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M20 52V28a16 16 0 1132 0v8"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M44 28l8 8-8 8"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    type: 'INTERSECTION_TURN',
    label: '交差点',
    icon: (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <line x1="32" y1="8" x2="32" y2="56" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
        <line x1="8" y1="32" x2="56" y2="32" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/>
        <circle cx="32" cy="32" r="6" fill="currentColor"/>
      </svg>
    ),
  },
  {
    type: 'NARROW_ROAD',
    label: '細い道',
    icon: (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 8v48" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 4"/>
        <path d="M44 8v48" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 4"/>
        <path d="M32 16v8M32 32v8M32 48v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    type: 'BACK_PARKING',
    label: '駐車',
    icon: (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="16" y="12" width="32" height="40" rx="4" stroke="currentColor" strokeWidth="3" fill="none"/>
        <text x="32" y="42" fontSize="24" fontWeight="bold" fill="currentColor" textAnchor="middle">P</text>
      </svg>
    ),
  },
  {
    type: 'BASIC_START_STOP',
    label: '発進・停車',
    icon: (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="32" r="12" stroke="currentColor" strokeWidth="3" fill="none"/>
        <polygon points="22,26 22,38 30,32" fill="currentColor"/>
        <rect x="40" y="20" width="12" height="24" rx="2" stroke="currentColor" strokeWidth="3" fill="none"/>
        <rect x="42" y="24" width="8" height="7" fill="currentColor"/>
        <rect x="42" y="33" width="8" height="7" fill="currentColor"/>
      </svg>
    ),
  },
  {
    type: 'MERGE_LANECHANGE',
    label: '合流',
    icon: (
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 48L32 16L48 48" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M24 32h16" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
        <circle cx="32" cy="40" r="4" fill="currentColor"/>
      </svg>
    ),
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
