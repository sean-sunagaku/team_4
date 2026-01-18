import './AIChatButton.css'

const aiIcon = new URL('../icon/ai_icon.png', import.meta.url).href

interface AIChatButtonProps {
  onClick: () => void
}

const AIChatButton = ({ onClick }: AIChatButtonProps) => {
  return (
    <div className="ai-chat-button-container">
      <button onClick={onClick} className="ai-chat-button">
        <img src={aiIcon} alt="AI" className="star-icon" />
      </button>
    </div>
  )
}

export default AIChatButton
