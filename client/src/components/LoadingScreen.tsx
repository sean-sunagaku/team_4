import { useEffect, useState } from 'react'
import './LoadingScreen.css'

export type LoadingStep = 'location' | 'generating' | 'complete'

interface LoadingScreenProps {
  step: LoadingStep
  onComplete?: () => void
}

const STEP_MESSAGES: Record<LoadingStep, string> = {
  location: '現在地を取得しています',
  generating: '練習ルートを生成中です',
  complete: '生成完了しました！',
}

const LoadingScreen = ({ step, onComplete }: LoadingScreenProps) => {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (step === 'complete') {
      setProgress(100)
      // 完了後に自動で次へ
      const timer = setTimeout(() => {
        onComplete?.()
      }, 1500)
      return () => clearTimeout(timer)
    }

    // プログレスバーのアニメーション
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (step === 'location' && prev >= 40) return prev
        if (step === 'generating' && prev >= 90) return prev
        return prev + 2
      })
    }, 100)

    return () => clearInterval(interval)
  }, [step, onComplete])

  return (
    <div className="loading-overlay">
      <div className="loading-modal">
        <div className="loading-content">
          <div className="car-character">
            <img src="/diagonal-icon.svg" alt="Loading" className="car-icon" />
          </div>

          <p className="loading-message">{STEP_MESSAGES[step]}</p>

          <div className="progress-container">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LoadingScreen
