import { useState, useRef, useCallback, useEffect } from 'react'
import './AIChatButton.css'
import { chatApi } from '../lib/chat-api'

const aiIcon = new URL('../icon/ai_icon.png', import.meta.url).href

// 定数
const SILENCE_THRESHOLD = 0.01
const SILENCE_DURATION = 1500
const MIN_RECORDING_DURATION = 500

// API Base URL
const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:3001'

// 通知音を再生するユーティリティ
const playNotificationSound = (type: 'wake' | 'end') => {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()

  const playTone = (frequency: number, startTime: number, duration: number, volume: number) => {
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    oscillator.frequency.value = frequency
    oscillator.type = 'sine'

    gainNode.gain.setValueAtTime(0, startTime)
    gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.02)
    gainNode.gain.linearRampToValueAtTime(0, startTime + duration)

    oscillator.start(startTime)
    oscillator.stop(startTime + duration)
  }

  const now = audioContext.currentTime

  if (type === 'wake') {
    // 上昇する2音（ポップン♪）- 録音開始
    playTone(880, now, 0.12, 0.3)           // A5
    playTone(1108.73, now + 0.08, 0.15, 0.3) // C#6
  } else {
    // 下降する2音（ポロン♪）- 録音終了
    playTone(1108.73, now, 0.12, 0.25)      // C#6
    playTone(880, now + 0.08, 0.15, 0.25)   // A5
  }
}

// ウェイクワード検出時の通知音
const playWakeSound = () => playNotificationSound('wake')

// 録音終了時の通知音
const playEndSound = () => playNotificationSound('end')

type VoiceState = 'idle' | 'listening' | 'recording' | 'processing' | 'speaking'

interface AIChatButtonProps {
  autoStart?: boolean
  placement?: 'floating' | 'inline'
  alwaysListen?: boolean // 常時待機モード
}

const AIChatButton = ({ autoStart = false, placement = 'floating', alwaysListen = false }: AIChatButtonProps) => {
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

  // Wake word detection refs
  const alwaysListenRef = useRef(alwaysListen)

  // WebSocket ASR refs (real-time wake word detection)
  const wsRef = useRef<WebSocket | null>(null)
  const isUsingWebSocketRef = useRef(false)
  const audioWorkletRef = useRef<ScriptProcessorNode | null>(null)
  const startAudioStreamingRef = useRef<(() => void) | null>(null)

  // Audio playback (URL-based, e.g., Qwen TTS)
  const audioQueueRef = useRef<{ url: string; index: number }[]>([])
  const isPlayingRef = useRef(false)
  const nextExpectedIndexRef = useRef(0)
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)

  // Browser TTS queue (Web Speech API)
  const browserTtsQueueRef = useRef<{ text: string; index: number }[]>([])
  const isBrowserSpeakingRef = useRef(false)
  const nextBrowserTtsIndexRef = useRef(0)

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

  // Float32 PCM to 16-bit PCM Base64 (for WebSocket ASR streaming)
  // DashScope公式推奨: 1024バイト/チャンク（512サンプル = 32ms @ 16kHz）
  const float32ToPCM16Base64 = (float32Array: Float32Array): string => {
    const int16Array = new Int16Array(float32Array.length)
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]))
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    const uint8Array = new Uint8Array(int16Array.buffer)
    let binary = ''
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i])
    }
    return btoa(binary)
  }

  // 音声再生完了後にlistening or idleに戻る用のref
  const returnToIdleOrListeningRef = useRef<() => void>(() => setVoiceState('idle'))

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
          returnToIdleOrListeningRef.current()
        }
        playNextInQueue()
      }

      audio.onerror = () => {
        isPlayingRef.current = false
        nextExpectedIndexRef.current++
        if (audioQueueRef.current.length === 0) {
          returnToIdleOrListeningRef.current()
        }
        playNextInQueue()
      }

      audio.play().catch(() => {
        isPlayingRef.current = false
        nextExpectedIndexRef.current++
        if (audioQueueRef.current.length === 0) {
          returnToIdleOrListeningRef.current()
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
    // Also reset browser TTS queue
    browserTtsQueueRef.current = []
    nextBrowserTtsIndexRef.current = 0
    isBrowserSpeakingRef.current = false
    window.speechSynthesis.cancel()
  }, [])

  // Browser TTS: speak next text in queue
  const speakNextBrowserTts = useCallback(() => {
    if (isBrowserSpeakingRef.current) return

    // Sort queue by index and find next expected text
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

      // Find Japanese voice if available
      const voices = window.speechSynthesis.getVoices()
      const japaneseVoice = voices.find((voice) => voice.lang.includes('ja'))
      if (japaneseVoice) {
        utterance.voice = japaneseVoice
      }

      utterance.onend = () => {
        isBrowserSpeakingRef.current = false
        nextBrowserTtsIndexRef.current++
        // Check if more text in queue
        if (browserTtsQueueRef.current.length === 0) {
          returnToIdleOrListeningRef.current()
        }
        speakNextBrowserTts() // Speak next
      }

      utterance.onerror = () => {
        isBrowserSpeakingRef.current = false
        nextBrowserTtsIndexRef.current++
        if (browserTtsQueueRef.current.length === 0) {
          returnToIdleOrListeningRef.current()
        }
        speakNextBrowserTts() // Skip and speak next
      }

      window.speechSynthesis.speak(utterance)
      console.log(`Browser TTS[${nextItem.index}]: "${nextItem.text.slice(0, 30)}..."`)
    }
  }, [])

  // Add text to browser TTS queue
  const queueBrowserTts = useCallback((text: string, index: number) => {
    browserTtsQueueRef.current.push({ text, index })
    speakNextBrowserTts()
  }, [speakNextBrowserTts])

  // 音声送信
  const sendVoiceMessage = useCallback(async (audioBlob: Blob) => {
    setVoiceState('processing')
    // 録音終了の通知音
    playEndSound()
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
        onTtsText: (text, index) => {
          // Browser TTS: use Web Speech API for low-latency speech
          console.log(`Browser TTS[${index}]:`, text.slice(0, 30))
          queueBrowserTts(text, index ?? 0)
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
      }, "browser") // Use server-side TTS (Qwen API)
      // }, 'qwen') // Use server-side TTS (Qwen API)
    } catch (error) {
      console.error('Failed to send voice message:', error)
      setVoiceState('idle')
    }
  }, [queueAudio, queueBrowserTts, resetAudioQueue])

  // クリーンアップ（録音のみ）
  const cleanupRecording = useCallback(() => {
    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current)
      silenceCheckIntervalRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  // 完全クリーンアップ（ストリームも含む）
  const cleanup = useCallback(() => {
    cleanupRecording()
    // WebSocket ASR cleanup
    if (audioWorkletRef.current) {
      audioWorkletRef.current.disconnect()
      audioWorkletRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    isUsingWebSocketRef.current = false
    // Stream cleanup
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyserRef.current = null
  }, [cleanupRecording])

  // startListening用のref（循環参照を避けるため）
  const startListeningRef = useRef<() => void>(() => {})

  // 録音開始（既存ストリームを再利用可能）
  const startRecordingWithStream = useCallback(async (existingStream?: MediaStream) => {
    try {
      let stream = existingStream
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        })
        streamRef.current = stream

        // Audio Context setup（新規ストリームの場合のみ）
        audioContextRef.current = new AudioContext({ sampleRate: 16000 })
        analyserRef.current = audioContextRef.current.createAnalyser()
        analyserRef.current.fftSize = 2048
        const source = audioContextRef.current.createMediaStreamSource(stream)
        source.connect(analyserRef.current)
      }

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
        cleanupRecording()

        const recordingDuration = Date.now() - recordingStartTimeRef.current
        if (recordingDuration < MIN_RECORDING_DURATION || !hasVoiceActivityRef.current) {
          console.log('Recording too short or no voice activity')
          // alwaysListenならlisteningに戻る
          if (alwaysListenRef.current && streamRef.current) {
            startListeningRef.current()
          } else {
            setVoiceState('idle')
          }
          return
        }

        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          await sendVoiceMessage(audioBlob)
          // sendVoiceMessage完了後、alwaysListenならlisteningに戻る
          // （speakingが終わった時点でidleになるので、その後にlisteningを開始）
        } else {
          if (alwaysListenRef.current && streamRef.current) {
            startListeningRef.current()
          } else {
            setVoiceState('idle')
          }
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
  }, [cleanupRecording, sendVoiceMessage])

  // 従来のstartRecording（互換性のため）
  const startRecording = useCallback(async () => {
    await startRecordingWithStream()
  }, [startRecordingWithStream])

  // リスニング開始（ウェイクワード待ち受け）- WebSocket ASR
  const startListening = useCallback(async () => {
    try {
      // 既存ストリームがなければ新規取得
      if (!streamRef.current) {
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
      }

      setVoiceState('listening')

      // WebSocket ASR接続（リアルタイムウェイクワード検出）
      const wsUrl = `${API_BASE_URL.replace(/^http/, 'ws')}/ws/asr`
      console.log('Connecting to WebSocket ASR:', wsUrl)

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('WebSocket connected for real-time ASR')
        isUsingWebSocketRef.current = true
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.type === 'ready') {
            console.log('DashScope ASR ready, starting audio streaming')
            startAudioStreamingRef.current?.()
          } else if (data.type === 'transcript') {
            console.log(`ASR transcript: "${data.text}" (final: ${data.isFinal}, wake: ${data.wakeWordDetected})`)

            if (data.wakeWordDetected) {
              console.log('ウェイクワード検出！録音モードに切り替え...')
              playWakeSound()

              // WebSocket ASRを停止
              if (audioWorkletRef.current) {
                audioWorkletRef.current.disconnect()
                audioWorkletRef.current = null
              }
              ws.send(JSON.stringify({ type: 'finish' }))

              // 録音モードへ移行
              startRecordingWithStream(streamRef.current!)
            }
          } else if (data.type === 'error') {
            console.error('WebSocket ASR error:', data.error)
          }
        } catch (err) {
          console.error('WebSocket message parse error:', err)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        isUsingWebSocketRef.current = false
        setVoiceState('idle')
      }

      ws.onclose = () => {
        console.log('WebSocket closed')
        wsRef.current = null
        isUsingWebSocketRef.current = false
        if (audioWorkletRef.current) {
          audioWorkletRef.current.disconnect()
          audioWorkletRef.current = null
        }
      }

      // 音声ストリーミング関数（WebSocket ready後に呼ばれる）
      const startAudioStreaming = () => {
        if (!audioContextRef.current || !streamRef.current) return

        // ScriptProcessorNode: 512サンプル = 32ms（DashScope公式推奨: 1024バイト、30ms間隔）
        // https://www.alibabacloud.com/help/en/model-studio/qwen-real-time-speech-recognition
        const scriptNode = audioContextRef.current.createScriptProcessor(512, 1, 1)
        audioWorkletRef.current = scriptNode

        const source = audioContextRef.current.createMediaStreamSource(streamRef.current)
        source.connect(scriptNode)
        scriptNode.connect(audioContextRef.current.destination)

        scriptNode.onaudioprocess = (e) => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            const inputData = e.inputBuffer.getChannelData(0)
            const audioBase64 = float32ToPCM16Base64(inputData)
            // 32ms単位で即座に送信（1024バイト/チャンク）
            wsRef.current.send(JSON.stringify({ type: 'audio', audio: audioBase64 }))
          }
        }

        console.log('Audio streaming started (bufferSize: 512, ~32ms per chunk)')
      }

      startAudioStreamingRef.current = startAudioStreaming

    } catch (error) {
      console.error('Failed to start listening:', error)
      alert('マイクへのアクセスが許可されていません。')
      setVoiceState('idle')
    }
  }, [startRecordingWithStream])

  // refを更新
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

  // autoStart/alwaysListenがtrueになったら自動的に開始
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

  // コンポーネントアンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  // ボタンクリック
  const handleClick = useCallback(() => {
    if (voiceState === 'idle') {
      if (alwaysListen) {
        startListening() // 常時待機モードを開始
      } else {
        startRecording()
      }
    } else if (voiceState === 'listening') {
      // リスニング中にタップで手動録音開始
      // WebSocket ASR cleanup
      if (audioWorkletRef.current) {
        audioWorkletRef.current.disconnect()
        audioWorkletRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({ type: 'finish' }))
        wsRef.current.close()
        wsRef.current = null
      }
      startRecordingWithStream(streamRef.current!)
    } else if (voiceState === 'recording') {
      // 録音中にタップで停止
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
    } else if (voiceState === 'speaking') {
      // 再生中にタップで停止
      resetAudioQueue()
      if (alwaysListen) {
        setTimeout(() => startListening(), 300)
      } else {
        setVoiceState('idle')
      }
    }
  }, [voiceState, alwaysListen, startRecording, startListening, startRecordingWithStream, resetAudioQueue])

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

export default AIChatButton
