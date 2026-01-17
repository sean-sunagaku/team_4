"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Play, Square, Car, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { VideoUploader } from "./VideoUploader";
import { SpeedLimitDisplay } from "./SpeedLimitDisplay";
import { useDrivingSession } from "@/hooks/useDrivingSession";
import { initTTS, speak } from "@/lib/tts";

export function DrivingInterface() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);

  // TTS state for cooldown
  const lastAnnouncementTimeRef = useRef<number>(0);

  const {
    isPlaying,
    isConnected,
    speedLimit,
    detectionStatus,
    pendingCount,
    start,
    stop,
    reset,
  } = useDrivingSession({
    frameInterval: 100, // 10 FPS
  });

  // Initialize TTS
  useEffect(() => {
    initTTS();
  }, []);

  // Announce speed while detecting (repeatable with cooldown)
  useEffect(() => {
    if (detectionStatus !== "detecting" || speedLimit === null) return;

    const now = Date.now();
    if (now - lastAnnouncementTimeRef.current > 3000) {
      speak(`標識を検知しました。最高速度は${speedLimit}キロです`);
      lastAnnouncementTimeRef.current = now;
    }
  }, [detectionStatus, speedLimit, pendingCount]);

  // Handle video file selection
  const handleVideoSelected = useCallback(
    (file: File) => {
      // Revoke previous URL
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }

      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);

      // Reset state
      reset();
      lastAnnouncementTimeRef.current = 0;
    },
    [videoUrl, reset]
  );

  // Start driving session
  const startDriving = useCallback(() => {
    if (videoRef.current) {
      start(videoRef.current);
    }
  }, [start]);

  // Stop driving session
  const stopDriving = useCallback(() => {
    stop();
  }, [stop]);

  // Handle video ended
  const handleVideoEnded = useCallback(() => {
    stopDriving();
  }, [stopDriving]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopDriving();
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [stopDriving, videoUrl]);

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/" className="text-neutral-500 hover:text-neutral-700">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <Car className="w-5 h-5 text-neutral-700" />
            <h1 className="font-semibold text-neutral-900">Driving Mode</h1>
          </div>
          <div className="flex-1" />
          <div
            className={`flex items-center gap-2 text-sm ${
              isConnected ? "text-green-600" : "text-neutral-400"
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-green-500" : "bg-neutral-300"
              }`}
            />
            {isConnected ? "Connected" : "Disconnected"}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Video + Controls */}
          <div className="lg:col-span-2 space-y-6">
            {/* Video Area */}
            <div className="bg-white rounded-xl shadow-lg border border-neutral-200 overflow-hidden">
              {videoUrl ? (
                <div className="relative aspect-video bg-black">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    onEnded={handleVideoEnded}
                    className="w-full h-full object-contain"
                    playsInline
                  />
                </div>
              ) : (
                <div className="aspect-video bg-neutral-100 flex items-center justify-center">
                  <p className="text-neutral-500">No video selected</p>
                </div>
              )}
            </div>

            {/* Video Uploader */}
            {!isPlaying && (
              <VideoUploader
                onVideoSelected={handleVideoSelected}
                selectedFile={videoFile}
              />
            )}

            {/* Controls */}
            <div className="flex gap-4">
              {!isPlaying ? (
                <Button
                  onClick={startDriving}
                  disabled={!videoUrl}
                  size="lg"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                >
                  <Play className="w-5 h-5 mr-2" />
                  Start
                </Button>
              ) : (
                <Button
                  onClick={stopDriving}
                  size="lg"
                  variant="destructive"
                  className="flex-1"
                >
                  <Square className="w-5 h-5 mr-2" />
                  Stop
                </Button>
              )}
            </div>
          </div>

          {/* Right: Speed Display */}
          <div className="space-y-6">
            <SpeedLimitDisplay
              speedLimit={speedLimit}
              status={detectionStatus}
              pendingCount={pendingCount}
            />

            {/* Status Info */}
            <div className="bg-white rounded-xl shadow-lg border border-neutral-200 p-4">
              <h3 className="font-medium text-neutral-900 mb-3">Status</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Detection</span>
                  <span
                    className={
                      detectionStatus === "confirmed"
                        ? "text-green-600 font-medium"
                        : detectionStatus === "detecting"
                        ? "text-yellow-600"
                        : "text-neutral-400"
                    }
                  >
                    {detectionStatus === "confirmed"
                      ? "Confirmed"
                      : detectionStatus === "detecting"
                      ? "Detecting..."
                      : "None"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Video</span>
                  <span
                    className={isPlaying ? "text-green-600" : "text-neutral-400"}
                  >
                    {isPlaying ? "Playing" : "Stopped"}
                  </span>
                </div>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
              <h3 className="font-medium text-blue-900 mb-2">How to use</h3>
              <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                <li>Upload a dashcam video</li>
                <li>Press Start</li>
                <li>Speed limits will be announced</li>
              </ol>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
