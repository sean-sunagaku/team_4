import { useState, useEffect } from 'react'
import './MissionListPanel.css'

export interface Mission {
  id: string
  title: string
  level: number
  distance: string
  completed: boolean
}

interface MissionListPanelProps {
  steps: string[]
  missions?: Mission[]
  onBackToHome?: () => void
  onAllMissionsComplete?: () => void
}

const MissionListPanel = ({ steps, missions: propMissions, onBackToHome, onAllMissionsComplete }: MissionListPanelProps) => {
  // stepsからミッションを生成（後方互換性のため）
  const generatedMissions: Mission[] = steps.map((step, index) => ({
    id: `mission-${index}`,
    title: step,
    level: index + 1,
    distance: `目的地まで残り${(steps.length - index) * 200}m`,
    completed: false,
  }))

  const missions = propMissions || generatedMissions
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set())
  const [animatingId, setAnimatingId] = useState<string | null>(null)

  if (missions.length === 0) return null

  const handleComplete = (id: string) => {
    setAnimatingId(id)
    setTimeout(() => {
      setCompletedIds((prev) => {
        const newSet = new Set(prev)
        newSet.add(id)
        return newSet
      })
      setAnimatingId(null)
    }, 300)
  }

  // 全ミッション完了時のコールバック
  useEffect(() => {
    if (missions.length > 0 && completedIds.size === missions.length) {
      // 少し遅延させてアニメーション完了後に表示
      const timer = setTimeout(() => {
        onAllMissionsComplete?.()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [completedIds.size, missions.length, onAllMissionsComplete])

  // 現在進行中のミッション（最初の未完了ミッション）とUpNextを分離
  const incompleteMissions = missions.filter((m) => !completedIds.has(m.id) && !m.completed)
  const currentMission = incompleteMissions.length > 0 ? incompleteMissions[0] : null
  const upNextMissions = incompleteMissions.slice(1)

  return (
    <div className="mission-panel">
      <h2 className="mission-title">Missions</h2>

      {currentMission && (
        <div className="mission-section">
          <div
            className={`mission-item current ${animatingId === currentMission.id ? 'completing' : ''}`}
            onClick={() => handleComplete(currentMission.id)}
          >
            <div className="mission-content">
              <span className="mission-name">{currentMission.title}</span>
              <span className="mission-meta">
                Level{currentMission.level} {currentMission.distance}
              </span>
            </div>
            <div className="mission-check empty">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="#ccc" strokeWidth="2" fill="none"/>
              </svg>
            </div>
          </div>
        </div>
      )}

      {upNextMissions.length > 0 && (
        <>
          <h3 className="upnext-title">UpNext</h3>
          <div className="mission-section upnext">
            {upNextMissions.map((mission, index) => (
              <div
                key={mission.id}
                className={`mission-item disabled ${animatingId && index === 0 ? 'sliding-up' : ''}`}
              >
                <div className="mission-content">
                  <span className="mission-name">{mission.title}</span>
                  <span className="mission-meta">
                    Level{mission.level} {mission.distance}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {onBackToHome && (
        <button className="back-home-button" onClick={onBackToHome}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          ホームに戻る
        </button>
      )}
    </div>
  )
}

export default MissionListPanel
