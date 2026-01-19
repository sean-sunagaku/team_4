import { useCallback, useRef } from 'react'
import type { MutableRefObject } from 'react'

// サーバーTTSのURLを順序通りに再生するためのキュー管理フック
export const useAudioQueue = (returnToIdleOrListeningRef: MutableRefObject<() => void>) => {
  const audioQueueRef = useRef<{ url: string; index: number }[]>([])
  const isPlayingRef = useRef(false)
  const nextExpectedIndexRef = useRef(0)
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)

  // 次に再生すべき音声を順序通りに再生する
  const playNextInQueue = useCallback(() => {
    if (isPlayingRef.current) return

    // 返却順が乱れても index で整列してから再生
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

      const handleFinish = () => {
        isPlayingRef.current = false
        nextExpectedIndexRef.current++
        if (audioQueueRef.current.length === 0) {
          returnToIdleOrListeningRef.current()
        }
        playNextInQueue()
      }

      audio.onended = handleFinish
      audio.onerror = handleFinish

      audio.play().catch(handleFinish)
    }
  }, [returnToIdleOrListeningRef])

  // 受信した音声URLをキューに追加する
  const queueAudio = useCallback(
    (url: string, index: number) => {
      audioQueueRef.current.push({ url, index })
      playNextInQueue()
    },
    [playNextInQueue]
  )

  // キューを初期化し、再生中の音声を停止する
  const resetAudioQueue = useCallback(() => {
    audioQueueRef.current = []
    nextExpectedIndexRef.current = 0
    isPlayingRef.current = false
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause()
      audioPlayerRef.current = null
    }
  }, [])

  return {
    audioQueueRef,
    isPlayingRef,
    nextExpectedIndexRef,
    queueAudio,
    resetAudioQueue,
  }
}
