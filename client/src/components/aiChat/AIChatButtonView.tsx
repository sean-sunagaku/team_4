import { VoiceState } from './aiChatTypes'

const aiIcon = new URL('../../icon/ai_icon.png', import.meta.url).href

type AIChatButtonViewProps = {
  placement: 'floating' | 'inline'
  voiceState: VoiceState
  onClick: () => void
}

const AIChatButtonView = ({ placement, voiceState, onClick }: AIChatButtonViewProps) => {
  return (
    <div
      className={[
        'ai-chat-button-container',
        placement === 'inline' ? 'ai-chat-button-container--inline' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        onClick={onClick}
        className={`ai-chat-button ai-chat-button--${voiceState}`}
        disabled={voiceState === 'processing'}
      >
        {voiceState === 'processing' ? (
          <div className="spinner" />
        ) : voiceState === 'speaking' ? (
          <div className="speaker-icon">
            <div className="speaker-wave" />
            <div className="speaker-wave" />
            <div className="speaker-wave" />
          </div>
        ) : voiceState === 'listening' ? (
          <div className="listening-indicator">
            <img src={aiIcon} alt="AI" className="star-icon star-icon--listening" />
          </div>
        ) : (
          <img src={aiIcon} alt="AI" className="star-icon" />
        )}
      </button>
      {voiceState === 'listening' && (
        <div className="recording-indicator listening-text">待機中...</div>
      )}
      {voiceState === 'recording' && (
        <div className="recording-indicator">録音中...</div>
      )}
    </div>
  )
}

export default AIChatButtonView
