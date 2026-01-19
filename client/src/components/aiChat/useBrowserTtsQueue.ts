import { useCallback, useRef } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { VoiceState } from './aiChatTypes'

// Web Speech API（ブラウザTTS）を順序通りに再生するためのキュー管理フック
export const useBrowserTtsQueue = (
  setVoiceState: Dispatch<SetStateAction<VoiceState>>,
  returnToIdleOrListeningRef: MutableRefObject<() => void>
) => {
  const browserTtsQueueRef = useRef<{ text: string; index: number }[]>([])
  const isBrowserSpeakingRef = useRef(false)
  const nextBrowserTtsIndexRef = useRef(0)

  // キュー内のテキストを順番に読み上げる
  const speakNextBrowserTts = useCallback(() => {
    if (isBrowserSpeakingRef.current) return

    // index 順に並べてから次のテキストを再生
    browserTtsQueueRef.current.sort((a, b) => a.index - b.index)
    const nextItem = browserTtsQueueRef.current.find(
      (item) => item.index === nextBrowserTtsIndexRef.current
    )

    if (nextItem) {
      isBrowserSpeakingRef.current = true
      setVoiceState('speaking')
      browserTtsQueueRef.current = browserTtsQueueRef.current.filter(
        (item) => item.index !== nextItem.index
      )

      const utterance = new SpeechSynthesisUtterance(nextItem.text)
      utterance.lang = 'ja-JP'
      utterance.rate = 1.0
      utterance.pitch = 1.0

      const voices = window.speechSynthesis.getVoices()
      const japaneseVoice = voices.find((voice) => voice.lang.includes('ja'))
      if (japaneseVoice) {
        utterance.voice = japaneseVoice
      }

      const handleFinish = () => {
        isBrowserSpeakingRef.current = false
        nextBrowserTtsIndexRef.current++
        if (browserTtsQueueRef.current.length === 0) {
          returnToIdleOrListeningRef.current()
        }
        speakNextBrowserTts()
      }

      utterance.onend = handleFinish
      utterance.onerror = handleFinish

      window.speechSynthesis.speak(utterance)
      console.log(`Browser TTS[${nextItem.index}]: "${nextItem.text.slice(0, 30)}..."`)
    }
  }, [setVoiceState, returnToIdleOrListeningRef])

  // 読み上げテキストをキューに積む
  const queueBrowserTts = useCallback(
    (text: string, index: number) => {
      browserTtsQueueRef.current.push({ text, index })
      speakNextBrowserTts()
    },
    [speakNextBrowserTts]
  )

  // ブラウザTTSのキューを初期化し読み上げを止める
  const resetBrowserTtsQueue = useCallback(() => {
    browserTtsQueueRef.current = []
    nextBrowserTtsIndexRef.current = 0
    isBrowserSpeakingRef.current = false
    window.speechSynthesis.cancel()
  }, [])

  return {
    browserTtsQueueRef,
    isBrowserSpeakingRef,
    nextBrowserTtsIndexRef,
    queueBrowserTts,
    resetBrowserTtsQueue,
  }
}
