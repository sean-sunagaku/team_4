"use client";

import { useCallback, useRef } from "react";

interface FrameStreamerOptions {
  frameInterval?: number; // ms between frames
  quality?: number; // JPEG quality 0-1
}

interface FrameStreamerCallbacks {
  onFrameSent?: () => void;
  onError?: (error: Error) => void;
}

export function useFrameStreamer(
  options: FrameStreamerOptions = {},
  callbacks: FrameStreamerCallbacks = {}
) {
  const { frameInterval = 100, quality = 0.8 } = options;
  const { onFrameSent, onError } = callbacks;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<number | null>(null);

  /**
   * Capture a single frame from a video element and return as blob
   */
  const captureFrame = useCallback(
    (video: HTMLVideoElement): Promise<Blob | null> => {
      return new Promise((resolve) => {
        if (!canvasRef.current) {
          canvasRef.current = document.createElement("canvas");
        }

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        if (!ctx || video.paused || video.ended) {
          resolve(null);
          return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        canvas.toBlob(
          (blob) => {
            resolve(blob);
          },
          "image/jpeg",
          quality
        );
      });
    },
    [quality]
  );

  /**
   * Start streaming frames from a video element
   */
  const startStreaming = useCallback(
    (video: HTMLVideoElement, sendFrame: (data: ArrayBuffer) => void) => {
      // Stop any existing interval
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }

      intervalRef.current = window.setInterval(async () => {
        try {
          const blob = await captureFrame(video);
          if (blob) {
            const buffer = await blob.arrayBuffer();
            sendFrame(buffer);
            onFrameSent?.();
          }
        } catch (error) {
          onError?.(error as Error);
        }
      }, frameInterval);
    },
    [captureFrame, frameInterval, onFrameSent, onError]
  );

  /**
   * Stop streaming frames
   */
  const stopStreaming = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  /**
   * Check if currently streaming
   */
  const isStreaming = useCallback(() => {
    return intervalRef.current !== null;
  }, []);

  return {
    startStreaming,
    stopStreaming,
    isStreaming,
    captureFrame,
  };
}
