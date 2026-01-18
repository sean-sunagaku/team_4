import dotenv from "dotenv";
dotenv.config({ quiet: true });

export interface GoogleConfig {
  googleApiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export const config: GoogleConfig = {
  googleApiKey: process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
  model: process.env.AI_MODEL || "gemini-2.0-flash",
  temperature: 0.7,
  maxTokens: 1024,  // Reduced from 4096 for faster initial response
};
