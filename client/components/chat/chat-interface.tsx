"use client";

import { useState, useEffect, useRef } from "react";
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
  MicOff,
  Loader2,
} from "lucide-react";

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
      audioQueueRef.current = audioQueueRef.current.filter(
        (item) => item.index !== nextAudio.index,
      );

      const audio = new Audio(nextAudio.url);
      audioPlayerRef.current = audio;

      audio.onended = () => {
        isPlayingRef.current = false;
        nextExpectedIndexRef.current++;
        playNextInQueue(); // Play next
      };

      audio.onerror = () => {
        isPlayingRef.current = false;
        nextExpectedIndexRef.current++;
        playNextInQueue(); // Skip and play next
      };

      audio.play().catch((err) => {
        console.error("Failed to play audio:", err);
        isPlayingRef.current = false;
        nextExpectedIndexRef.current++;
        playNextInQueue();
      });
    }
  };

  // Add audio to queue and start playing
  const queueAudio = (url: string, index: number) => {
    audioQueueRef.current.push({ url, index });
    playNextInQueue();
  };

  // Reset audio queue
  const resetAudioQueue = () => {
    audioQueueRef.current = [];
    nextExpectedIndexRef.current = 0;
    isPlayingRef.current = false;
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
  };

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
          alert(`音声チャットエラー: ${error}`);
        },
      });
    } catch (error) {
      console.error("Failed to send voice message:", error);
      alert("音声メッセージの送信に失敗しました。");
    } finally {
      setIsProcessingVoice(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
    // Load voices (needed for some browsers)
    window.speechSynthesis.getVoices();
  }, []);

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
        className={`bg-white border-r border-neutral-200 flex flex-col transition-all duration-300 ease-in-out ${
          sidebarOpen ? "w-72" : "w-16"
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

        <ScrollArea className="flex-1">
          <div className="p-2">
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
              <div className="space-y-1">
                {conversations.map((conv) => {
                  const isEditing = editingConversationId === conv.id;
                  const isSelected = currentConversation?.id === conv.id;

                  return (
                    <div
                      key={conv.id}
                      className={`group flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-all duration-200 ${
                        isSelected ? "bg-neutral-100" : "hover:bg-neutral-50"
                      } ${!sidebarOpen ? "justify-center px-0" : ""}`}
                      onClick={() => selectConversation(conv)}
                      title={
                        !sidebarOpen
                          ? conv.title || "New conversation"
                          : undefined
                      }
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
                          <span className="text-sm text-neutral-700 truncate flex-1 min-w-0">
                            {conv.title || "New conversation"}
                          </span>
                          <button
                            onClick={(e) => startEditingTitle(conv, e)}
                            className="shrink-0 p-1 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => deleteConversation(conv.id, e)}
                            className="shrink-0 p-1 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
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
                        <p className="text-sm whitespace-pre-wrap">
                          {message.content}
                        </p>
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
                          <p className="text-sm text-neutral-900 whitespace-pre-wrap">
                            {streamingContent}
                            <span className="inline-block w-1.5 h-4 bg-neutral-400 ml-0.5 animate-pulse" />
                          </p>
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
            {/* Main Voice Button */}
            <div className="flex flex-col items-center gap-4">
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={loading && !isRecording}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg ${
                  isRecording
                    ? "bg-red-500 hover:bg-red-600 text-white scale-110 animate-pulse"
                    : isProcessingVoice
                      ? "bg-neutral-300 text-neutral-500"
                      : "bg-neutral-900 hover:bg-neutral-800 text-white hover:scale-105"
                }`}
                title={isRecording ? "録音停止" : "タップして話す"}
              >
                {isProcessingVoice ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : isRecording ? (
                  <MicOff className="h-8 w-8" />
                ) : (
                  <Mic className="h-8 w-8" />
                )}
              </button>

              {/* Status Text */}
              <div className="text-sm text-neutral-500 h-6">
                {isRecording ? (
                  <span className="flex items-center gap-2 text-red-500">
                    <span className="h-2 w-2 bg-red-500 rounded-full animate-pulse" />
                    録音中... タップして停止
                  </span>
                ) : isProcessingVoice ? (
                  <span>処理中...</span>
                ) : (
                  <span>タップして話す</span>
                )}
              </div>

              {/* Text Input (Secondary) */}
              <div className="w-full flex gap-2 mt-2">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="または、テキストを入力..."
                  disabled={loading || isRecording}
                  className="flex-1 bg-neutral-50 border-neutral-200 text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:ring-0 text-sm"
                />
                <Button
                  onClick={sendMessage}
                  disabled={loading || !input.trim() || isRecording}
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
