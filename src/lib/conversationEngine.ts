import { Model, Message, FileAttachment } from "@/types/chat";

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
  private onTriggerResponse?: (modelId: string) => void;
  private _roundComplete = false;

  setResponseHandler(handler: (modelId: string) => void) {
    this.onTriggerResponse = handler;
  }

  /**
   * Mark the current round as complete. Clears all pending/queued responses.
   * No further AI messages will be sent until startNewRound() is called.
   */
  markRoundComplete(): void {
    this._roundComplete = true;
    this.responseQueue = [];
    this.pendingModels.clear();
  }

  /**
   * Start a new round (called when user sends a message).
   * Resets all per-round state so AI models can respond again.
   */
  startNewRound(): void {
    this._roundComplete = false;
    this.respondedThisRound.clear();
    this.discussionCount.clear();
    this._summarizerModelId = null;
    this._moderatorSettleCount = 0;
    // Cancel any pending/queued responses from the previous round
    this.responseQueue = [];
    this.pendingModels.clear();
  }

  get roundComplete(): boolean {
    return this._roundComplete;
  }

  /** True if any models are still queued, pending, or currently responding. */
  get hasPendingWork(): boolean {
    return (
      this.pendingModels.size > 0 ||
      this.responseQueue.length > 0 ||
      this.currentlyResponding > 0
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
    // Don't queue if round is complete, already queued, or currently responding
    if (this._roundComplete || this.pendingModels.has(modelId)) {
      return;
    }
    this.pendingModels.add(modelId);

    setTimeout(() => {
      // Bail if round ended or model was cleared while waiting
      if (this._roundComplete || !this.pendingModels.has(modelId)) {
        this.pendingModels.delete(modelId);
        return;
      }

      if (this.currentlyResponding < this.maxConcurrent) {
        this.triggerResponse(modelId);
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
      this.triggerResponse(next.modelId);
    }
  }

  private triggerResponse(modelId: string): void {
    this.currentlyResponding++;
    this.onTriggerResponse?.(modelId);
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

export function buildContextWindow(
  messages: Message[],
  windowSize: number,
  model: Model
): { role: "user" | "assistant"; content: string }[] {
  const recentMessages = messages.slice(-windowSize);
  const windowStartIdx = messages.length - windowSize;

  // Find the last user message in the full history
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }

  const result: { role: "user" | "assistant"; content: string }[] = [];

  // Pin the user's question if it was pushed out of the context window
  if (lastUserIdx >= 0 && lastUserIdx < windowStartIdx) {
    const pinnedMsg = messages[lastUserIdx];
    result.push({
      role: "user",
      content: formatUserContent(pinnedMsg.content, pinnedMsg.attachment),
    });
  }

  for (const msg of recentMessages) {
    // Skip system event notifications — not relevant for AI context
    if (msg.role === "system") continue;

    if (msg.role === "user") {
      // User messages stay as user role, with attachment if present
      result.push({
        role: "user",
        content: formatUserContent(msg.content, msg.attachment),
      });
    } else if (msg.modelId === model.id) {
      // Own previous messages -> assistant role (no prefix)
      result.push({ role: "assistant", content: msg.content });
    } else {
      // Other AI models' messages -> user role with name prefix
      // This helps the model distinguish external input from its own output
      result.push({
        role: "user",
        content: `[${msg.modelName}]: ${msg.content}`,
      });
    }
  }

  return result;
}

export const conversationEngine = new ConversationEngine();
