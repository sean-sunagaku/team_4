"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { DetectionWebSocket, DetectionResult, DetectionStatus } from "@/lib/detection-api";
import { useFrameStreamer } from "./useFrameStreamer";

interface DrivingSessionState {
  isPlaying: boolean;
  isConnected: boolean;
  speedLimit: number | null;
  detectionStatus: DetectionStatus;
  pendingCount: number;
}

interface DrivingSessionOptions {
  frameInterval?: number;
  onSpeedConfirmed?: (speed: number) => void;
}

export function useDrivingSession(options: DrivingSessionOptions = {}) {
  const { frameInterval = 100, onSpeedConfirmed } = options;

  const [state, setState] = useState<DrivingSessionState>({
    isPlaying: false,
    isConnected: false,
    speedLimit: null,
    detectionStatus: "no_detection",
    pendingCount: 0,
  });

  const wsRef = useRef<DetectionWebSocket | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastConfirmedSpeedRef = useRef<number | null>(null);

  const { startStreaming, stopStreaming } = useFrameStreamer({
    frameInterval,
  });

  // Handle detection results
  const handleResult = useCallback(
    (result: DetectionResult) => {
      if (result.type === "detection_result") {
        const status = result.status || "no_detection";

        setState((prev) => ({
          ...prev,
          detectionStatus: status,
          speedLimit: result.speed_limit ?? prev.speedLimit,
          pendingCount: result.pending_count ?? 0,
        }));

        // Notify on new confirmed speed
        if (
          status === "confirmed" &&
          result.speed_limit !== null &&
          result.speed_limit !== undefined &&
          result.speed_limit !== lastConfirmedSpeedRef.current
        ) {
          lastConfirmedSpeedRef.current = result.speed_limit;
          onSpeedConfirmed?.(result.speed_limit);
        }
      }
    },
    [onSpeedConfirmed]
  );

  // Start session
  const start = useCallback(
    (video: HTMLVideoElement) => {
      if (!video) return;

      videoRef.current = video;

      // Create and connect WebSocket
      wsRef.current = new DetectionWebSocket({
        onResult: handleResult,
        onConnect: () => {
          setState((prev) => ({ ...prev, isConnected: true }));
        },
        onDisconnect: () => {
          setState((prev) => ({ ...prev, isConnected: false }));
        },
      });

      wsRef.current.connect();

      // Start video
      video.play();
      setState((prev) => ({ ...prev, isPlaying: true }));

      // Start frame streaming
      startStreaming(video, (data) => {
        wsRef.current?.sendFrame(data);
      });
    },
    [handleResult, startStreaming]
  );

  // Stop session
  const stop = useCallback(() => {
    // Stop streaming
    stopStreaming();

    // Pause video
    if (videoRef.current) {
      videoRef.current.pause();
    }

    // Disconnect WebSocket
    if (wsRef.current) {
      wsRef.current.disconnect();
      wsRef.current = null;
    }

    setState((prev) => ({
      ...prev,
      isPlaying: false,
      isConnected: false,
    }));
  }, [stopStreaming]);

  // Reset state
  const reset = useCallback(() => {
    stop();
    setState({
      isPlaying: false,
      isConnected: false,
      speedLimit: null,
      detectionStatus: "no_detection",
      pendingCount: 0,
    });
    lastConfirmedSpeedRef.current = null;
  }, [stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return {
    ...state,
    start,
    stop,
    reset,
  };
}
