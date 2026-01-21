import { useCallback, useRef } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { VoiceState } from './aiChatTypes'

// 言語コードからTTS言語コードへのマッピング
const getTtsLangCode = (lang?: string): string => {
  const langMap: Record<string, string> = {
    ja: 'ja-JP',
    en: 'en-US',
    zh: 'zh-CN',
    ko: 'ko-KR',
    ru: 'ru-RU',
    ar: 'ar-SA',
  }
  return langMap[lang || 'ja'] || 'ja-JP'
}

// Browser TTSキューアイテムの型（感情によるpitch/rate調整対応）
interface BrowserTtsQueueItem {
  text: string
  index: number
  language?: string
  pitch?: number  // 声の高さ（0.5-2.0、デフォルト1.0）
  rate?: number   // 話速（0.5-2.0、デフォルト1.0）
}

// Web Speech API（ブラウザTTS）を順序通りに再生するためのキュー管理フック
export const useBrowserTtsQueue = (
  setVoiceState: Dispatch<SetStateAction<VoiceState>>,
  returnToIdleOrListeningRef: MutableRefObject<() => void>
) => {
  const browserTtsQueueRef = useRef<BrowserTtsQueueItem[]>([])
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
      const ttsLang = getTtsLangCode(nextItem.language)
      utterance.lang = ttsLang
      // 感情に応じたpitch/rateを適用（未指定時はデフォルト1.0）
      utterance.rate = nextItem.rate ?? 1.0
      utterance.pitch = nextItem.pitch ?? 1.0

      // 言語に合った音声を選択
      const voices = window.speechSynthesis.getVoices()
      const langPrefix = ttsLang.split('-')[0] // 'ja-JP' -> 'ja'
      const matchingVoice = voices.find((voice) => voice.lang.includes(langPrefix))
      if (matchingVoice) {
        utterance.voice = matchingVoice
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
      console.log(`Browser TTS[${nextItem.index}] (${ttsLang}, pitch: ${utterance.pitch}, rate: ${utterance.rate}): "${nextItem.text.slice(0, 30)}..."`)
    }
  }, [setVoiceState, returnToIdleOrListeningRef])

  // 読み上げテキストをキューに積む（言語・感情設定可能）
  const queueBrowserTts = useCallback(
    (text: string, index: number, language?: string, pitch?: number, rate?: number) => {
      browserTtsQueueRef.current.push({ text, index, language, pitch, rate })
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
