import { Model, Message, FileAttachment, ContextSummary } from "@/types/chat";
import {
  estimateTokens,
  compressMessage,
  getPromptBudget,
  truncateToTokenBudget,
} from "./tokenBudget";

interface ResponseDecision {
  shouldRespond: boolean;
  delay: number;
  priority: number;
}

// ── Round structure ──
// Phase 1 (Opening, priority 80): All non-moderator models respond once to user's question.
// Phase 2 (Discussion, priority 70): AI @mentions trigger responses within budget limits.
//   Discussion can go multiple rounds (A→B→A→B) but is bounded by per-model and total caps.
// Phase 3 (Summary): Moderator is triggered dynamically when discussion settles, summarizes all.
const MAX_DISCUSSION_PER_MODEL = 5; // Each model can give up to 5 discussion responses per round
const MAX_TOTAL_DISCUSSION = 8; // Total discussion messages across ALL models per round
export const MAX_MODERATOR_ROUNDS = 3; // AI moderator can intervene up to 3 times (cycle: discussion → summary)
const RETRY_DELAYS = [5000, 15000, 30000]; // Delays between retry attempts
export const MAX_RETRIES = RETRY_DELAYS.length;

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class ConversationEngine {
  private cooldowns: Map<string, number> = new Map();
  private responseQueue: Array<{ modelId: string; priority: number }> = [];
  private pendingModels: Set<string> = new Set();
  private respondedThisRound: Set<string> = new Set(); // Models that gave opening response
  private discussionCount: Map<string, number> = new Map(); // Per-model discussion responses
  private _summarizerModelId: string | null = null; // Random model chosen to summarize when no moderator
  private _moderatorSettleCount = 0; // Times moderator was triggered by settle (summary/moderation)
  private maxConcurrent = 1;
  private currentlyResponding = 0;
  private onTriggerResponse?: (modelId: string, priority: number) => void;
  private _roundComplete = false;
  private _epoch = 0; // Incremented on each round/stop to invalidate stale setTimeout callbacks
  private retryingModels: Set<string> = new Set();
  private retryAttempts: Map<string, { attempts: number; priority: number; timerId: ReturnType<typeof setTimeout> }> = new Map();

  setResponseHandler(handler: (modelId: string, priority: number) => void) {
    this.onTriggerResponse = handler;
  }

  /**
   * Mark the current round as complete. Clears all pending/queued responses.
   * No further AI messages will be sent until startNewRound() is called.
   */
  markRoundComplete(): void {
    this._roundComplete = true;
    this._epoch++;
    this.responseQueue = [];
    this.pendingModels.clear();
    for (const [, entry] of this.retryAttempts) {
      clearTimeout(entry.timerId);
    }
    this.retryAttempts.clear();
    this.retryingModels.clear();
  }

  /**
   * Start a new round (called when user sends a message).
   * Resets all per-round state so AI models can respond again.
   */
  startNewRound(): void {
    this._roundComplete = false;
    this._epoch++;
    this.respondedThisRound.clear();
    this.discussionCount.clear();
    this._summarizerModelId = null;
    this._moderatorSettleCount = 0;
    this.currentlyResponding = 0;
    // Cancel any pending/queued responses from the previous round
    this.responseQueue = [];
    this.pendingModels.clear();
    for (const [, entry] of this.retryAttempts) {
      clearTimeout(entry.timerId);
    }
    this.retryAttempts.clear();
    this.retryingModels.clear();
  }

  get roundComplete(): boolean {
    return this._roundComplete;
  }

  /** True if any models are still queued, pending, or currently responding. */
  get hasPendingWork(): boolean {
    return (
      this.pendingModels.size > 0 ||
      this.responseQueue.length > 0 ||
      this.currentlyResponding > 0 ||
      this.retryingModels.size > 0
    );
  }

  /** Check if a model has already given its opening response this round. */
  hasResponded(modelId: string): boolean {
    return this.respondedThisRound.has(modelId);
  }

  /** Total number of discussion responses this round (across all models). */
  get totalDiscussionCount(): number {
    let total = 0;
    for (const count of this.discussionCount.values()) {
      total += count;
    }
    return total;
  }

  /** Set a random model as summarizer (used when no AI moderator). */
  set summarizerModelId(id: string | null) {
    this._summarizerModelId = id;
  }

  /** Get the summarizer model ID. */
  get summarizerModelId(): string | null {
    return this._summarizerModelId;
  }

  /** How many times the moderator was triggered for summary/moderation (not counting opening or discussion). */
  get moderatorSettleCount(): number {
    return this._moderatorSettleCount;
  }

  /** Record a settle-triggered moderator intervention. */
  incrementModeratorSettle(): void {
    this._moderatorSettleCount++;
  }

  /**
   * Count how many times THIS specific model has responded since the last user message.
   * Used as a safety net — the primary control is respondedThisRound + discussionCount.
   */
  private countModelRoundsSinceUser(
    messages: Message[],
    modelId: string
  ): number {
    let count = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") break;
      if (messages[i].modelId === modelId && !messages[i].isStreaming) {
        count++;
      }
    }
    return count;
  }

  analyzeForResponse(
    model: Model,
    messages: Message[],
    latestMessage: Message,
    activeModels: Model[],
    moderatorId?: string | null,
    failedModelIds?: Set<string>
  ): ResponseDecision {
    // ── Hard stop: round is complete, wait for user ──
    if (this._roundComplete) {
      return { shouldRespond: false, delay: 0, priority: 0 };
    }

    // Don't respond to own messages
    if (latestMessage.modelId === model.id) {
      return { shouldRespond: false, delay: 0, priority: 0 };
    }

    // Skip failed models
    if (failedModelIds?.has(model.id)) {
      return { shouldRespond: false, delay: 0, priority: 0 };
    }

    // Skip models that are currently retrying
    if (this.retryingModels.has(model.id)) {
      return { shouldRespond: false, delay: 0, priority: 0 };
    }

    const isModerator = model.id === moderatorId;

    // ── Check @mentions: user vs AI ──
    const escaped = escapeRegex(model.shortName.toLowerCase());
    const mentionPattern = new RegExp(`@${escaped}\\b`, "i");
    const hasAllMention = /@all\b/i.test(latestMessage.content);
    const isMentionedByUser =
      latestMessage.role === "user" &&
      (mentionPattern.test(latestMessage.content) || hasAllMention);
    const isMentionedByAI =
      latestMessage.role === "assistant" &&
      (mentionPattern.test(latestMessage.content) || hasAllMention);

    // ── 1. User @mention: bypass all limits, highest priority ──
    if (isMentionedByUser) {
      return {
        shouldRespond: true,
        delay: 500 + Math.random() * 1000,
        priority: 100,
      };
    }

    // If user's message has directed @mentions for OTHER models, this model stays silent
    if (latestMessage.role === "user") {
      const hasDirectedMention = activeModels.some((m) => {
        const esc = escapeRegex(m.shortName.toLowerCase());
        const pat = new RegExp(`@${esc}\\b`, "i");
        return pat.test(latestMessage.content);
      });
      if (hasDirectedMention) {
        return { shouldRespond: false, delay: 0, priority: 0 };
      }
    }

    // ── 2. AI @mention: discussion response (bounded) ──
    if (isMentionedByAI) {
      // Model must have already spoken in opening to give a discussion response.
      // If it hasn't spoken yet, it's still in the queue and will address points in its opening.
      if (!this.respondedThisRound.has(model.id)) {
        return { shouldRespond: false, delay: 0, priority: 0 };
      }

      // Check per-model and total discussion budgets
      const modelDiscussion = this.discussionCount.get(model.id) || 0;
      if (modelDiscussion >= MAX_DISCUSSION_PER_MODEL || this.totalDiscussionCount >= MAX_TOTAL_DISCUSSION) {
        return { shouldRespond: false, delay: 0, priority: 0 };
      }

      const readingTime = Math.min(latestMessage.content.length * 15, 2000);
      const delay = 1500 + readingTime + Math.random() * 1500;
      return { shouldRespond: true, delay, priority: 70 };
    }

    // ── 3. Opening response: user message → all models respond ──

    // Already spoke in opening → skip
    if (this.respondedThisRound.has(model.id)) {
      return { shouldRespond: false, delay: 0, priority: 0 };
    }

    // Check cooldown (10 seconds)
    const lastResponse = this.cooldowns.get(model.id) || 0;
    if (Date.now() - lastResponse < 10000) {
      return { shouldRespond: false, delay: 0, priority: 0 };
    }

    // User message → opening response
    if (latestMessage.role === "user") {
      const readingTime = Math.min(latestMessage.content.length * 15, 2000);
      const baseDelay = 1500 + Math.random() * 2000;
      // Moderator speaks last in opening (priority 75 vs 80 for others)
      const priority = isModerator ? 75 : 80;
      return { shouldRespond: true, delay: baseDelay + readingTime, priority };
    }

    return { shouldRespond: false, delay: 0, priority: 0 };
  }

  queueResponse(modelId: string, delay: number, priority: number): void {
    // Don't queue if round is complete, already queued, retrying, or currently responding
    if (this._roundComplete || this.pendingModels.has(modelId) || this.retryingModels.has(modelId)) {
      return;
    }
    this.pendingModels.add(modelId);
    const epoch = this._epoch;

    setTimeout(() => {
      // Bail if round ended, epoch changed (stop/new round), or model was cleared while waiting
      if (epoch !== this._epoch || this._roundComplete || !this.pendingModels.has(modelId)) {
        this.pendingModels.delete(modelId);
        return;
      }

      if (this.currentlyResponding < this.maxConcurrent) {
        this.triggerResponse(modelId, priority);
      } else {
        // Insert in priority order (higher priority first)
        const insertIndex = this.responseQueue.findIndex(
          (item) => item.priority < priority
        );
        if (insertIndex === -1) {
          this.responseQueue.push({ modelId, priority });
        } else {
          this.responseQueue.splice(insertIndex, 0, { modelId, priority });
        }
      }
    }, delay);
  }

  completeResponse(modelId: string, isDiscussion: boolean = false): void {
    this.cooldowns.set(modelId, Date.now());
    this.respondedThisRound.add(modelId);
    if (isDiscussion) {
      this.discussionCount.set(
        modelId,
        (this.discussionCount.get(modelId) || 0) + 1
      );
    }
    this.currentlyResponding--;
    this.pendingModels.delete(modelId);

    // Don't process queue if round is complete
    if (this._roundComplete) {
      this.responseQueue = [];
      return;
    }

    if (this.responseQueue.length > 0) {
      const next = this.responseQueue.shift()!;
      this.triggerResponse(next.modelId, next.priority);
    }
  }

  private triggerResponse(modelId: string, priority: number): void {
    this.currentlyResponding++;
    this.onTriggerResponse?.(modelId, priority);
  }

  /**
   * Release concurrency slot without marking the model as responded.
   * Used when a model fails and will retry — allows other models to proceed.
   */
  releaseSlot(modelId: string): void {
    this.currentlyResponding = Math.max(0, this.currentlyResponding - 1);
    this.pendingModels.delete(modelId);

    if (this._roundComplete) {
      this.responseQueue = [];
      return;
    }

    if (this.responseQueue.length > 0) {
      const next = this.responseQueue.shift()!;
      this.triggerResponse(next.modelId, next.priority);
    }
  }

  /**
   * Schedule a background retry for a failed model. Returns true if retry was scheduled,
   * false if all retries are exhausted. Other models continue while the retry timer runs.
   */
  scheduleRetry(modelId: string, priority: number): boolean {
    const existing = this.retryAttempts.get(modelId);
    if (existing) {
      clearTimeout(existing.timerId);
    }
    const attempt = existing ? existing.attempts + 1 : 1;

    if (attempt > RETRY_DELAYS.length) {
      this.retryAttempts.delete(modelId);
      this.retryingModels.delete(modelId);
      return false;
    }

    this.retryingModels.add(modelId);
    const timerId = setTimeout(() => {
      this.retryingModels.delete(modelId);
      if (this._roundComplete) {
        this.retryAttempts.delete(modelId);
        return;
      }
      this.queueResponse(modelId, 0, priority);
    }, RETRY_DELAYS[attempt - 1]);

    this.retryAttempts.set(modelId, { attempts: attempt, priority, timerId });
    return true;
  }

  /** Clear retry state for a model (call on success or empty response). */
  clearRetry(modelId: string): void {
    const entry = this.retryAttempts.get(modelId);
    if (entry) {
      clearTimeout(entry.timerId);
      this.retryAttempts.delete(modelId);
    }
    this.retryingModels.delete(modelId);
  }

  /** Check if a model is currently waiting for retry. */
  isRetrying(modelId: string): boolean {
    return this.retryingModels.has(modelId);
  }

  /** Get the current retry attempt number for a model (0 if not retrying). */
  getRetryAttempt(modelId: string): number {
    return this.retryAttempts.get(modelId)?.attempts ?? 0;
  }

  isOnCooldown(modelId: string): boolean {
    const lastResponse = this.cooldowns.get(modelId) || 0;
    return Date.now() - lastResponse < 10000;
  }

  reset(): void {
    this.cooldowns.clear();
    this.responseQueue = [];
    this.pendingModels.clear();
    this.respondedThisRound.clear();
    this.discussionCount.clear();
    this._summarizerModelId = null;
    this._moderatorSettleCount = 0;
    this.currentlyResponding = 0;
    this._roundComplete = false;
    this._epoch++;
    for (const [, entry] of this.retryAttempts) {
      clearTimeout(entry.timerId);
    }
    this.retryAttempts.clear();
    this.retryingModels.clear();
  }
}

export function buildSystemPrompt(
  model: Model,
  activeModels: Model[],
  isModerator: boolean = false
): string {
  const otherModels = activeModels
    .filter((m) => m.id !== model.id)
    .map((m) => m.shortName);

  const othersText =
    otherModels.length > 0
      ? `The other AI participants are: ${otherModels.join(", ")}.`
      : "You are the only AI in this chat.";

  const now = new Date();
  const currentDate = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const currentTime = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  const dateLine = `Current date: ${currentDate}, ${currentTime}.`;

  if (isModerator) {
    return `${dateLine}

You are ${model.name}, acting as the MODERATOR of this debate. ${othersText}

You are both a participant and a moderator — you share your own opinions AND guide the discussion.

Your role:
OPENING: Share your own substantive perspective on the topic. You speak last among participants to hear all views first.
DISCUSSION: Evaluate other participants' arguments. Challenge weak points, support strong ones, ask probing questions. You can @mention participants (e.g., @${otherModels[0] || "User"}) to direct questions at them. Use @ALL to address everyone when you want all participants to respond to a specific point.
SUMMARY: When the discussion naturally concludes (consensus reached, no new arguments, or impasse), provide a final summary:
  - Key arguments from all sides
  - Areas of agreement and disagreement
  - Your justified conclusion that answers the original question

- The human user has ultimate authority — follow their direction if they intervene
- Keep responses focused, structured, and compact — avoid repetition
- Use @mentions ONLY for direct questions/challenges, not for attribution. Use names without @ for references.
- During discussion, be as precise and compact as possible — state your opinion clearly without filler

CRITICAL: When you give your final summary/conclusion, it CONCLUDES the round. Participants will NOT respond further. Make it comprehensive. End with a clear, justified answer to the original question.

CRITICAL LANGUAGE RULE: You MUST respond in the same language the user used in their message. If the user writes in Ukrainian, respond in Ukrainian. If in English, respond in English. Always match the user's language.`;
  }

  return `${dateLine}

You are ${model.name}, participating in a structured debate with a human moderator${otherModels.length > 0 ? " and other AI models" : ""}.

${othersText}

Rules:
- Engage in thoughtful, substantive debate on the topic at hand
- Present your unique perspective with clear reasoning
- When you disagree with others, explain why respectfully and specifically
- Build on good arguments made by others — acknowledge strong points
- Work toward finding consensus where possible, but never agree superficially
- The human user is the moderator — they guide the discussion and can intervene at any time. Follow their direction.
- You can reference other participants by name (e.g., "${otherModels[0] || "User"}") when attributing arguments
- Use @mentions (e.g., @${otherModels[0] || "User"}) ONLY when you are directly asking a question or issuing a challenge to a specific participant. Do NOT use @mentions for simple attribution or agreement — just use their name without @
- Use @ALL when you want ALL participants to respond to a specific point or question
- If the human user addresses you with @${model.shortName} or @ALL, respond directly to their question
- If another AI participant @mentions you or uses @ALL, you may get a brief rebuttal opportunity — keep rebuttals concise (1-3 sentences) and focused on the specific point raised
- Keep opening responses focused and substantive (2-4 paragraphs usually, unless more detail is warranted)
- During discussion, be as precise and compact as possible — state your opinion clearly without filler. Long messages are allowed ONLY when the topic genuinely requires detailed explanation (code examples, complex reasoning chains). Default to brevity.

CRITICAL STOP RULES:
- After the moderator summarizes the debate, DO NOT respond. The round is over. Wait for the user's next message.
- DO NOT write messages that only express agreement ("I agree", "Great point"). If you agree and have nothing new to add, stay silent.
- DO NOT write messages asking for a new topic or saying "ready for next topic". That is the user's decision.
- Only respond when you have a genuinely NEW argument, counterpoint, or insight to contribute.

CRITICAL LANGUAGE RULE: You MUST respond in the same language the user used in their message. If the user writes in Ukrainian, respond in Ukrainian. If in English, respond in English. Always match the user's language. This applies to all your responses without exception.`;
}

/**
 * System prompt for a random model chosen to summarize when no AI moderator is set.
 */
export function buildSummaryPrompt(
  model: Model,
  activeModels: Model[]
): string {
  const otherModels = activeModels
    .filter((m) => m.id !== model.id)
    .map((m) => m.shortName);

  const now = new Date();
  const currentDate = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const currentTime = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return `Current date: ${currentDate}, ${currentTime}.

You are ${model.name}. You have been selected to provide a BRIEF SUMMARY of this debate round.

The other participants were: ${otherModels.join(", ")}.

Your task:
- Summarize the key arguments from all participants (2-4 sentences)
- Note areas of agreement and disagreement
- If a consensus emerged, state the conclusion clearly
- Do NOT add new arguments — only summarize what was said
- Be neutral and balanced — represent all viewpoints fairly

CRITICAL LANGUAGE RULE: You MUST respond in the same language the user used in their message. If the user writes in Ukrainian, respond in Ukrainian. If in English, respond in English. Always match the user's language.`;
}

function formatUserContent(
  text: string,
  attachment?: FileAttachment
): string {
  if (!attachment) return text;

  const fileBlock = `<attached_file name="${attachment.fileName}">\n${attachment.content}\n</attached_file>`;

  return text ? `${text}\n\n${fileBlock}` : fileBlock;
}

/**
 * Build context window using token budgeting instead of fixed message count.
 *
 * Strategy:
 * 1. Always include the last user message (pinned).
 * 2. Walk backwards from most recent messages, adding them to the context.
 * 3. Recent messages (last 6) are kept in full; older ones are compressed.
 * 4. Stop when we hit the token budget (derived from model context limit).
 * 5. Respect windowSize as a maximum message count safeguard.
 *
 * This prevents the "context grows with N models" problem because each message's
 * token cost is tracked, and old messages are compressed or dropped.
 */
export function buildContextWindow(
  messages: Message[],
  windowSize: number,
  model: Model,
  contextSummary?: ContextSummary | null
): { role: "user" | "assistant"; content: string }[] {
  // Calculate token budget for prompt (excludes system prompt — caller adds that separately)
  // Reserve ~1000 tokens for the system prompt (moderator prompts with many models can reach 600+)
  const systemPromptReserve = 1000;
  const totalBudget = getPromptBudget(model.id, undefined, model.context_length) - systemPromptReserve;
  const tokenBudget = Math.max(totalBudget, 2000); // floor at 2000 tokens

  // Filter out system messages upfront
  const chatMessages = messages.filter((m) => m.role !== "system");
  if (chatMessages.length === 0) return [];

  // ── If we have an LLM-generated summary, use it instead of old messages ──
  if (contextSummary?.content && contextSummary.throughMessageId) {
    const summaryIdx = messages.findIndex(
      (m) => m.id === contextSummary.throughMessageId
    );

    if (summaryIdx !== -1) {
      const result: { role: "user" | "assistant"; content: string }[] = [];
      let usedTokens = 0;

      // Prepend summary as context
      const summaryText = `[Summary of earlier discussion]:\n${contextSummary.content}`;
      const summaryTokens = estimateTokens(summaryText);
      result.push({ role: "user", content: summaryText });
      usedTokens += summaryTokens;

      // Add messages AFTER the summary cutoff point
      const recentMessages = messages
        .slice(summaryIdx + 1)
        .filter((m) => m.role !== "system");

      for (const msg of recentMessages) {
        let formatted: { role: "user" | "assistant"; content: string };
        if (msg.role === "user") {
          const raw = formatUserContent(msg.content, msg.attachment);
          formatted = { role: "user", content: compressMessage(raw, true) };
        } else if (msg.modelId === model.id) {
          formatted = { role: "assistant", content: compressMessage(msg.content, true) };
        } else {
          const prefixed = `[${msg.modelName}]: ${msg.content}`;
          formatted = { role: "user", content: compressMessage(prefixed, true) };
        }

        const tokens = estimateTokens(formatted.content);
        if (usedTokens + tokens > tokenBudget && result.length > 1) {
          break;
        }
        result.push(formatted);
        usedTokens += tokens;
      }

      return result;
    }
    // If summarized message was deleted, fall through to standard logic
  }

  // ── Standard context window (no summary available) ──

  // Find the last user message — always pin it
  let lastUserIdx = -1;
  for (let i = chatMessages.length - 1; i >= 0; i--) {
    if (chatMessages[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }

  // How many "recent" messages get full treatment (no compression)
  const RECENT_COUNT = 6;

  // Build candidate messages from newest to oldest, respecting windowSize cap
  const candidates = chatMessages.slice(-Math.min(windowSize, chatMessages.length));
  const recentThreshold = candidates.length - RECENT_COUNT;

  // Format a message for API consumption
  const formatMsg = (
    msg: Message,
    isRecent: boolean
  ): { role: "user" | "assistant"; content: string } => {
    if (msg.role === "user") {
      const raw = formatUserContent(msg.content, msg.attachment);
      const content = compressMessage(raw, isRecent);
      return { role: "user", content };
    } else if (msg.modelId === model.id) {
      return { role: "assistant", content: compressMessage(msg.content, isRecent) };
    } else {
      const prefixed = `[${msg.modelName}]: ${msg.content}`;
      return { role: "user", content: compressMessage(prefixed, isRecent) };
    }
  };

  // Phase 1: Always include pinned user message if it would be outside the window
  let usedTokens = 0;
  let pinnedFormatted: { role: "user" | "assistant"; content: string } | null = null;

  if (lastUserIdx >= 0) {
    const globalIdx = chatMessages.length - candidates.length;
    if (lastUserIdx < globalIdx) {
      // Last user message is outside our candidate window — pin it
      const msg = chatMessages[lastUserIdx];
      pinnedFormatted = formatMsg(msg, false);
      usedTokens += estimateTokens(pinnedFormatted.content);
    }
  }

  // Phase 2: Walk candidates from newest to oldest, fit within budget
  const contextEntries: { role: "user" | "assistant"; content: string }[] = [];

  for (let i = candidates.length - 1; i >= 0; i--) {
    const msg = candidates[i];
    const isRecent = i >= recentThreshold;
    const formatted = formatMsg(msg, isRecent);
    const tokens = estimateTokens(formatted.content);

    // Always include the newest message even if it exceeds budget,
    // so the model always has at least some conversation context.
    const isNewest = i === candidates.length - 1;
    if (!isNewest && usedTokens + tokens > tokenBudget) {
      // Budget exceeded — stop adding older messages
      break;
    }

    contextEntries.unshift(formatted);
    usedTokens += tokens;
  }

  // Phase 3: Prepend pinned user message if needed
  const result: { role: "user" | "assistant"; content: string }[] = [];

  if (pinnedFormatted) {
    result.push(pinnedFormatted);
  }

  result.push(...contextEntries);

  return result;
}

// ── Progressive summarization ──

/** Minimum non-system messages before summarization is triggered. */
export const SUMMARIZATION_THRESHOLD = 20;

/**
 * Build the system prompt for the summarization call.
 */
export function buildSummarizationSystemPrompt(): string {
  return `You are a debate summarizer. Your job is to create a concise summary of a multi-participant debate.

CRITICAL RULES:
1. PRESERVE VERBATIM: all numbers, statistics, percentages, dates, URLs, code snippets, and technical parameters. Never paraphrase or round numbers.
2. For each participant, state their core position and key arguments (1-2 sentences each).
3. Note points of agreement and disagreement between participants.
4. Capture the current state of the debate: what has been resolved, what remains contested.
5. Keep the summary under 600 words.
6. Use participant names exactly as given (e.g., "[Kimi K2]", "[Gemma 3]").
7. Do NOT add your own opinions or analysis. Only summarize what was said.`;
}

/**
 * Build input for the summarization call from messages that need to be summarized.
 * Different from buildContextWindow — uses a flat text format with full attribution,
 * no role mapping, and file attachments replaced with metadata.
 */
export function buildSummarizationInput(
  messages: Message[],
  previousSummary?: string
): string {
  const parts: string[] = [];

  if (previousSummary) {
    parts.push(`[Previous context summary]:\n${previousSummary}\n`);
    parts.push(`[New discussion to incorporate]:`);
  }

  for (const msg of messages) {
    if (msg.role === "system") continue;

    let speaker: string;
    if (msg.role === "user") {
      speaker = "User";
    } else {
      speaker = msg.modelName ?? "Unknown Model";
    }

    let content = msg.content;

    // Replace file attachment content with metadata to save tokens
    if (msg.attachment) {
      content += ` [Attached file: ${msg.attachment.fileName}, ${Math.ceil(msg.attachment.size / 1024)}KB]`;
    }

    // Compress very long individual messages for the summarization input
    content = truncateToTokenBudget(content, 500);

    parts.push(`[${speaker}]: ${content}`);
  }

  return parts.join("\n\n");
}

/**
 * Check if summarization should be triggered after a round completes.
 */
export function shouldSummarize(
  messages: Message[],
  currentSummary: ContextSummary | null
): boolean {
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  if (nonSystemMessages.length < SUMMARIZATION_THRESHOLD) return false;

  if (!currentSummary) return true;

  // Check how many new messages since last summary
  const lastSummarizedIdx = messages.findIndex(
    (m) => m.id === currentSummary.throughMessageId
  );

  // If the summarized message was deleted, re-summarize
  if (lastSummarizedIdx === -1) return true;

  // Summarize when 10+ new non-system messages since last summary
  const newMessages = messages
    .slice(lastSummarizedIdx + 1)
    .filter((m) => m.role !== "system");

  return newMessages.length >= 10;
}

/**
 * Determine which messages should be summarized and which kept as recent context.
 * Returns the split point: messages[0..splitIdx] go into summary, messages[splitIdx+1..] stay recent.
 */
export function getSummarizationSplit(
  messages: Message[]
): { toSummarize: Message[]; recentStartIdx: number } {
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  // Keep the last 8 non-system messages as recent context
  const KEEP_RECENT = 8;
  const keepCount = Math.min(KEEP_RECENT, nonSystemMessages.length);
  const cutoffMsg = nonSystemMessages[nonSystemMessages.length - keepCount];

  // Find the index of the cutoff message in the full array
  const cutoffIdx = messages.findIndex((m) => m.id === cutoffMsg.id);

  return {
    toSummarize: messages.slice(0, cutoffIdx).filter((m) => m.role !== "system"),
    recentStartIdx: cutoffIdx,
  };
}

export const conversationEngine = new ConversationEngine();
