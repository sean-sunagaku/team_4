import { VoiceState, SupportedLanguage, LANGUAGE_FLAGS } from './aiChatTypes'

const aiIcon = new URL('../../icon/ai_icon.png', import.meta.url).href

const LANGUAGES: SupportedLanguage[] = ['ja', 'en', 'zh']

type AIChatButtonViewProps = {
  placement: 'floating' | 'inline'
  voiceState: VoiceState
  onClick: () => void
  selectedLanguage: SupportedLanguage
  onLanguageSelect: (lang: SupportedLanguage) => void
}

const AIChatButtonView = ({
  placement,
  voiceState,
  onClick,
  selectedLanguage,
  onLanguageSelect,
}: AIChatButtonViewProps) => {
  // 次の言語に切り替え
  const cycleLanguage = () => {
    const currentIndex = LANGUAGES.indexOf(selectedLanguage)
    const nextIndex = (currentIndex + 1) % LANGUAGES.length
    onLanguageSelect(LANGUAGES[nextIndex])
  }

  return (
    <div
      className={[
        'ai-chat-button-container',
        placement === 'inline' ? 'ai-chat-button-container--inline' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="ai-chat-button-wrapper">
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
        {/* 国旗バッジ（右上） */}
        <button
          className="language-badge"
          onClick={cycleLanguage}
          title="言語を切り替え"
        >
          {LANGUAGE_FLAGS[selectedLanguage]}
        </button>
      </div>
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
