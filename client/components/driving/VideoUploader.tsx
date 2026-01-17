"use client";

import { useRef, useState } from "react";
import { Upload, Film, FileVideo } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VideoUploaderProps {
  onVideoSelected: (file: File) => void;
  selectedFile: File | null;
}

export function VideoUploader({ onVideoSelected, selectedFile }: VideoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isLoadingSample, setIsLoadingSample] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("video/")) {
      onVideoSelected(file);
    }
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("video/")) {
      onVideoSelected(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleUseSampleVideo = async () => {
    setIsLoadingSample(true);
    try {
      const response = await fetch("/sample_movie.mp4");
      const blob = await response.blob();
      const file = new File([blob], "sample_movie.mp4", { type: "video/mp4" });
      onVideoSelected(file);
    } catch (error) {
      console.error("Failed to load sample video:", error);
    } finally {
      setIsLoadingSample(false);
    }
  };

  return (
    <div className="w-full space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        onChange={handleFileChange}
        className="hidden"
      />

      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
          transition-all duration-200
          ${selectedFile
            ? "border-green-400 bg-green-50"
            : "border-neutral-300 hover:border-neutral-400 bg-neutral-50 hover:bg-neutral-100"
          }
        `}
      >
        {selectedFile ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <Film className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="font-medium text-neutral-900">{selectedFile.name}</p>
              <p className="text-sm text-neutral-500">
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
            <Button variant="outline" size="sm" className="mt-2">
              Change File
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-neutral-200 flex items-center justify-center">
              <Upload className="w-6 h-6 text-neutral-500" />
            </div>
            <div>
              <p className="font-medium text-neutral-700">Drop a video file here</p>
              <p className="text-sm text-neutral-500">or click to browse</p>
            </div>
          </div>
        )}
      </div>

      {!selectedFile && (
        <Button
          variant="outline"
          onClick={handleUseSampleVideo}
          disabled={isLoadingSample}
          className="w-full"
        >
          <FileVideo className="w-4 h-4 mr-2" />
          {isLoadingSample ? "Loading..." : "Use Sample Video"}
        </Button>
      )}
    </div>
  );
}
