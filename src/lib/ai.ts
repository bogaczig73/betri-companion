import Anthropic from "@anthropic-ai/sdk";

// Single config spot for the AI layer (model + provider are swappable here
// without touching callers). Server-only: requires ANTHROPIC_API_KEY.
export const AI_MODEL = "claude-opus-4-8";
export const FILES_API_BETA = "files-api-2025-04-14";

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!isAiConfigured()) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — add it to .env.local and the Vercel project env",
    );
  }
  client ??= new Anthropic();
  return client;
}
