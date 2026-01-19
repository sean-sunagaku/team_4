// 録音開始/終了の簡易トーンを鳴らす
// 録音開始/終了をユーザーに伝える短い通知音を生成する
export const playNotificationSound = (type: 'wake' | 'end') => {
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
    playTone(880, now, 0.12, 0.3)
    playTone(1108.73, now + 0.08, 0.15, 0.3)
  } else {
    playTone(1108.73, now, 0.12, 0.25)
    playTone(880, now + 0.08, 0.15, 0.25)
  }
}

// 音声BlobをAPI送信用のBase64に変換する
// MediaRecorder の Blob を API 送信用の Base64 に変換する
export const blobToBase64 = (blob: Blob): Promise<string> => {
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

// WebSocket ASR に流すための PCM16 Base64 変換
// WebSocket ASR が期待する PCM16(Base64) 形式に変換する
export const float32ToPCM16Base64 = (float32Array: Float32Array): string => {
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
