import Anthropic from "@anthropic-ai/sdk";

// Single config spot for the AI layer (models + provider are swappable here
// without touching callers). Server-only: requires ANTHROPIC_API_KEY.
//
// Two tiers:
// - AI_MODEL: quality-sensitive calls a coach acts on (grounded answers with
//   citations, later workout/plan analysis). Sonnet 5 is near-Opus on this
//   kind of comprehension work at ~40% of the cost; set to "claude-opus-4-8"
//   for maximum quality.
// - AI_MODEL_LIGHT: mechanical calls (metadata extraction from one PDF,
//   catalog triage). Haiku-class is sufficient; note its 200K context — fine
//   for a single paper or a catalog, not for multi-paper synthesis.
export const AI_MODEL = "claude-sonnet-5";
export const AI_MODEL_LIGHT = "claude-haiku-4-5";
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
