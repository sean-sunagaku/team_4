import { useState, useRef, useCallback, useEffect } from 'react'
import './AIChatButton.css'
import { chatApi } from '../lib/chat-api'

const aiIcon = new URL('../icon/ai_icon.png', import.meta.url).href

// 定数
const SILENCE_THRESHOLD = 0.01
const SILENCE_DURATION = 1500
const MIN_RECORDING_DURATION = 500

type VoiceState = 'idle' | 'recording' | 'processing' | 'speaking'

interface AIChatButtonProps {
  autoStart?: boolean
}

const AIChatButton = ({ autoStart = false }: AIChatButtonProps) => {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle')

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const silenceCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const hasVoiceActivityRef = useRef(false)
  const recordingStartTimeRef = useRef(0)

  // Audio playback
  const audioQueueRef = useRef<{ url: string; index: number }[]>([])
  const isPlayingRef = useRef(false)
  const nextExpectedIndexRef = useRef(0)
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)

  // RMS計算
  const calculateRMS = (): number => {
    if (!analyserRef.current) return 0
    const dataArray = new Uint8Array(analyserRef.current.fftSize)
    analyserRef.current.getByteTimeDomainData(dataArray)
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128
      sum += normalized * normalized
    }
    return Math.sqrt(sum / dataArray.length)
  }

  // Blob to Base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64 = reader.result as string
        const base64Data = base64.split(',')[1]
        resolve(base64Data)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  // Audio queue management
  const playNextInQueue = useCallback(() => {
    if (isPlayingRef.current) return

    audioQueueRef.current.sort((a, b) => a.index - b.index)
    const nextAudio = audioQueueRef.current.find(
      (item) => item.index === nextExpectedIndexRef.current
    )

    if (nextAudio) {
      isPlayingRef.current = true
      audioQueueRef.current = audioQueueRef.current.filter(
        (item) => item.index !== nextAudio.index
      )

      const audio = new Audio(nextAudio.url)
      audioPlayerRef.current = audio

      audio.onended = () => {
        isPlayingRef.current = false
        nextExpectedIndexRef.current++
        if (audioQueueRef.current.length === 0) {
          setVoiceState('idle')
        }
        playNextInQueue()
      }

      audio.onerror = () => {
        isPlayingRef.current = false
        nextExpectedIndexRef.current++
        if (audioQueueRef.current.length === 0) {
          setVoiceState('idle')
        }
        playNextInQueue()
      }

      audio.play().catch(() => {
        isPlayingRef.current = false
        nextExpectedIndexRef.current++
        if (audioQueueRef.current.length === 0) {
          setVoiceState('idle')
        }
        playNextInQueue()
      })
    }
  }, [])

  const queueAudio = useCallback((url: string, index: number) => {
    audioQueueRef.current.push({ url, index })
    playNextInQueue()
  }, [playNextInQueue])

  const resetAudioQueue = useCallback(() => {
    audioQueueRef.current = []
    nextExpectedIndexRef.current = 0
    isPlayingRef.current = false
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause()
      audioPlayerRef.current = null
    }
  }, [])

  // 音声送信
  const sendVoiceMessage = useCallback(async (audioBlob: Blob) => {
    setVoiceState('processing')
    resetAudioQueue()

    try {
      const audioData = await blobToBase64(audioBlob)

      await chatApi.sendVoiceMessage(audioData, 'webm', {
        onTranscription: (text) => {
          console.log('Transcription:', text)
        },
        onChunk: (chunk) => {
          console.log('Response chunk:', chunk)
        },
        onAudio: (url, index) => {
          console.log(`Audio[${index}]:`, url)
          setVoiceState('speaking')
          queueAudio(url, index ?? 0)
        },
        onDone: (content) => {
          console.log('Done:', content)
          if (audioQueueRef.current.length === 0 && !isPlayingRef.current) {
            setVoiceState('idle')
          }
        },
        onError: (error) => {
          console.error('Voice chat error:', error)
          setVoiceState('idle')
        },
      })
    } catch (error) {
      console.error('Failed to send voice message:', error)
      setVoiceState('idle')
    }
  }, [queueAudio, resetAudioQueue])

  // クリーンアップ
  const cleanup = useCallback(() => {
    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current)
      silenceCheckIntervalRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyserRef.current = null
  }, [])

  // 録音開始
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      streamRef.current = stream

      // Audio Context setup
      audioContextRef.current = new AudioContext({ sampleRate: 16000 })
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 2048
      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)

      // MediaRecorder setup
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm'
      const mediaRecorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []
      recordingStartTimeRef.current = Date.now()
      hasVoiceActivityRef.current = false

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        cleanup()

        const recordingDuration = Date.now() - recordingStartTimeRef.current
        if (recordingDuration < MIN_RECORDING_DURATION || !hasVoiceActivityRef.current) {
          console.log('Recording too short or no voice activity')
          setVoiceState('idle')
          return
        }

        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          await sendVoiceMessage(audioBlob)
        } else {
          setVoiceState('idle')
        }
      }

      mediaRecorder.start(100)
      setVoiceState('recording')

      // 無音検出
      let lastVoiceTime = Date.now()
      silenceCheckIntervalRef.current = setInterval(() => {
        const rms = calculateRMS()

        if (rms >= SILENCE_THRESHOLD) {
          lastVoiceTime = Date.now()
          hasVoiceActivityRef.current = true
        } else {
          const silenceDuration = Date.now() - lastVoiceTime
          if (hasVoiceActivityRef.current && silenceDuration >= SILENCE_DURATION) {
            console.log('Silence detected, stopping recording...')
            if (silenceCheckIntervalRef.current) {
              clearInterval(silenceCheckIntervalRef.current)
              silenceCheckIntervalRef.current = null
            }
            if (mediaRecorder.state !== 'inactive') {
              mediaRecorder.stop()
            }
          }
        }
      }, 100)
    } catch (error) {
      console.error('Failed to start recording:', error)
      alert('マイクへのアクセスが許可されていません。')
      setVoiceState('idle')
    }
  }, [cleanup, sendVoiceMessage])

  // autoStartがtrueになったら自動的に録音開始
  const hasAutoStartedRef = useRef(false)
  useEffect(() => {
    if (autoStart && voiceState === 'idle' && !hasAutoStartedRef.current) {
      hasAutoStartedRef.current = true
      // 少し遅延を入れてからスタート（UIの描画を待つ）
      const timer = setTimeout(() => {
        startRecording()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [autoStart, voiceState, startRecording])

  // ボタンクリック
  const handleClick = useCallback(() => {
    if (voiceState === 'idle') {
      startRecording()
    } else if (voiceState === 'recording') {
      // 録音中にタップで停止
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
    } else if (voiceState === 'speaking') {
      // 再生中にタップで停止
      resetAudioQueue()
      setVoiceState('idle')
    }
  }, [voiceState, startRecording, resetAudioQueue])

  return (
    <div className="ai-chat-button-container">
      <button
        onClick={handleClick}
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
        ) : (
          <img src={aiIcon} alt="AI" className="star-icon" />
        )}
      </button>
      {voiceState === 'recording' && (
        <div className="recording-indicator">録音中...</div>
      )}
    </div>
  )
}

export default AIChatButton
