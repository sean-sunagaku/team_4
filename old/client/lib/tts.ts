/**
 * Text-to-Speech utility for speed limit announcements
 */

let japaneseVoice: SpeechSynthesisVoice | null = null;

/**
 * Initialize TTS and load voices
 */
export function initTTS(): void {
  if (typeof window === "undefined") return;

  // Load voices
  const loadVoices = () => {
    const voices = window.speechSynthesis.getVoices();
    japaneseVoice = voices.find((voice) => voice.lang.includes("ja")) || null;
  };

  // Load voices immediately and on change
  loadVoices();
  window.speechSynthesis.onvoiceschanged = loadVoices;
}

/**
 * Speak text using TTS
 */
export function speak(text: string, options?: { rate?: number; pitch?: number }): void {
  if (typeof window === "undefined") return;

  const { rate = 1.0, pitch = 1.0 } = options || {};

  // Cancel any current speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.rate = rate;
  utterance.pitch = pitch;

  if (japaneseVoice) {
    utterance.voice = japaneseVoice;
  }

  window.speechSynthesis.speak(utterance);
}

/**
 * Stop any current speech
 */
export function stopSpeaking(): void {
  if (typeof window === "undefined") return;
  window.speechSynthesis.cancel();
}

/**
 * Check if TTS is currently speaking
 */
export function isSpeaking(): boolean {
  if (typeof window === "undefined") return false;
  return window.speechSynthesis.speaking;
}

/**
 * Announce speed limit with standard format
 */
export function announceSpeedLimit(speed: number): void {
  speak(`最高速度は、${speed}です`);
}

/**
 * Create a speed limit announcer with cooldown
 */
export function createSpeedAnnouncer(cooldownMs: number = 3000) {
  let lastAnnouncedSpeed: number | null = null;
  let lastAnnouncementTime = 0;

  return {
    announce(speed: number): boolean {
      const now = Date.now();

      if (
        speed !== lastAnnouncedSpeed &&
        now - lastAnnouncementTime > cooldownMs
      ) {
        announceSpeedLimit(speed);
        lastAnnouncedSpeed = speed;
        lastAnnouncementTime = now;
        return true;
      }

      return false;
    },

    reset(): void {
      lastAnnouncedSpeed = null;
      lastAnnouncementTime = 0;
    },

    getLastAnnouncedSpeed(): number | null {
      return lastAnnouncedSpeed;
    },
  };
}
