import { useCallback } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { MIN_RECORDING_DURATION, SILENCE_DURATION, SILENCE_THRESHOLD } from './aiChatConstants'
import { VoiceState } from './aiChatTypes'

type UseAudioRecorderParams = {
  analyserRef: MutableRefObject<AnalyserNode | null>
  streamRef: MutableRefObject<MediaStream | null>
  audioContextRef: MutableRefObject<AudioContext | null>
  mediaRecorderRef: MutableRefObject<MediaRecorder | null>
  audioChunksRef: MutableRefObject<Blob[]>
  silenceCheckIntervalRef: MutableRefObject<ReturnType<typeof setInterval> | null>
  hasVoiceActivityRef: MutableRefObject<boolean>
  recordingStartTimeRef: MutableRefObject<number>
  alwaysListenRef: MutableRefObject<boolean>
  startListeningRef: MutableRefObject<() => void>
  sendVoiceMessage: (audioBlob: Blob) => Promise<void>
  setVoiceState: Dispatch<SetStateAction<VoiceState>>
}

// 録音開始/停止、無音検知、録音完了時の送信までをまとめたフック
export const useAudioRecorder = ({
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
}: UseAudioRecorderParams) => {
  // 入力音声のRMSを計算して無音判定に使う
  const calculateRMS = useCallback((): number => {
    if (!analyserRef.current) return 0
    const dataArray = new Uint8Array(analyserRef.current.fftSize)
    analyserRef.current.getByteTimeDomainData(dataArray)
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128
      sum += normalized * normalized
    }
    return Math.sqrt(sum / dataArray.length)
  }, [analyserRef])

  // 録音中のタイマー/MediaRecorderを停止
  // 録音を安全に停止してタイマーをクリアする
  const cleanupRecording = useCallback(() => {
    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current)
      silenceCheckIntervalRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }, [mediaRecorderRef, silenceCheckIntervalRef])

  // 既存のストリームがあれば再利用し、録音を開始
  // ストリームを準備し、録音と無音監視を開始する
  const startRecordingWithStream = useCallback(
    async (existingStream?: MediaStream) => {
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

          audioContextRef.current = new AudioContext({ sampleRate: 16000 })
          analyserRef.current = audioContextRef.current.createAnalyser()
          analyserRef.current.fftSize = 2048
          const source = audioContextRef.current.createMediaStreamSource(stream)
          source.connect(analyserRef.current)
        }

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

        // 録音終了時の送信フロー
        mediaRecorder.onstop = async () => {
          cleanupRecording()

          const recordingDuration = Date.now() - recordingStartTimeRef.current
          if (recordingDuration < MIN_RECORDING_DURATION || !hasVoiceActivityRef.current) {
            console.log('Recording too short or no voice activity')
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

        // 無音が一定時間続いたら自動停止
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
    },
    [
      alwaysListenRef,
      analyserRef,
      audioChunksRef,
      audioContextRef,
      calculateRMS,
      cleanupRecording,
      hasVoiceActivityRef,
      mediaRecorderRef,
      recordingStartTimeRef,
      sendVoiceMessage,
      setVoiceState,
      silenceCheckIntervalRef,
      startListeningRef,
      streamRef,
    ]
  )

  // 呼び出し側から簡単に録音を開始できるようにする
  const startRecording = useCallback(async () => {
    await startRecordingWithStream()
  }, [startRecordingWithStream])

  return {
    cleanupRecording,
    startRecordingWithStream,
    startRecording,
  }
}
