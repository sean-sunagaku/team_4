"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { chatApi } from "@/lib/chat-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Plus,
  Send,
  Trash2,
  MessageSquare,
  Bot,
  ChevronLeft,
  Pencil,
  Check,
  X,
  Menu,
  Volume2,
  VolumeX,
  Mic,
  Loader2,
  Headphones,
  Square,
} from "lucide-react";

// Voice mode states
type VoiceMode = "idle" | "listening" | "recording" | "processing";

// Wake word detection constants
const WAKE_WORDS = [
  "ドライバディ",
  "どらいばでぃ",
  "ドライバ ディ",
  "ドライバーディ",
  "drivebudi",
  "ドライバ ディー",
  "ドライバディー",
];

// Voice detection constants
const SILENCE_THRESHOLD = 0.01; // RMS threshold (0-1)
const SILENCE_DURATION = 1500; // 1.5秒無音で終了
const WAKE_CHECK_INTERVAL = 3000; // 3秒ごとにウェイクワードチェック（録音時間を確保）
const VOICE_ACTIVITY_THRESHOLD = 0.005; // 音声があるとみなす閾値（API呼び出し削減用）- 低めに設定
const RECORDING_TIMEOUT = 15000; // 15秒間音声なしでタイムアウト
const MIN_RECORDING_DURATION = 500; // 最小録音時間（誤検出防止）

interface Message {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: Date;
}

interface Conversation {
  id: string;
  userId: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
  messages?: Message[];
}

export function ChatInterface() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] =
    useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [streamingContent, setStreamingContent] = useState("");
  const [editingConversationId, setEditingConversationId] = useState<
    string | null
  >(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(
    null,
  );
  const [autoSpeak, setAutoSpeak] = useState(true);
  const autoSpeakRef = useRef(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Wake word & silence detection state
  const [voiceMode, setVoiceMode] = useState<VoiceMode>("idle");
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const silenceCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const wakeCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const wakeWordBufferRef = useRef<Blob[]>([]);
  const wakeRecorderRef = useRef<MediaRecorder | null>(null);
  const hasVoiceActivityRef = useRef<boolean>(false);

  // WebSocket for real-time ASR
  const wsRef = useRef<WebSocket | null>(null);
  const audioWorkletRef = useRef<ScriptProcessorNode | null>(null);
  const isUsingWebSocketRef = useRef<boolean>(false);
  const startAudioStreamingRef = useRef<(() => void) | null>(null);

  // Processing cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  // Audio playback state
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  // Function refs to break circular dependencies
  const startListeningRef = useRef<() => void>(() => {});
  const startListeningWithExistingStreamRef = useRef<() => void>(() => {});

  // Keep ref in sync with state
  useEffect(() => {
    autoSpeakRef.current = autoSpeak;
  }, [autoSpeak]);

  // Text-to-speech function
  const speakText = (text: string, messageId: string) => {
    // Stop any current speech
    window.speechSynthesis.cancel();

    if (speakingMessageId === messageId) {
      // If clicking on same message, stop speaking
      setSpeakingMessageId(null);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Find Japanese voice if available
    const voices = window.speechSynthesis.getVoices();
    const japaneseVoice = voices.find((voice) => voice.lang.includes("ja"));
    if (japaneseVoice) {
      utterance.voice = japaneseVoice;
    }

    utterance.onstart = () => setSpeakingMessageId(messageId);
    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);

    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    window.speechSynthesis.cancel();
    setSpeakingMessageId(null);
  };

  // Audio queue for streaming TTS
  const audioQueueRef = useRef<{ url: string; index: number }[]>([]);
  const isPlayingRef = useRef(false);
  const nextExpectedIndexRef = useRef(0);

  // Play next audio in queue
  const playNextInQueue = () => {
    if (isPlayingRef.current) return;

    // Sort queue by index and find next expected audio
    audioQueueRef.current.sort((a, b) => a.index - b.index);

    const nextAudio = audioQueueRef.current.find(
      (item) => item.index === nextExpectedIndexRef.current,
    );

    if (nextAudio) {
      isPlayingRef.current = true;
      setIsAudioPlaying(true);
      audioQueueRef.current = audioQueueRef.current.filter(
        (item) => item.index !== nextAudio.index,
      );

      const audio = new Audio(nextAudio.url);
      audioPlayerRef.current = audio;

      audio.onended = () => {
        isPlayingRef.current = false;
        nextExpectedIndexRef.current++;
        // Check if more audio in queue
        if (audioQueueRef.current.length === 0) {
          setIsAudioPlaying(false);
        }
        playNextInQueue(); // Play next
      };

      audio.onerror = () => {
        isPlayingRef.current = false;
        nextExpectedIndexRef.current++;
        if (audioQueueRef.current.length === 0) {
          setIsAudioPlaying(false);
        }
        playNextInQueue(); // Skip and play next
      };

      audio.play().catch((err) => {
        console.error("Failed to play audio:", err);
        isPlayingRef.current = false;
        nextExpectedIndexRef.current++;
        if (audioQueueRef.current.length === 0) {
          setIsAudioPlaying(false);
        }
        playNextInQueue();
      });
    }
  };

  // Add audio to queue and start playing
  const queueAudio = (url: string, index: number) => {
    audioQueueRef.current.push({ url, index });
    playNextInQueue();
  };

  // Reset audio queue and stop playback
  const resetAudioQueue = () => {
    audioQueueRef.current = [];
    nextExpectedIndexRef.current = 0;
    isPlayingRef.current = false;
    setIsAudioPlaying(false);
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
  };

  // Stop audio playback only (keep processing)
  const stopAudioPlayback = useCallback(() => {
    resetAudioQueue();
    console.log("Audio playback stopped");
  }, []);

  // Start voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus",
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());

        // Process the recorded audio
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        await sendVoiceMessage(audioBlob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Failed to start recording:", error);
      alert(
        "マイクへのアクセスが許可されていません。ブラウザの設定を確認してください。",
      );
    }
  };

  // Stop voice recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Convert blob to base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Remove data URL prefix to get just the base64 data
        const base64Data = base64.split(",")[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Check wake word via server API
  const checkWakeWord = async (
    audioBlob: Blob,
  ): Promise<{ detected: boolean; transcription?: string }> => {
    try {
      const audioData = await blobToBase64(audioBlob);
      const response = await fetch(
        "http://localhost:3001/api/voice/detect-wake-word",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audio: audioData, format: "webm" }),
        },
      );

      // Check if response is ok
      if (!response.ok) {
        console.error(
          "Wake word API error:",
          response.status,
          response.statusText,
        );
        return { detected: false };
      }

      // Get response text first to debug
      const text = await response.text();
      if (!text) {
        console.error("Empty response from wake word API");
        return { detected: false };
      }

      try {
        const result = JSON.parse(text);
        console.log("Wake word result:", result);
        return {
          detected: result.detected,
          transcription: result.transcription,
        };
      } catch (parseError) {
        console.error("Failed to parse wake word response. Raw text:", text);
        console.error("Parse error:", parseError);
        return { detected: false };
      }
    } catch (error) {
      console.error("Wake word check failed:", error);
      return { detected: false };
    }
  };

  // Calculate RMS (Root Mean Square) of audio data
  const calculateRMS = (): number => {
    if (!analyserRef.current) return 0;
    const dataArray = new Uint8Array(analyserRef.current.fftSize);
    analyserRef.current.getByteTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }
    return Math.sqrt(sum / dataArray.length);
  };

  // Stop all listening/recording activities
  const stopListening = useCallback(() => {
    // Clear intervals
    if (wakeCheckIntervalRef.current) {
      clearInterval(wakeCheckIntervalRef.current);
      wakeCheckIntervalRef.current = null;
    }
    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current);
      silenceCheckIntervalRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    isUsingWebSocketRef.current = false;
    startAudioStreamingRef.current = null;

    // Stop audio worklet
    if (audioWorkletRef.current) {
      audioWorkletRef.current.disconnect();
      audioWorkletRef.current = null;
    }

    // Stop wake word recorder
    if (
      wakeRecorderRef.current &&
      wakeRecorderRef.current.state !== "inactive"
    ) {
      wakeRecorderRef.current.stop();
    }
    wakeRecorderRef.current = null;

    // Stop media recorder
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }

    // Stop stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;

    setVoiceMode("idle");
  }, []);

  // Convert Float32Array to PCM16 base64
  const float32ToPCM16Base64 = (float32Array: Float32Array): string => {
    const pcm16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    const bytes = new Uint8Array(pcm16.buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  // Start listening for wake word (LISTENING state) - WebSocket version
  const startListening = useCallback(async () => {
    try {
      // Get microphone access with 16kHz sample rate
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      // Setup Web Audio API
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 2048;
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);

      setVoiceMode("listening");

      // Connect to WebSocket for real-time ASR
      const ws = new WebSocket("ws://localhost:3001/ws/asr");
      wsRef.current = ws;
      let wsSessionReady = false;
      let wsReadyTimeout: NodeJS.Timeout | null = null;

      ws.onopen = () => {
        console.log("WebSocket connected for real-time ASR");
        // Set timeout - if we don't receive 'ready' within 5 seconds, fallback to REST
        wsReadyTimeout = setTimeout(() => {
          if (!wsSessionReady) {
            console.log("WebSocket session timeout - falling back to REST API polling...");
            ws.close();
            startRestApiPolling();
          }
        }, 5000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("ASR message:", data);

          if (data.type === "ready") {
            wsSessionReady = true;
            isUsingWebSocketRef.current = true;
            if (wsReadyTimeout) {
              clearTimeout(wsReadyTimeout);
              wsReadyTimeout = null;
            }
            console.log("ASR session ready, starting audio stream");
            startAudioStreaming();
          } else if (data.type === "transcript") {
            console.log(
              `Transcript: "${data.text}" (wake word: ${data.wakeWordDetected})`,
            );

            if (data.wakeWordDetected) {
              console.log("Wake word detected! Switching to recording mode...");
              stopAudioStreaming();
              // Also clear any REST API polling intervals
              if (wakeCheckIntervalRef.current) {
                clearInterval(wakeCheckIntervalRef.current);
                wakeCheckIntervalRef.current = null;
              }
              if (wakeRecorderRef.current && wakeRecorderRef.current.state !== "inactive") {
                wakeRecorderRef.current.stop();
              }
              startRecordingWithSilenceDetection();
            }
          } else if (data.type === "error") {
            console.error("ASR error:", data.error);
            // Fallback to REST API on ASR error
            if (wsReadyTimeout) {
              clearTimeout(wsReadyTimeout);
              wsReadyTimeout = null;
            }
            ws.close();
            startRestApiPolling();
          }
        } catch (err) {
          console.error("Failed to parse ASR message:", err);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        if (wsReadyTimeout) {
          clearTimeout(wsReadyTimeout);
          wsReadyTimeout = null;
        }
        // Fallback to REST API polling
        console.log("Falling back to REST API polling...");
        startRestApiPolling();
      };

      ws.onclose = () => {
        console.log("WebSocket closed");
        if (wsReadyTimeout) {
          clearTimeout(wsReadyTimeout);
          wsReadyTimeout = null;
        }
      };

      // Function to start streaming audio to WebSocket
      const startAudioStreaming = () => {
        if (!audioContextRef.current || !streamRef.current) return;

        // Use ScriptProcessorNode for audio processing
        const scriptNode = audioContextRef.current.createScriptProcessor(
          4096,
          1,
          1,
        );
        audioWorkletRef.current = scriptNode;

        scriptNode.onaudioprocess = (e) => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            const inputData = e.inputBuffer.getChannelData(0);
            const audioBase64 = float32ToPCM16Base64(inputData);
            wsRef.current.send(
              JSON.stringify({ type: "audio", audio: audioBase64 }),
            );
          }
        };

        const mediaSource = audioContextRef.current.createMediaStreamSource(
          streamRef.current,
        );
        mediaSource.connect(scriptNode);
        scriptNode.connect(audioContextRef.current.destination);
      };

      // Save reference for resuming later
      startAudioStreamingRef.current = startAudioStreaming;

      // Function to stop audio streaming
      const stopAudioStreaming = () => {
        if (audioWorkletRef.current) {
          audioWorkletRef.current.disconnect();
          audioWorkletRef.current = null;
        }
      };

      // Fallback: REST API polling (same as before)
      const startRestApiPolling = () => {
        isUsingWebSocketRef.current = false;
        startAudioStreamingRef.current = null;
        let currentRecorder: MediaRecorder | null = null;
        let audioChunks: Blob[] = [];

        const createNewRecording = () => {
          if (currentRecorder && currentRecorder.state !== "inactive") {
            currentRecorder.stop();
          }

          const mimeType = MediaRecorder.isTypeSupported(
            "audio/webm;codecs=opus",
          )
            ? "audio/webm;codecs=opus"
            : "audio/webm";
          currentRecorder = new MediaRecorder(stream, { mimeType });
          wakeRecorderRef.current = currentRecorder;
          audioChunks = [];

          currentRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              audioChunks.push(event.data);
            }
          };

          currentRecorder.onstop = async () => {
            if (audioChunks.length === 0) return;

            const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
            const result = await checkWakeWord(audioBlob);
            console.log("Wake word check result:", result);

            if (result.detected) {
              console.log("Wake word detected! Switching to recording mode...");
              if (wakeCheckIntervalRef.current) {
                clearInterval(wakeCheckIntervalRef.current);
                wakeCheckIntervalRef.current = null;
              }
              startRecordingWithSilenceDetection();
            }
          };

          currentRecorder.start();
        };

        createNewRecording();

        wakeCheckIntervalRef.current = setInterval(() => {
          if (currentRecorder && currentRecorder.state === "recording") {
            currentRecorder.stop();
          }
          setTimeout(() => {
            if (wakeCheckIntervalRef.current) {
              createNewRecording();
            }
          }, 100);
        }, WAKE_CHECK_INTERVAL);
      };
    } catch (error) {
      console.error("Failed to start listening:", error);
      alert(
        "マイクへのアクセスが許可されていません。ブラウザの設定を確認してください。",
      );
      setVoiceMode("idle");
    }
  }, []);

  // Start recording with silence detection (RECORDING state)
  const startRecordingWithSilenceDetection = useCallback(() => {
    if (!streamRef.current) {
      console.error("No stream available for recording");
      return;
    }

    setVoiceMode("recording");
    audioChunksRef.current = [];

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType });
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    const recordingStartTime = Date.now();
    let recordingTimeoutId: NodeJS.Timeout | null = null;

    mediaRecorder.onstop = async () => {
      // Clear timeout
      if (recordingTimeoutId) {
        clearTimeout(recordingTimeoutId);
        recordingTimeoutId = null;
      }

      // Check minimum recording duration
      const recordingDuration = Date.now() - recordingStartTime;
      if (recordingDuration < MIN_RECORDING_DURATION) {
        console.log("Recording too short, ignoring...");
        // Return to listening without processing
        if (streamRef.current) {
          startListeningWithExistingStreamRef.current();
        } else {
          startListeningRef.current();
        }
        return;
      }

      // Process the recorded audio
      if (audioChunksRef.current.length > 0 && hasVoiceActivityRef.current) {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        setVoiceMode("processing");
        await sendVoiceMessage(audioBlob);
        // After processing, return to listening mode
        setTimeout(() => {
          if (streamRef.current) {
            // Reuse existing stream
            startListeningWithExistingStreamRef.current();
          } else {
            startListeningRef.current();
          }
        }, 500);
      } else {
        // No voice activity detected, return to listening
        console.log("No voice activity detected, returning to listening...");
        if (streamRef.current) {
          startListeningWithExistingStreamRef.current();
        } else {
          startListeningRef.current();
        }
      }
    };

    mediaRecorder.start(100);

    // Recording timeout - if no voice activity for RECORDING_TIMEOUT, cancel
    recordingTimeoutId = setTimeout(() => {
      if (!hasVoiceActivityRef.current) {
        console.log("Recording timeout - no voice activity detected");
        // Clear interval
        if (silenceCheckIntervalRef.current) {
          clearInterval(silenceCheckIntervalRef.current);
          silenceCheckIntervalRef.current = null;
        }
        // Stop recording (will trigger onstop which returns to listening)
        if (mediaRecorder.state !== "inactive") {
          mediaRecorder.stop();
        }
      }
    }, RECORDING_TIMEOUT);

    // Start silence detection
    let lastVoiceTime = Date.now();
    hasVoiceActivityRef.current = false;

    silenceCheckIntervalRef.current = setInterval(() => {
      const rms = calculateRMS();

      if (rms >= SILENCE_THRESHOLD) {
        // Voice detected
        lastVoiceTime = Date.now();
        hasVoiceActivityRef.current = true;
        // Clear recording timeout since we have voice activity
        if (recordingTimeoutId) {
          clearTimeout(recordingTimeoutId);
          recordingTimeoutId = null;
        }
        // Clear silence timer if running
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
      } else {
        // Silence detected
        const silenceDuration = Date.now() - lastVoiceTime;

        // Only trigger silence end if we've had some voice activity first
        if (
          hasVoiceActivityRef.current &&
          silenceDuration >= SILENCE_DURATION
        ) {
          console.log("Silence detected, stopping recording...");
          // Clear interval
          if (silenceCheckIntervalRef.current) {
            clearInterval(silenceCheckIntervalRef.current);
            silenceCheckIntervalRef.current = null;
          }
          // Stop recording
          if (mediaRecorder.state !== "inactive") {
            mediaRecorder.stop();
          }
        }
      }
    }, 100);
  }, []);

  // Start listening with existing stream (for resuming after processing)
  const startListeningWithExistingStream = useCallback(() => {
    if (
      !streamRef.current ||
      !audioContextRef.current ||
      !analyserRef.current
    ) {
      startListening();
      return;
    }

    setVoiceMode("listening");

    // If we were using WebSocket, resume WebSocket audio streaming
    if (isUsingWebSocketRef.current && wsRef.current?.readyState === WebSocket.OPEN && startAudioStreamingRef.current) {
      console.log("Resuming WebSocket audio streaming");
      startAudioStreamingRef.current();
      return;
    }

    // Fallback: REST API polling
    console.log("Using REST API polling for wake word detection");
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const wakeRecorder = new MediaRecorder(streamRef.current, { mimeType });
    wakeRecorderRef.current = wakeRecorder;
    wakeWordBufferRef.current = [];

    wakeRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        wakeWordBufferRef.current.push(event.data);
        if (wakeWordBufferRef.current.length > 8) {
          wakeWordBufferRef.current.shift();
        }
      }
    };

    wakeRecorder.start(250);

    wakeCheckIntervalRef.current = setInterval(async () => {
      const rms = calculateRMS();
      if (rms < VOICE_ACTIVITY_THRESHOLD) return;
      if (wakeWordBufferRef.current.length === 0) return;

      const audioBlob = new Blob(wakeWordBufferRef.current, {
        type: "audio/webm",
      });
      const result = await checkWakeWord(audioBlob);
      console.log("Wake word check result:", result);

      if (result.detected) {
        console.log("Wake word detected! Switching to recording mode...");
        if (wakeCheckIntervalRef.current) {
          clearInterval(wakeCheckIntervalRef.current);
          wakeCheckIntervalRef.current = null;
        }
        if (
          wakeRecorderRef.current &&
          wakeRecorderRef.current.state !== "inactive"
        ) {
          wakeRecorderRef.current.stop();
        }
        startRecordingWithSilenceDetection();
      }
    }, WAKE_CHECK_INTERVAL);
  }, [startRecordingWithSilenceDetection, startListening]);

  // Update refs to break circular dependencies
  useEffect(() => {
    startListeningRef.current = startListening;
    startListeningWithExistingStreamRef.current = startListeningWithExistingStream;
  }, [startListening, startListeningWithExistingStream]);

  // Manual recording start (for the manual button)
  const startManualRecording = useCallback(() => {
    // Stop wake word detection if running
    if (wakeCheckIntervalRef.current) {
      clearInterval(wakeCheckIntervalRef.current);
      wakeCheckIntervalRef.current = null;
    }
    if (
      wakeRecorderRef.current &&
      wakeRecorderRef.current.state !== "inactive"
    ) {
      wakeRecorderRef.current.stop();
    }

    // If we're in listening mode, we have a stream - use it
    if (voiceMode === "listening" && streamRef.current) {
      startRecordingWithSilenceDetection();
    } else {
      // Otherwise start fresh
      startRecording();
    }
  }, [voiceMode, startRecordingWithSilenceDetection]);

  // Cancel recording and return to listening
  const cancelRecording = useCallback(() => {
    // Stop recording without sending
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.onstop = null; // Prevent sending
      mediaRecorderRef.current.stop();
    }
    if (silenceCheckIntervalRef.current) {
      clearInterval(silenceCheckIntervalRef.current);
      silenceCheckIntervalRef.current = null;
    }
    audioChunksRef.current = [];

    // Return to listening
    if (streamRef.current) {
      startListeningWithExistingStream();
    } else {
      startListening();
    }
  }, [startListeningWithExistingStream, startListening]);

  // Cancel processing and return to listening
  const cancelProcessing = useCallback(() => {
    console.log("Canceling processing...");

    // Abort any ongoing fetch requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Stop audio playback
    resetAudioQueue();

    // Reset loading state
    setLoading(false);
    setIsProcessingVoice(false);
    setStreamingContent("");

    // Return to listening mode
    setVoiceMode("listening");
    if (streamRef.current) {
      startListeningWithExistingStream();
    } else {
      startListening();
    }
  }, [startListeningWithExistingStream, startListening]);

  // Send voice message
  const sendVoiceMessage = async (audioBlob: Blob) => {
    setIsProcessingVoice(true);
    setLoading(true);
    setStreamingContent("");

    // Reset audio queue for new response
    resetAudioQueue();

    try {
      const audioData = await blobToBase64(audioBlob);
      let convId = currentConversation?.id;

      await chatApi.sendVoiceMessage(audioData, "webm", convId, {
        onTranscription: (text) => {
          // Add user message to UI
          const userMessage: Message = {
            id: Date.now().toString(),
            conversationId: convId || "temp",
            role: "user",
            content: text,
            createdAt: new Date(),
          };
          setMessages((prev) => [...prev, userMessage]);
        },
        onConversationCreated: (id) => {
          convId = id;
          chatApi.getConversation(id).then((conv) => {
            setCurrentConversation(conv);
            setConversations((prev) => [conv, ...prev]);
          });
        },
        onChunk: (chunk) => {
          setStreamingContent((prev) => prev + chunk);
        },
        onAudio: (url, index) => {
          // Streaming TTS: queue audio chunks and play in order
          console.log(`Qwen TTS audio[${index}]:`, url);
          if (autoSpeakRef.current) {
            queueAudio(url, index ?? 0);
          }
        },
        onDone: (content, responseConvId) => {
          const newMessageId = Date.now().toString();
          setMessages((prev) => [
            ...prev,
            {
              id: newMessageId,
              conversationId: responseConvId,
              role: "assistant",
              content: content,
              createdAt: new Date(),
            },
          ]);
          setStreamingContent("");
          loadConversations();
        },
        onError: (error) => {
          console.error("Voice chat error:", error);
          // Don't show alert for abort errors
          if (!error.includes("abort")) {
            alert(`音声チャットエラー: ${error}`);
          }
        },
      });
    } catch (error) {
      // Check if this was an intentional abort
      if (error instanceof Error && error.name === "AbortError") {
        console.log("Voice message was cancelled");
      } else {
        console.error("Failed to send voice message:", error);
        alert("音声メッセージの送信に失敗しました。");
      }
    } finally {
      setIsProcessingVoice(false);
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  useEffect(() => {
    loadConversations();
    // Load voices (needed for some browsers)
    window.speechSynthesis.getVoices();
  }, []);

  // Auto-start listening mode on page load
  useEffect(() => {
    // Start listening after a short delay to allow component to mount
    const timer = setTimeout(() => {
      startListening();
    }, 500);

    return () => {
      clearTimeout(timer);
      stopListening();
    };
  }, [startListening, stopListening]);

  // Cleanup speech on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const loadConversations = async () => {
    try {
      setLoadingConversations(true);
      const data = await chatApi.getConversations();
      setConversations(data);
    } catch (error) {
      console.error("Failed to load conversations:", error);
    } finally {
      setLoadingConversations(false);
    }
  };

  const createNewConversation = async () => {
    try {
      const conversation = await chatApi.createConversation();
      setConversations([conversation, ...conversations]);
      setCurrentConversation(conversation);
      setMessages([]);
    } catch (error) {
      console.error("Failed to create conversation:", error);
    }
  };

  const selectConversation = async (conversation: Conversation) => {
    try {
      setLoading(true);
      const data = await chatApi.getConversation(conversation.id);
      setCurrentConversation(data);
      setMessages(data.messages || []);
    } catch (error) {
      console.error("Failed to load conversation:", error);
    } finally {
      setLoading(false);
    }
  };

  const deleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await chatApi.deleteConversation(id);
      setConversations(conversations.filter((c) => c.id !== id));
      if (currentConversation?.id === id) {
        setCurrentConversation(null);
        setMessages([]);
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  };

  const startEditingTitle = (conv: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingConversationId(conv.id);
    setEditingTitle(conv.title || "");
  };

  const cancelEditingTitle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingConversationId(null);
    setEditingTitle("");
  };

  const saveConversationTitle = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!editingTitle.trim()) {
      setEditingConversationId(null);
      return;
    }
    try {
      await chatApi.updateTitle(id, editingTitle.trim());
      setConversations(
        conversations.map((c) =>
          c.id === id ? { ...c, title: editingTitle.trim() } : c,
        ),
      );
      if (currentConversation?.id === id) {
        setCurrentConversation({
          ...currentConversation,
          title: editingTitle.trim(),
        });
      }
      setEditingConversationId(null);
      setEditingTitle("");
    } catch (error) {
      console.error("Failed to update title:", error);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const trimmedInput = input.trim();

    let convId = currentConversation?.id;

    if (!convId) {
      try {
        const newConv = await chatApi.createConversation();
        setConversations([newConv, ...conversations]);
        setCurrentConversation(newConv);
        convId = newConv.id;
      } catch (error) {
        console.error("Failed to create conversation:", error);
        return;
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      conversationId: convId,
      role: "user",
      content: trimmedInput,
      createdAt: new Date(),
    };

    setMessages([...messages, userMessage]);
    setInput("");
    setLoading(true);
    setStreamingContent("");

    try {
      await chatApi.sendMessageStream(
        convId,
        userMessage.content,
        (chunk) => {
          setStreamingContent((prev) => prev + chunk);
        },
        (message) => {
          const newMessageId = Date.now().toString();
          setMessages((prev) => [
            ...prev,
            {
              ...message,
              id: newMessageId,
              conversationId: convId!,
              createdAt: new Date(),
            },
          ]);
          setStreamingContent("");
          loadConversations();
          // Auto-speak the AI response
          if (autoSpeakRef.current && message.content) {
            setTimeout(() => speakText(message.content, newMessageId), 100);
          }
        },
        (error) => {
          console.error("Streaming error:", error);
        },
      );
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex h-screen bg-neutral-50">
      {/* Sidebar */}
      <div
        className={`bg-white border-r border-neutral-200 flex flex-col transition-all duration-300 ease-in-out overflow-hidden ${
          sidebarOpen ? "w-72 min-w-72 max-w-72" : "w-16 min-w-16 max-w-16"
        }`}
      >
        <div
          className={`p-4 border-b border-neutral-200 ${!sidebarOpen && "p-2"}`}
        >
          {sidebarOpen ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-neutral-700" />
                  <span className="font-semibold text-neutral-900 whitespace-nowrap">
                    AI Chat
                  </span>
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-1.5 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded-md transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
              <Button
                onClick={createNewConversation}
                className="w-full bg-neutral-900 hover:bg-neutral-800 text-white"
                size="sm"
              >
                <Plus className="mr-2 h-4 w-4" />
                New conversation
              </Button>
            </>
          ) : (
            <Button
              onClick={createNewConversation}
              className="w-full bg-neutral-900 hover:bg-neutral-800 text-white p-2"
              size="sm"
              title="New conversation"
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1 overflow-hidden">
          <div className="p-2 overflow-hidden">
            {loadingConversations ? (
              <div
                className={`text-center text-neutral-400 py-4 text-sm ${!sidebarOpen && "hidden"}`}
              >
                Loading...
              </div>
            ) : conversations.length === 0 ? (
              <div
                className={`text-center text-neutral-400 py-4 text-sm ${!sidebarOpen && "hidden"}`}
              >
                No conversations
              </div>
            ) : (
              <div className="space-y-1 w-full">
                {conversations.map((conv) => {
                  const isEditing = editingConversationId === conv.id;
                  const isSelected = currentConversation?.id === conv.id;

                  return (
                    <div
                      key={conv.id}
                      className={`group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-all duration-200 overflow-hidden ${
                        isSelected ? "bg-neutral-100" : "hover:bg-neutral-50"
                      } ${!sidebarOpen ? "justify-center px-0" : ""}`}
                      onClick={() => selectConversation(conv)}
                      title={conv.title || "New conversation"}
                    >
                      <MessageSquare
                        className={`h-4 w-4 text-neutral-400 shrink-0 ${
                          !sidebarOpen && isSelected
                            ? "scale-110 text-neutral-600"
                            : ""
                        }`}
                      />

                      {sidebarOpen && isEditing && (
                        <div
                          className="flex items-center gap-1 flex-1 min-w-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                saveConversationTitle(
                                  conv.id,
                                  e as unknown as React.MouseEvent,
                                );
                              } else if (e.key === "Escape") {
                                cancelEditingTitle(
                                  e as unknown as React.MouseEvent,
                                );
                              }
                            }}
                            className="flex-1 min-w-0 text-sm bg-white border border-neutral-300 rounded px-1.5 py-0.5 text-neutral-900 focus:outline-none focus:border-neutral-500"
                            autoFocus
                          />
                          <button
                            onClick={(e) => saveConversationTitle(conv.id, e)}
                            className="shrink-0 p-1 text-emerald-600 hover:text-emerald-700"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={cancelEditingTitle}
                            className="shrink-0 p-1 text-neutral-400 hover:text-neutral-600"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}

                      {sidebarOpen && !isEditing && (
                        <>
                          <span className="text-sm text-neutral-700 truncate flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap block max-w-40">
                            {conv.title || "New conversation"}
                          </span>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              onClick={(e) => startEditingTitle(conv, e)}
                              className="p-1 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              onClick={(e) => deleteConversation(conv.id, e)}
                              className="p-1 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col bg-white">
        {/* Header */}
        <div className="h-14 border-b border-neutral-200 px-6 flex items-center gap-3">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 -ml-1.5 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded-md transition-colors"
            >
              <Menu className="h-4 w-4" />
            </button>
          )}
          <h1 className="text-sm font-medium text-neutral-900 flex-1">
            {currentConversation?.title || "New conversation"}
          </h1>
          <button
            onClick={() => {
              setAutoSpeak(!autoSpeak);
              if (speakingMessageId) stopSpeaking();
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition-colors ${
              autoSpeak
                ? "bg-neutral-900 text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
            title={autoSpeak ? "Auto-read ON" : "Auto-read OFF"}
          >
            {autoSpeak ? (
              <Volume2 className="h-3.5 w-3.5" />
            ) : (
              <VolumeX className="h-3.5 w-3.5" />
            )}
            <span>{autoSpeak ? "Auto" : "Off"}</span>
          </button>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1">
          <div className="max-w-3xl mx-auto py-6 px-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="h-12 w-12 rounded-full bg-neutral-100 flex items-center justify-center mb-4">
                  <Bot className="h-6 w-6 text-neutral-500" />
                </div>
                <h2 className="text-lg font-medium text-neutral-900 mb-1">
                  How can I help you?
                </h2>
                <p className="text-sm text-neutral-500">
                  Start a conversation by sending a message
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {messages.map((message) => (
                  <div key={message.id} className="space-y-2">
                    <div
                      className={`flex gap-3 ${
                        message.role === "user"
                          ? "justify-end"
                          : "justify-start"
                      }`}
                    >
                      {message.role === "assistant" && (
                        <div className="shrink-0 h-8 w-8 rounded-full bg-neutral-900 flex items-center justify-center">
                          <Bot className="h-4 w-4 text-white" />
                        </div>
                      )}
                      <div
                        className={`px-4 py-2.5 rounded-lg max-w-[80%] ${
                          message.role === "user"
                            ? "bg-neutral-900 text-white"
                            : "bg-neutral-100 text-neutral-900"
                        }`}
                      >
                        {message.role === "user" ? (
                          <p className="text-sm whitespace-pre-wrap">
                            {message.content}
                          </p>
                        ) : (
                          <div className="text-sm markdown-content">
                            <ReactMarkdown>{message.content}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                      {message.role === "assistant" && (
                        <button
                          onClick={() => speakText(message.content, message.id)}
                          className={`shrink-0 p-1.5 rounded-md transition-colors ${
                            speakingMessageId === message.id
                              ? "bg-neutral-200 text-neutral-700"
                              : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
                          }`}
                          title={
                            speakingMessageId === message.id
                              ? "Stop"
                              : "Read aloud"
                          }
                        >
                          {speakingMessageId === message.id ? (
                            <VolumeX className="h-4 w-4" />
                          ) : (
                            <Volume2 className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Loading / Streaming */}
                {loading && (
                  <div className="space-y-2">
                    <div className="flex gap-3 justify-start">
                      <div className="shrink-0 h-8 w-8 rounded-full bg-neutral-900 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                      <div className="px-4 py-2.5 rounded-lg bg-neutral-100 max-w-[80%]">
                        {streamingContent ? (
                          <div className="text-sm text-neutral-900 markdown-content">
                            <ReactMarkdown>{streamingContent}</ReactMarkdown>
                            <span className="inline-block w-1.5 h-4 bg-neutral-400 ml-0.5 animate-pulse" />
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <div className="h-1.5 w-1.5 bg-neutral-400 rounded-full animate-pulse" />
                            <div className="h-1.5 w-1.5 bg-neutral-400 rounded-full animate-pulse [animation-delay:150ms]" />
                            <div className="h-1.5 w-1.5 bg-neutral-400 rounded-full animate-pulse [animation-delay:300ms]" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Voice Input (Default) */}
        <div className="border-t border-neutral-200 p-6">
          <div className="max-w-3xl mx-auto">
            {/* Voice Mode Display */}
            <div className="flex flex-col items-center gap-4">
              {/* Main Voice Status/Button */}
              {voiceMode === "idle" && (
                <>
                  <button
                    onClick={startListening}
                    className="w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg bg-blue-600 hover:bg-blue-500 text-white hover:scale-105 ring-4 ring-blue-200"
                    title="音声待機モードを開始"
                  >
                    <Headphones className="h-8 w-8" />
                  </button>
                  <div className="text-sm text-blue-600 text-center">
                    <div className="font-medium">タップして音声待機モードに戻る</div>
                    <div className="text-neutral-400 text-xs mt-1">
                      「ドライバディ」で呼びかけられます
                    </div>
                  </div>
                </>
              )}

              {voiceMode === "listening" && (
                <>
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full flex items-center justify-center bg-blue-100 border-2 border-blue-400 relative">
                      <Headphones className="h-8 w-8 text-blue-600" />
                      <span className="absolute -top-1 -right-1 h-3 w-3 bg-blue-500 rounded-full animate-pulse" />
                    </div>
                    {/* Stop listening button */}
                    <button
                      onClick={stopListening}
                      className="absolute -top-1 -left-1 h-6 w-6 rounded-full bg-neutral-200 hover:bg-neutral-300 flex items-center justify-center text-neutral-500 hover:text-neutral-700 transition-colors"
                      title="音声待機を停止"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="text-sm text-blue-600 text-center">
                    <span className="font-medium">「ドライバディ」</span>
                    と呼んでください
                  </div>
                  <button
                    onClick={startManualRecording}
                    className="mt-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-sm flex items-center gap-2 transition-colors"
                  >
                    <Mic className="h-4 w-4" />
                    手動で話す
                  </button>
                </>
              )}

              {voiceMode === "recording" && (
                <>
                  <div className="w-20 h-20 rounded-full flex items-center justify-center bg-red-500 text-white animate-pulse shadow-lg relative">
                    <Mic className="h-8 w-8" />
                    <span className="absolute inset-0 rounded-full border-4 border-red-300 animate-ping" />
                  </div>
                  <div className="text-sm text-red-500 text-center">
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-2 w-2 bg-red-500 rounded-full animate-pulse" />
                      録音中... 話し終わると自動送信
                    </span>
                  </div>
                  <button
                    onClick={cancelRecording}
                    className="mt-2 px-4 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 rounded-lg text-sm flex items-center gap-2 transition-colors"
                  >
                    <Square className="h-4 w-4" />
                    キャンセル
                  </button>
                </>
              )}

              {voiceMode === "processing" && (
                <>
                  <div className="w-20 h-20 rounded-full flex items-center justify-center bg-neutral-300 text-neutral-500 shadow-lg relative">
                    {isAudioPlaying ? (
                      <Volume2 className="h-8 w-8" />
                    ) : (
                      <Loader2 className="h-8 w-8 animate-spin" />
                    )}
                  </div>
                  <div className="text-sm text-neutral-500">
                    {isAudioPlaying ? "音声再生中..." : "処理中..."}
                  </div>
                  <div className="flex gap-2 mt-2">
                    {isAudioPlaying && (
                      <button
                        onClick={stopAudioPlayback}
                        className="px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-700 rounded-lg text-sm flex items-center gap-2 transition-colors"
                      >
                        <VolumeX className="h-4 w-4" />
                        音声を停止
                      </button>
                    )}
                    <button
                      onClick={cancelProcessing}
                      className="px-4 py-2 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 rounded-lg text-sm flex items-center gap-2 transition-colors"
                    >
                      <X className="h-4 w-4" />
                      キャンセル
                    </button>
                  </div>
                </>
              )}

              {/* Text Input (Secondary) */}
              <div className="w-full flex gap-2 mt-4">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="または、テキストを入力..."
                  disabled={
                    loading ||
                    voiceMode === "recording" ||
                    voiceMode === "processing"
                  }
                  className="flex-1 bg-neutral-50 border-neutral-200 text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-0 text-sm"
                />
                <Button
                  onClick={sendMessage}
                  disabled={
                    loading ||
                    !input.trim() ||
                    voiceMode === "recording" ||
                    voiceMode === "processing"
                  }
                  className="bg-neutral-900 hover:bg-neutral-800 text-white px-3 disabled:opacity-40"
                  size="sm"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
