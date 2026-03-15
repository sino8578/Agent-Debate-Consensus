/**
 * Token estimation and context budget management.
 *
 * Uses a simple heuristic (~3 chars per token) which is conservative enough
 * to handle mixed Latin/Cyrillic text. Accurate within ~15-20% for most models.
 * Good enough for budgeting without pulling in a 2MB tokenizer library.
 */

// Average chars-per-token ratio.
// English prose ≈ 4, code ≈ 3.5, Cyrillic ≈ 2-2.5, CJK ≈ 1.5.
// We use a conservative 3.0 to avoid underestimating for Cyrillic/CJK text
// (this app supports Ukrainian debates).
const CHARS_PER_TOKEN = 3.0;

/** Estimate token count for a string. Conservative (overestimates for Latin). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Known context window sizes for popular models (in tokens).
 * Used as fallback when model.context_length is not available.
 */
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // OpenAI
  "openai/gpt-4o": 128_000,
  "openai/gpt-4o-mini": 128_000,
  "openai/gpt-4.1": 1_047_576,
  "openai/gpt-4.1-mini": 1_047_576,
  "openai/gpt-4.1-nano": 1_047_576,
  "openai/gpt-5.4-pro": 256_000,
  // Google
  "google/gemini-2.5-pro-preview": 1_048_576,
  "google/gemini-2.5-flash-preview": 1_048_576,
  "google/gemini-2.0-flash-001": 1_048_576,
  "google/gemini-3-pro": 2_000_000,
  // Anthropic
  "anthropic/claude-sonnet-4": 200_000,
  "anthropic/claude-haiku-4": 200_000,
  "anthropic/claude-4-haiku": 200_000,
  "anthropic/claude-4.5-haiku": 200_000,
  // xAI
  "x-ai/grok-4.1-fast": 131_072,
  "x-ai/grok-3-mini-beta": 131_072,
  // DeepSeek
  "deepseek/deepseek-chat-v3-0324:free": 163_840,
  "deepseek/deepseek-r1:free": 163_840,
  // Kimi
  "moonshotai/kimi-k2": 131_072,
};

const DEFAULT_CONTEXT_LIMIT = 64_000; // Conservative fallback

/**
 * Get model's context window limit in tokens.
 * Prefers the dynamic context_length from OpenRouter API (stored on Model object),
 * falls back to hardcoded map, then to conservative default.
 */
export function getModelContextLimit(modelId: string, contextLength?: number): number {
  return contextLength ?? MODEL_CONTEXT_LIMITS[modelId] ?? DEFAULT_CONTEXT_LIMIT;
}

/**
 * Maximum tokens to allocate for the completion (response).
 * We cap at 4096 for debate responses — most debate messages are 200-800 tokens.
 * This prevents the "can't afford" error from OpenRouter.
 */
export const MAX_COMPLETION_TOKENS = 4096;

/**
 * Calculate available token budget for the prompt (system + context messages).
 *
 * Formula: min(contextLimit, hardCap) - completionReserve - safetyMargin
 *
 * @param modelId - The model being called
 * @param hardCap - Optional hard cap on total tokens (e.g., from account budget)
 * @param contextLength - Optional dynamic context_length from the Model object
 * @returns Available tokens for system prompt + conversation messages
 */
export function getPromptBudget(modelId: string, hardCap?: number, contextLength?: number): number {
  const contextLimit = getModelContextLimit(modelId, contextLength);
  const effectiveLimit = hardCap ? Math.min(contextLimit, hardCap) : contextLimit;

  // Reserve tokens for completion + safety margin (5%)
  const safetyMargin = Math.ceil(effectiveLimit * 0.05);
  return effectiveLimit - MAX_COMPLETION_TOKENS - safetyMargin;
}

/**
 * Truncate a message to fit within a token budget.
 * Preserves the beginning (most important context) and adds a truncation marker.
 */
export function truncateToTokenBudget(text: string, maxTokens: number): string {
  const estimated = estimateTokens(text);
  if (estimated <= maxTokens) return text;

  const maxChars = Math.floor(maxTokens * CHARS_PER_TOKEN);
  // Find a clean break point (sentence or paragraph boundary)
  const truncated = text.slice(0, maxChars);
  const lastPeriod = truncated.lastIndexOf(". ");
  const lastNewline = truncated.lastIndexOf("\n");
  const breakPoint = Math.max(lastPeriod, lastNewline);

  if (breakPoint > maxChars * 0.5) {
    return truncated.slice(0, breakPoint + 1) + "\n[...truncated]";
  }
  return truncated + "... [truncated]";
}

/**
 * Compress a message for context window inclusion.
 * Used for older messages that need to be summarized to save tokens.
 *
 * Strategy:
 * - Very short messages (< 80 tokens): keep as-is
 * - Medium messages (80-250 tokens): light truncation to ~200 tokens
 * - Long messages (250+ tokens): aggressive truncation to ~150 tokens
 */
export function compressMessage(content: string, isRecent: boolean): string {
  const tokens = estimateTokens(content);

  // Recent messages: keep in full up to a generous limit
  if (isRecent) {
    return tokens > 1500 ? truncateToTokenBudget(content, 1500) : content;
  }

  // Older messages: compress more aggressively
  if (tokens <= 80) return content;
  if (tokens <= 250) return truncateToTokenBudget(content, 200);
  return truncateToTokenBudget(content, 150);
}
