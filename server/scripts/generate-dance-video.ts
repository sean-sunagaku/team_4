/**
 * DashScope Wan Image-to-Video API - Dance Animation Generator
 *
 * このスクリプトは、diagonal-icon.png から Wan API を使って
 * ダンスアニメーション動画を生成します。
 *
 * 使用方法:
 *   1. diagonal-icon.svg を PNG に変換して client/public/diagonal-icon.png として保存
 *   2. source .env && bun run server/scripts/generate-dance-video.ts
 *   3. 生成された動画を client/public/dancing-character.mp4 に配置
 *
 * 参考:
 * - https://www.alibabacloud.com/help/en/model-studio/image-to-video-api-reference
 */

import * as fs from "fs";
import * as path from "path";

// DashScope API Configuration
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const DASHSCOPE_REGION = process.env.DASHSCOPE_REGION || "intl";
const BASE_URL =
  DASHSCOPE_REGION === "intl"
    ? "https://dashscope-intl.aliyuncs.com"
    : "https://dashscope.aliyuncs.com";

// Video Generation Parameters
const MODEL = "wan2.1-i2v-plus"; // Higher quality model
const PROMPT =
  "Cute cartoon car with eyes only, no mouth, driving on white background, wheels spinning, simple animation, keep original car design without mouth";
const RESOLUTION = "480P"; // 480P, 720P, or 1080P
const DURATION = 5; // 1-5 seconds

interface TaskSubmitResponse {
  request_id: string;
  output: {
    task_id: string;
    task_status: string;
  };
}

interface TaskStatusResponse {
  request_id: string;
  output: {
    task_id: string;
    task_status: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "UNKNOWN";
    task_metrics?: {
      TOTAL: number;
      SUCCEEDED: number;
      FAILED: number;
    };
    video_url?: string;
    code?: string;
    message?: string;
  };
}

/**
 * Convert image file to base64 data URL
 */
function imageToBase64DataUrl(imagePath: string): string {
  const absolutePath = path.resolve(imagePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Image file not found: ${absolutePath}`);
  }

  const imageBuffer = fs.readFileSync(absolutePath);
  const base64 = imageBuffer.toString("base64");

  // Determine MIME type from extension
  const ext = path.extname(imagePath).toLowerCase();
  let mimeType = "image/png";
  if (ext === ".jpg" || ext === ".jpeg") {
    mimeType = "image/jpeg";
  } else if (ext === ".webp") {
    mimeType = "image/webp";
  } else if (ext === ".bmp") {
    mimeType = "image/bmp";
  }

  return `data:${mimeType};base64,${base64}`;
}

/**
 * Submit video generation task
 */
async function submitVideoTask(imageInput: string): Promise<string> {
  console.log("Submitting video generation task...");
  console.log(`  Model: ${MODEL}`);
  console.log(`  Prompt: ${PROMPT}`);
  console.log(`  Resolution: ${RESOLUTION}`);
  console.log(`  Duration: ${DURATION}s`);

  const requestBody = {
    model: MODEL,
    input: {
      prompt: PROMPT,
      img_url: imageInput,
    },
    parameters: {
      resolution: RESOLUTION,
      duration: DURATION,
    },
  };

  const response = await fetch(
    `${BASE_URL}/api/v1/services/aigc/video-generation/video-synthesis`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify(requestBody),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to submit task: ${response.status} ${response.statusText}\n${errorText}`,
    );
  }

  const data = (await response.json()) as TaskSubmitResponse;
  console.log(`Task submitted successfully. Task ID: ${data.output.task_id}`);
  return data.output.task_id;
}

/**
 * Check task status
 */
async function getTaskStatus(taskId: string): Promise<TaskStatusResponse> {
  const response = await fetch(`${BASE_URL}/api/v1/tasks/${taskId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to get task status: ${response.status} ${response.statusText}\n${errorText}`,
    );
  }

  return (await response.json()) as TaskStatusResponse;
}

/**
 * Poll task until completion
 */
async function waitForTaskCompletion(
  taskId: string,
  pollIntervalMs = 10000,
  maxWaitMs = 600000,
): Promise<string> {
  console.log("Waiting for video generation to complete...");
  console.log("(This typically takes 1-5 minutes)");

  const startTime = Date.now();
  let lastStatus = "";

  while (Date.now() - startTime < maxWaitMs) {
    const statusResponse = await getTaskStatus(taskId);
    const status = statusResponse.output.task_status;

    if (status !== lastStatus) {
      console.log(`  Status: ${status}`);
      lastStatus = status;
    }

    if (status === "SUCCEEDED") {
      if (!statusResponse.output.video_url) {
        throw new Error("Task succeeded but no video URL returned");
      }
      return statusResponse.output.video_url;
    }

    if (status === "FAILED") {
      throw new Error(
        `Task failed: ${statusResponse.output.code} - ${statusResponse.output.message}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`Task timed out after ${maxWaitMs / 1000} seconds`);
}

/**
 * Download video from URL
 */
async function downloadVideo(
  videoUrl: string,
  outputPath: string,
): Promise<void> {
  console.log(`Downloading video to ${outputPath}...`);

  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  fs.writeFileSync(outputPath, buffer);

  console.log(`Video saved to ${outputPath} (${buffer.length} bytes)`);
}

/**
 * Main execution
 */
async function main() {
  // Validate API key
  if (!DASHSCOPE_API_KEY) {
    console.error("Error: DASHSCOPE_API_KEY environment variable is not set");
    process.exit(1);
  }

  // Paths
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const projectRoot = path.resolve(scriptDir, "..", "..");
  const inputImagePath = path.join(
    projectRoot,
    "client",
    "public",
    "diagonal-icon.png",
  );
  const outputVideoPath = path.join(
    projectRoot,
    "client",
    "public",
    "dancing-character.mp4",
  );

  // Check if input image exists
  if (!fs.existsSync(inputImagePath)) {
    console.error(`Error: Input image not found at ${inputImagePath}`);
    console.error("");
    console.error("Please convert the SVG to PNG first:");
    console.error(
      "  1. Open client/public/diagonal-icon.svg in a browser or image editor",
    );
    console.error("  2. Export as PNG (512x512 recommended)");
    console.error("  3. Save as client/public/diagonal-icon.png");
    process.exit(1);
  }

  try {
    // Convert image to base64
    const imageBase64 = imageToBase64DataUrl(inputImagePath);
    console.log(`Input image loaded: ${inputImagePath}`);

    // Submit task
    const taskId = await submitVideoTask(imageBase64);

    // Wait for completion
    const videoUrl = await waitForTaskCompletion(taskId);
    console.log(`Video generated successfully!`);
    console.log(`  Video URL: ${videoUrl}`);

    // Download video
    await downloadVideo(videoUrl, outputVideoPath);

    console.log("");
    console.log("Done! The dancing character video has been generated.");
    console.log(`Output: ${outputVideoPath}`);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
