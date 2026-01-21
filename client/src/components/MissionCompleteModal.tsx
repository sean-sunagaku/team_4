import './MissionCompleteModal.css'

// 評価項目のインターフェース
interface EvaluationItem {
  title: string
  stars: number // 0-3の評価
  comment: string
}

// モックデータ
const mockEvaluations: EvaluationItem[] = [
  {
    title: 'バックミラー確認',
    stars: 1,
    comment: '前方に集中しがちでした。\n5〜10秒に1回、ミラーをチラッと見る習慣をつけましょう',
  },
  {
    title: '合流時の安全確認',
    stars: 2,
    comment: '確認が直前になっていました。\n早めにミラー→目視の順で確認を',
  },
  {
    title: 'ウインカー',
    stars: 2,
    comment: 'やや遅めでした。曲がる30m手前を目安に',
  },
]

const mockScore = 50
const mockTotalStars = 2.5 // 5段階中

interface MissionCompleteModalProps {
  isOpen: boolean
  onClose: () => void
  score?: number
  totalStars?: number
  evaluations?: EvaluationItem[]
}

// 星を描画するヘルパーコンポーネント（5つ星用）
const StarRating5 = ({ rating }: { rating: number }) => {
  const stars = []
  for (let i = 0; i < 5; i++) {
    if (rating >= i + 1) {
      stars.push(<img key={i} src="/star-full.png" alt="★" className="star-icon large" />)
    } else if (rating >= i + 0.5) {
      stars.push(<img key={i} src="/start-half.png" alt="☆" className="star-icon large" />)
    } else {
      stars.push(<img key={i} src="/star-empty.png" alt="☆" className="star-icon large" />)
    }
  }
  return <div className="star-rating">{stars}</div>
}

// 星を描画するヘルパーコンポーネント（3つ星用）
const StarRating3 = ({ rating }: { rating: number }) => {
  const stars = []
  for (let i = 0; i < 3; i++) {
    if (rating >= i + 1) {
      stars.push(<img key={i} src="/star-full.png" alt="★" className="star-icon" />)
    } else {
      stars.push(<img key={i} src="/star-empty.png" alt="☆" className="star-icon" />)
    }
  }
  return <div className="star-rating-small">{stars}</div>
}

const MissionCompleteModal = ({
  isOpen,
  onClose,
  score = mockScore,
  totalStars = mockTotalStars,
  evaluations = mockEvaluations,
}: MissionCompleteModalProps) => {
  if (!isOpen) return null

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div className="mission-complete-overlay" onClick={handleOverlayClick}>
      <div className="mission-complete-modal">
        <div className="mission-complete-content">
          {/* ヘッダー */}
          <h1 className="result-title">お疲れ様でした！結果は・・・</h1>

          {/* スコア表示 */}
          <div className="score-section">
            <span className="score-number">{score}</span>
            <span className="score-unit">点</span>
          </div>

          {/* 総合星評価 */}
          <StarRating5 rating={totalStars} />

          {/* 評価テーブル */}
          <div className="evaluation-container">
            <div className="evaluation-table">
              {evaluations.map((item, index) => (
                <div key={index} className="evaluation-row">
                  <div className="evaluation-title">{item.title}</div>
                  <div className="evaluation-stars">
                    <StarRating3 rating={item.stars} />
                  </div>
                  <div className="evaluation-comment">
                    {item.comment.split('\n').map((line, i) => (
                      <span key={i}>
                        {line}
                        {i < item.comment.split('\n').length - 1 && <br />}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <img src="/diagonal-icon.png" alt="DriBuddy" className="mission-complete-car" />
          </div>

          {/* 閉じるボタン */}
          <button className="close-result-button" onClick={onClose}>
            ホームに戻る
          </button>
        </div>
      </div>
    </div>
  )
}

export default MissionCompleteModal
