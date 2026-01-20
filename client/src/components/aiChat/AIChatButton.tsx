import { useState, useRef, useCallback, useEffect, MutableRefObject } from 'react'
import AIChatButtonView from './AIChatButtonView'
import { VoiceState, SupportedLanguage } from './aiChatTypes'
import { blobToBase64, float32ToPCM16Base64, playNotificationSound } from './aiChatUtils'
import { useAudioQueue } from './useAudioQueue'
import { useAudioRecorder } from './useAudioRecorder'
import { useBrowserTtsQueue } from './useBrowserTtsQueue'
import { useWakeWordListener } from './useWakeWordListener'
import './AIChatButton.css'
import { chatApi } from '../../lib/chat-api'

// API Base URL
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3001'

// ウェイクワード検出時の通知音
const playWakeSound = () => playNotificationSound('wake')

// 録音終了時の通知音
const playEndSound = () => playNotificationSound('end')

interface AIChatButtonProps {
  autoStart?: boolean
  placement?: 'floating' | 'inline'
  alwaysListen?: boolean // 常時待機モード
}

// 画面状態と音声フロー（待機→録音→送信→再生→復帰）を束ねるコントローラ
const AIChatButton = ({ autoStart = false, placement = 'floating', alwaysListen = false }: AIChatButtonProps) => {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>('ja')
  const selectedLanguageRef = useRef<SupportedLanguage>('ja')

  // 録音/解析の状態保持（再レンダリングに影響させない）
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const silenceCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasVoiceActivityRef = useRef(false)
  const recordingStartTimeRef = useRef(0)

  // alwaysListen を最新値で参照するための ref
  const alwaysListenRef = useRef(alwaysListen)
  // 再生完了後に idle か listening に戻すための関数を保持
  const returnToIdleOrListeningRef = useRef<() => void>(() => setVoiceState('idle'))
  // useWakeWordListenerからの感情refを参照するための中間ref（sendVoiceMessage内で使用）
  const latestEmotionRefRef = useRef<MutableRefObject<string | null> | null>(null)

  const {
    audioQueueRef,
    isPlayingRef,
    queueAudio,
    resetAudioQueue,
  } = useAudioQueue(returnToIdleOrListeningRef)

  const {
    browserTtsQueueRef,
    isBrowserSpeakingRef,
    queueBrowserTts,
    resetBrowserTtsQueue,
  } = useBrowserTtsQueue(setVoiceState, returnToIdleOrListeningRef)

  // 音声送信
  // 録音した音声を API に送り、TTS を順次再生する
  const sendVoiceMessage = useCallback(async (audioBlob: Blob) => {
    setVoiceState('processing')
    // 録音終了の通知音
    playEndSound()
    resetAudioQueue()
    resetBrowserTtsQueue()

    try {
      const audioData = await blobToBase64(audioBlob)

      // 現在のASR言語をヒントとして渡す
      const languageHint = selectedLanguageRef.current
      // WebSocket ASRで検出された感情を取得
      const detectedEmotion = latestEmotionRefRef.current?.current ?? null
      // ⚡ ASRスキップ最適化: WebSocket ASRで蓄積された転写を取得
      const preTranscript = getAndResetAccumulatedTranscriptRef.current()
      console.log(`Sending voice message with emotion: ${detectedEmotion || 'none'}, pre-transcript: ${preTranscript ? `"${preTranscript.slice(0, 30)}..."` : 'none'}`)

      await chatApi.sendVoiceMessage(preTranscript ? undefined : audioData, 'webm', {
        onTranscription: (text, language) => {
          console.log(`Transcription (${language || 'unknown'}):`, text)
          // 検出言語を保存 + 国旗UIを更新
          if (language) {
            selectedLanguageRef.current = language as SupportedLanguage
            setSelectedLanguage(language as SupportedLanguage)
          }
        },
        onChunk: (chunk) => {
          console.log('Response chunk:', chunk)
        },
        // サーバーTTSの音声URLを順次再生
        onAudio: (url, index) => {
          console.log(`Audio[${index}]:`, url)
          setVoiceState('speaking')
          queueAudio(url, index ?? 0)
        },
        // ブラウザTTSのテキストを順次再生（サーバーから言語・感情情報があればそれを使用）
        onTtsText: (text, index, language, pitch, rate) => {
          const lang = language || selectedLanguageRef.current
          console.log(`Browser TTS[${index}] (${lang}, pitch: ${pitch || 1.0}, rate: ${rate || 1.0}):`, text.slice(0, 30))
          queueBrowserTts(text, index ?? 0, lang, pitch, rate)
        },
        onDone: (content) => {
          console.log('Done:', content)
          if (audioQueueRef.current.length === 0 && !isPlayingRef.current &&
              browserTtsQueueRef.current.length === 0 && !isBrowserSpeakingRef.current) {
            setVoiceState('idle')
          }
        },
        onError: (error) => {
          console.error('Voice chat error:', error)
          setVoiceState('idle')
        },
      }, "qwen", languageHint, detectedEmotion, preTranscript || undefined) // Use Qwen TTS with language hint, detected emotion, and pre-transcript
    } catch (error) {
      console.error('Failed to send voice message:', error)
      setVoiceState('idle')
    }
  }, [queueAudio, queueBrowserTts, resetAudioQueue, resetBrowserTtsQueue])

  // startListening用のref（循環参照を避けるため）
  const startListeningRef = useRef<() => void>(() => {})

  // 録音開始/停止と無音検知を切り出したフック
  const { cleanupRecording, startRecordingWithStream, startRecording } = useAudioRecorder({
    analyserRef,
    streamRef,
    audioContextRef,
    mediaRecorderRef,
    audioChunksRef,
    silenceCheckIntervalRef,
    hasVoiceActivityRef,
    recordingStartTimeRef,
    alwaysListenRef,
    startListeningRef,
    sendVoiceMessage,
    setVoiceState,
  })

  // WebSocket ASR を使った wake word 待機
  const { startListening, stopListening, cleanupWakeWord, setLanguage, latestEmotionRef, getAndResetAccumulatedTranscript } = useWakeWordListener({
    apiBaseUrl: API_BASE_URL,
    streamRef,
    audioContextRef,
    analyserRef,
    selectedLanguageRef,
    setSelectedLanguage,
    setVoiceState,
    startRecordingWithStream,
    playWakeSound,
    float32ToPCM16Base64,
  })
  // sendVoiceMessage内で使用するためのref更新
  const getAndResetAccumulatedTranscriptRef = useRef(getAndResetAccumulatedTranscript)
  getAndResetAccumulatedTranscriptRef.current = getAndResetAccumulatedTranscript
  latestEmotionRefRef.current = latestEmotionRef

  // 完全クリーンアップ（ストリームも含む）
  const cleanup = useCallback(() => {
    cleanupRecording()
    cleanupWakeWord()
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyserRef.current = null
  }, [cleanupRecording, cleanupWakeWord])

  // 常時待機モードの復帰挙動を最新 props で更新
  useEffect(() => {
    startListeningRef.current = startListening
    alwaysListenRef.current = alwaysListen
    // 音声再生完了後の動作を設定
    returnToIdleOrListeningRef.current = () => {
      if (alwaysListen && streamRef.current) {
        // alwaysListenがtrueならlisteningモードに戻る
        setTimeout(() => startListening(), 500)
      } else {
        setVoiceState('idle')
      }
    }
  }, [startListening, alwaysListen])

  // 初回マウント時に自動起動（autoStart/alwaysListen）
  const alwaysListenPropRef = useRef(alwaysListen)

  // propsをrefに保存
  useEffect(() => {
    alwaysListenPropRef.current = alwaysListen
  }, [alwaysListen])

  useEffect(() => {
    console.log('AIChatButton mount effect:', { autoStart, alwaysListen, voiceState })
    if ((autoStart || alwaysListen) && voiceState === 'idle') {
      console.log('Starting listening mode in 500ms...')
      const timer = setTimeout(() => {
        console.log('Timer fired! alwaysListen:', alwaysListenPropRef.current)
        if (alwaysListenPropRef.current) {
          console.log('Calling startListeningRef.current()')
          startListeningRef.current() // 常時待機モード
        } else {
          startRecording() // 従来の録音モード
        }
      }, 500)
      return () => {
        console.log('Timer cleared - will restart on remount')
        clearTimeout(timer)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // アンマウント時にマイク/WSを停止
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  // 言語選択ハンドラ
  const handleLanguageSelect = useCallback((lang: SupportedLanguage) => {
    setSelectedLanguage(lang)
    selectedLanguageRef.current = lang
    setLanguage(lang) // WebSocket経由でサーバーに通知
  }, [setLanguage])

  // ボタンクリックで状態遷移を制御
  // 状態ごとのユーザー操作（タップ）をハンドリング
  const handleClick = useCallback(() => {
    if (voiceState === 'idle') {
      if (alwaysListen) {
        startListening() // 常時待機モードを開始
      } else {
        startRecording()
      }
    } else if (voiceState === 'listening') {
      // リスニング中にタップで手動録音開始
      stopListening()
      startRecordingWithStream(streamRef.current!)
    } else if (voiceState === 'recording') {
      // 録音中にタップで停止
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
    } else if (voiceState === 'speaking') {
      // 再生中にタップで停止
      resetAudioQueue()
      resetBrowserTtsQueue()
      if (alwaysListen) {
        setTimeout(() => startListening(), 300)
      } else {
        setVoiceState('idle')
      }
    }
  }, [
    voiceState,
    alwaysListen,
    startRecording,
    startListening,
    stopListening,
    startRecordingWithStream,
    resetAudioQueue,
    resetBrowserTtsQueue,
  ])

  return (
    <AIChatButtonView
      placement={placement}
      voiceState={voiceState}
      onClick={handleClick}
      selectedLanguage={selectedLanguage}
      onLanguageSelect={handleLanguageSelect}
    />
  )
}

export default AIChatButton
