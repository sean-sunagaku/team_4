import './NavigationStartModal.css' // modal-overlay, modal-header などの共通スタイル
import './YouTubeVideoModal.css'

export interface VideoModalData {
  modalType: string
  videoId?: string
  videoUrl?: string
  title?: string
  description?: string
}

interface YouTubeVideoModalProps {
  isOpen: boolean
  onClose: () => void
  data: VideoModalData | null
}

/**
 * YouTube動画を埋め込みで表示するモーダル
 * NavigationStartModalのデザインを踏襲
 */
const YouTubeVideoModal = ({ isOpen, onClose, data }: YouTubeVideoModalProps) => {
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  if (!isOpen || !data) return null

  // YouTubeのURLから動画IDを抽出（自動再生にはミュート必須）
  const getYouTubeEmbedUrl = (url: string): string => {
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?\s]+)/)
    const videoId = match ? match[1] : ''
    return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1`
  }

  const embedUrl = data.videoUrl ? getYouTubeEmbedUrl(data.videoUrl) : ''

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="youtube-video-modal" role="dialog" aria-modal="true" aria-label={data.title || '動画'}>
        <div className="modal-header">
          <h2 className="modal-title">{data.title || '参考動画'}</h2>
          <button onClick={onClose} className="modal-close-button" aria-label="閉じる">
            <span>×</span>
          </button>
        </div>

        <div className="youtube-modal-body">
          {data.description && (
            <p className="youtube-modal-description">{data.description}</p>
          )}

          <div className="youtube-video-container">
            {embedUrl ? (
              <iframe
                src={embedUrl}
                title={data.title || 'YouTube video'}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <p className="youtube-error">動画を読み込めませんでした</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default YouTubeVideoModal
