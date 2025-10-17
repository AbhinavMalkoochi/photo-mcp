import { config as loadEnv } from "dotenv";

loadEnv();

const REQUIRED_ENV_VARS = ["PIXABAY_API_KEY"] as const;

for (const key of REQUIRED_ENV_VARS) {
  if (!process.env[key] || process.env[key]?.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const serverConfig = {
  pixabayApiKey: process.env.PIXABAY_API_KEY!.trim(),
  pixabayBaseUrl: "https://pixabay.com/api/",
  defaultLocale: "en",
  defaultPerPage: 6,
  maxPerPage: 20,
};
