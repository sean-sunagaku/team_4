import { useCallback, useRef } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { VoiceState, SupportedLanguage } from './aiChatTypes'

type UseWakeWordListenerParams = {
  apiBaseUrl: string
  streamRef: MutableRefObject<MediaStream | null>
  audioContextRef: MutableRefObject<AudioContext | null>
  analyserRef: MutableRefObject<AnalyserNode | null>
  selectedLanguageRef: MutableRefObject<SupportedLanguage>
  setSelectedLanguage: Dispatch<SetStateAction<SupportedLanguage>>
  setVoiceState: Dispatch<SetStateAction<VoiceState>>
  startRecordingWithStream: (existingStream?: MediaStream) => Promise<void>
  playWakeSound: () => void
  float32ToPCM16Base64: (data: Float32Array) => string
}

// WebSocket ASR で wake word を待ち受け、検出したら録音モードに切り替えるフック
export const useWakeWordListener = ({
  apiBaseUrl,
  streamRef,
  audioContextRef,
  analyserRef,
  selectedLanguageRef,
  setSelectedLanguage,
  setVoiceState,
  startRecordingWithStream,
  playWakeSound,
  float32ToPCM16Base64,
}: UseWakeWordListenerParams) => {
  const wsRef = useRef<WebSocket | null>(null)
  const isUsingWebSocketRef = useRef(false)
  const audioWorkletRef = useRef<ScriptProcessorNode | null>(null)
  const startAudioStreamingRef = useRef<(() => void) | null>(null)
  // クロージャ問題を回避するためのref
  const setSelectedLanguageRef = useRef(setSelectedLanguage)
  setSelectedLanguageRef.current = setSelectedLanguage

  // 手動で待受けを止める（録音切替やタップ時）
  // 待受け中の WS/Worklet を停止する
  const stopListening = useCallback(() => {
    if (audioWorkletRef.current) {
      audioWorkletRef.current.disconnect()
      audioWorkletRef.current = null
    }
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'finish' }))
      } catch {
        // ignore send failures during cleanup
      }
      wsRef.current.close()
      wsRef.current = null
    }
    isUsingWebSocketRef.current = false
  }, [])

  // WebSocket/Worklet の後片付け
  // コンポーネント終了時に WS/Worklet を確実に閉じる
  const cleanupWakeWord = useCallback(() => {
    if (audioWorkletRef.current) {
      audioWorkletRef.current.disconnect()
      audioWorkletRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    isUsingWebSocketRef.current = false
  }, [])

  // 言語をWebSocket経由でサーバーに設定（再接続なし）
  const setLanguage = useCallback((language: SupportedLanguage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'set_language', language }))
      console.log(`Language set to: ${language}`)
    }
  }, [])

  // WebSocket ASR に接続し、wake word 検出を開始
  // wake word 待受けを開始し、検出したら録音へ移行する
  const startListening = useCallback(async () => {
    try {
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

        audioContextRef.current = new AudioContext({ sampleRate: 16000 })
        analyserRef.current = audioContextRef.current.createAnalyser()
        analyserRef.current.fftSize = 2048
        const source = audioContextRef.current.createMediaStreamSource(stream)
        source.connect(analyserRef.current)
      }

      setVoiceState('listening')

      const wsUrl = `${apiBaseUrl.replace(/^http/, 'ws')}/ws/asr`
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
            const lang = data.language || selectedLanguageRef.current
            selectedLanguageRef.current = lang
            console.log(`DashScope ASR ready (language: ${lang}), starting audio streaming`)
            startAudioStreamingRef.current?.()
          } else if (data.type === 'language_change') {
            // サーバーからの言語変更検出: 新しい言語で再接続
            console.log(`Language change detected: ${data.currentLanguage} → ${data.detectedLanguage}`)
            console.log(`Detection text: "${data.text}"`)

            // 現在のオーディオストリーミングを一時停止
            if (audioWorkletRef.current) {
              audioWorkletRef.current.disconnect()
              audioWorkletRef.current = null
            }

            // 新しい言語で再接続をリクエスト + UIを更新
            selectedLanguageRef.current = data.detectedLanguage
            setSelectedLanguageRef.current(data.detectedLanguage) // 国旗UIを更新
            ws.send(JSON.stringify({
              type: 'reconnect_with_language',
              language: data.detectedLanguage,
            }))
          } else if (data.type === 'transcript') {
            const lang = data.language || selectedLanguageRef.current
            console.log(
              `ASR transcript: "${data.text}" (final: ${data.isFinal}, wake: ${data.wakeWordDetected}, lang: ${lang})`
            )

            if (data.wakeWordDetected) {
              console.log('ウェイクワード検出！録音モードに切り替え...')
              playWakeSound()

              if (audioWorkletRef.current) {
                audioWorkletRef.current.disconnect()
                audioWorkletRef.current = null
              }
              ws.send(JSON.stringify({ type: 'finish' }))

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

      // マイク入力を一定間隔で WebSocket に送る
      const startAudioStreaming = () => {
        if (!audioContextRef.current || !streamRef.current) return

        const scriptNode = audioContextRef.current.createScriptProcessor(512, 1, 1)
        audioWorkletRef.current = scriptNode

        const source = audioContextRef.current.createMediaStreamSource(streamRef.current)
        source.connect(scriptNode)
        scriptNode.connect(audioContextRef.current.destination)

        scriptNode.onaudioprocess = (e) => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            const inputData = e.inputBuffer.getChannelData(0)
            const audioBase64 = float32ToPCM16Base64(inputData)
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
  }, [
    analyserRef,
    apiBaseUrl,
    audioContextRef,
    float32ToPCM16Base64,
    playWakeSound,
    setSelectedLanguage,
    setVoiceState,
    startRecordingWithStream,
    streamRef,
  ])

  return {
    startListening,
    stopListening,
    cleanupWakeWord,
    setLanguage,
  }
}
