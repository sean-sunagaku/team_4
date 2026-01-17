/**
 * WebSocket client for real-time speed sign detection
 */

const PYTHON_WS_URL = process.env.NEXT_PUBLIC_PYTHON_WS_URL || "ws://localhost:9000";

export interface DetectionResult {
  type: "detection_result" | "error";
  status?: "confirmed" | "detecting" | "no_detection";
  speed_limit?: number | null;
  pending_count?: number;
  timestamp?: string | null;
  message?: string;
}

export type DetectionStatus = "confirmed" | "detecting" | "no_detection";

export interface DetectionCallbacks {
  onResult: (result: DetectionResult) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

export class DetectionWebSocket {
  private ws: WebSocket | null = null;
  private callbacks: DetectionCallbacks;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;

  constructor(callbacks: DetectionCallbacks) {
    this.callbacks = callbacks;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      this.ws = new WebSocket(`${PYTHON_WS_URL}/ws/frames`);

      this.ws.onopen = () => {
        console.log("Detection WebSocket connected");
        this.reconnectAttempts = 0;
        this.callbacks.onConnect?.();
      };

      this.ws.onclose = () => {
        console.log("Detection WebSocket disconnected");
        this.callbacks.onDisconnect?.();
      };

      this.ws.onerror = (error) => {
        console.error("Detection WebSocket error:", error);
        this.callbacks.onError?.(error);
      };

      this.ws.onmessage = (event) => {
        try {
          const result: DetectionResult = JSON.parse(event.data);
          this.callbacks.onResult(result);
        } catch (e) {
          console.error("Failed to parse WebSocket message:", e);
        }
      };
    } catch (error) {
      console.error("Failed to create WebSocket:", error);
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  sendFrame(data: ArrayBuffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

/**
 * Create a new detection WebSocket connection
 */
export function createDetectionConnection(callbacks: DetectionCallbacks): DetectionWebSocket {
  return new DetectionWebSocket(callbacks);
}
