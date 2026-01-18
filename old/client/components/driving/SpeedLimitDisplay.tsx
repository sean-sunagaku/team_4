"use client";

interface SpeedLimitDisplayProps {
  speedLimit: number | null;
  status: "confirmed" | "detecting" | "no_detection";
  pendingCount?: number;
}

export function SpeedLimitDisplay({ speedLimit, status, pendingCount }: SpeedLimitDisplayProps) {
  return (
    <div className="flex flex-col items-center justify-center p-6 bg-white rounded-xl shadow-lg border border-neutral-200">
      {/* Speed Sign Visualization */}
      <div
        className={`relative w-32 h-32 rounded-full flex items-center justify-center transition-all duration-300 ${
          status === "confirmed"
            ? "bg-white border-[12px] border-red-500"
            : status === "detecting"
            ? "bg-white border-[12px] border-yellow-400 animate-pulse"
            : "bg-neutral-100 border-[12px] border-neutral-300"
        }`}
      >
        {speedLimit !== null ? (
          <span
            className={`text-4xl font-bold ${
              status === "confirmed" ? "text-neutral-900" : "text-neutral-500"
            }`}
          >
            {speedLimit}
          </span>
        ) : (
          <span className="text-3xl text-neutral-400">--</span>
        )}
      </div>

      {/* Status Text */}
      <div className="mt-4 text-center">
        {status === "confirmed" && speedLimit !== null && (
          <p className="text-lg font-semibold text-neutral-900">
            {speedLimit} km/h
          </p>
        )}
        {status === "detecting" && (
          <p className="text-sm text-yellow-600">
            {pendingCount !== undefined ? `${pendingCount}/3` : ""}
          </p>
        )}
        {status === "no_detection" && (
          <p className="text-sm text-neutral-500">
          </p>
        )}
      </div>
    </div>
  );
}
