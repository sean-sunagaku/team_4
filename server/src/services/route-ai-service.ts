/**
 * Route AI Service - Qwen API連携による経由地選択
 */

import OpenAI from "openai";
import {
  RouteError,
  AIRouteSelectionSchema,
  PRACTICE_TYPE_LABELS,
  PRACTICE_TYPE_DESCRIPTIONS,
  type AIRouteSelectionResponse,
  type POICandidate,
  type PracticeType,
} from "../types/route.types.js";

const MAX_RETRIES = 2;

interface AISelectionParams {
  practiceType: PracticeType;
  originAddress: string;
  candidates: POICandidate[];
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.QWEN_API_KEY;
  const baseURL = process.env.QWEN_BASE_URL;

  if (!apiKey) {
    throw RouteError.internal("QWEN_API_KEY is not set");
  }
  if (!baseURL) {
    throw RouteError.internal("QWEN_BASE_URL is not set");
  }

  return new OpenAI({
    apiKey,
    baseURL,
  });
}

/**
 * AIによるルート選択
 */
export async function selectRouteWithAI(
  params: AISelectionParams
): Promise<AIRouteSelectionResponse> {
  const model = process.env.QWEN_MODEL || "qwen-plus";
  const openai = getOpenAIClient();
  const prompt = buildPrompt(params);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const textContent = response.choices[0]?.message?.content;
      if (!textContent) {
        throw new Error("No text response from AI");
      }

      const parsed = parseAndValidateResponse(textContent, params.candidates);
      return parsed;
    } catch (error) {
      console.warn(`AI selection attempt ${attempt} failed:`, error);
      if (attempt === MAX_RETRIES) {
        throw RouteError.aiService(
          "AI route selection failed after retries",
          { error: error instanceof Error ? error.message : String(error) }
        );
      }
    }
  }

  throw RouteError.aiService("AI route selection failed");
}

function buildPrompt(params: AISelectionParams): string {
  const practiceLabel = PRACTICE_TYPE_LABELS[params.practiceType];
  const practiceDesc = PRACTICE_TYPE_DESCRIPTIONS[params.practiceType];

  const candidatesList = params.candidates
    .map(
      (c, i) =>
        `${i + 1}. ID: "${c.id}"\n   名前: ${c.name}\n   住所: ${c.address}\n   種類: ${c.types.join(", ")}`
    )
    .join("\n");

  return `あなたは運転練習ルートの専門家です。以下の条件で最適な練習ルートを提案してください。

## 練習内容
- タイプ: ${practiceLabel}
- 説明: ${practiceDesc}

## 出発地点
${params.originAddress}

## 候補地点リスト（この中からのみ選択してください）
${candidatesList}

## 重要なルール
1. **必ず上記の候補リストからのみ選択してください**。新しい地点を作成しないでください。
2. **経由地(waypoints)は0〜2箇所**に限定してください。
3. **目的地(destination)は必ず1箇所**選択してください。
4. **路上駐車は推奨しないでください**。必ず駐車場のある施設を選んでください。
5. 練習に適した場所を優先してください（広い駐車場、交通量が少ない時間帯など）。

## 出力形式
以下のJSON形式で回答してください。JSONのみを出力し、他の説明は不要です。

{
  "waypointIds": ["候補のID"],
  "destinationId": "候補のID",
  "steps": ["1. 出発地点から...", "2. 経由地で...", "3. 目的地で..."],
  "notes": ["安全に関する注意事項"]
}`;
}

function parseAndValidateResponse(
  responseText: string,
  candidates: POICandidate[]
): AIRouteSelectionResponse {
  // JSONを抽出（マークダウンコードブロック対応）
  let jsonStr = responseText.trim();
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1]?.trim() ?? jsonStr;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Invalid JSON response: ${responseText.slice(0, 200)}`);
  }

  // Zodでスキーマ検証
  const validated = AIRouteSelectionSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`Schema validation failed: ${validated.error.message}`);
  }

  // 選択されたIDが候補リストに存在するか確認
  const candidateIds = new Set(candidates.map((c) => c.id));

  for (const wpId of validated.data.waypointIds) {
    if (!candidateIds.has(wpId)) {
      throw new Error(`Invalid waypoint ID: ${wpId}`);
    }
  }

  if (!candidateIds.has(validated.data.destinationId)) {
    throw new Error(`Invalid destination ID: ${validated.data.destinationId}`);
  }

  return validated.data;
}
