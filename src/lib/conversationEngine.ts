import { Model, Message, FileAttachment, ContextSummary, ThinkingStyle } from "@/types/chat";
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
// Phase 1 (Opening, priority 80/75): All models respond once to user's question. Moderator at 75 speaks last.
// Phase 2 (Rebuttal, priority 65): Each non-moderator model challenges others' arguments once.
//   @mention-triggered discussion is suppressed during rebuttal to keep it structured.
// Phase 3 (Discussion, priority 70): AI @mentions trigger responses within budget limits.
//   Discussion can go multiple rounds (A→B→A→B) but is bounded by per-model and total caps.
// Phase 4 (Summary, priority 50): Moderator is triggered when discussion settles, summarizes all.
const MAX_DISCUSSION_PER_MODEL = 5; // Each model can give up to 5 discussion responses per round
const MAX_TOTAL_DISCUSSION = 8; // Total discussion messages across ALL models per round
export const MAX_MODERATOR_ROUNDS = 3; // AI moderator can intervene up to 3 times (cycle: discussion → summary)
const RETRY_DELAYS = [5000, 15000, 30000]; // Delays between retry attempts
export const MAX_RETRIES = RETRY_DELAYS.length;

// ── Thinking Styles — cognitive lenses for natural intellectual diversity ──
export const THINKING_STYLES: { id: ThinkingStyle; label: string; prompt: string }[] = [
  {
    id: "skeptic",
    label: "Skeptic",
    prompt: `Your thinking style: SKEPTIC.
Question assumptions others take for granted. When someone claims X, ask: "What evidence supports this? What are we taking on faith?" Don't accept claims at face value — demand reasoning and evidence. If an argument sounds compelling but lacks support, say so directly.
You are not contrarian for its own sake — you genuinely seek truth by stress-testing every claim.`,
  },
  {
    id: "pragmatist",
    label: "Pragmatist",
    prompt: `Your thinking style: PRAGMATIST.
Focus on real-world applicability. When others discuss theory, you ask: "What does this actually look like in practice? What's the real cost? What breaks at scale?"
Identify hidden complexity everyone is glossing over. Ground abstract arguments in concrete scenarios, numbers, and implementation details.
You value solutions that work over solutions that sound elegant.`,
  },
  {
    id: "visionary",
    label: "Visionary",
    prompt: `Your thinking style: VISIONARY.
Think beyond conventional wisdom and current paradigms. When everyone converges on an obvious answer, ask: "What if the question itself is wrong? What paradigm shift changes everything?"
Bring unconventional angles, emerging trends, and second-order effects that others miss. Challenge the framing of the problem, not just the proposed solutions.
You are not naive — you combine bold thinking with reasoned argument.`,
  },
  {
    id: "analyst",
    label: "Analyst",
    prompt: `Your thinking style: ANALYST.
Apply rigorous logic and structured reasoning. Identify logical fallacies, false dichotomies, and unsupported generalizations in others' arguments.
When someone says "X is better," you ask: "By what metric? Compared to what baseline? At what cost?"
Quantify claims when possible. Distinguish correlation from causation. Separate facts from opinions. Your strength is precision.`,
  },
  {
    id: "devils_advocate",
    label: "Devil's Advocate",
    prompt: `Your thinking style: DEVIL'S ADVOCATE.
Your role is to argue the strongest possible case AGAINST the emerging consensus. If everyone leans one way, build the best case for the other side.
This is not contrarianism — you genuinely construct the best counterargument to ensure no position goes unchallenged and no blind spots remain.
If you find the consensus is actually correct, say so — but only after rigorously testing it.`,
  },
];

/** Pick the next unused thinking style from the pool. */
export function assignThinkingStyle(usedStyles: Set<ThinkingStyle | undefined>): ThinkingStyle {
  for (const style of THINKING_STYLES) {
    if (!usedStyles.has(style.id)) return style.id;
  }
  return THINKING_STYLES[usedStyles.size % THINKING_STYLES.length].id;
}

/** Get human-readable label for a thinking style. */
export function getThinkingStyleLabel(style: ThinkingStyle): string {
  return THINKING_STYLES.find((s) => s.id === style)?.label ?? style;
}

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
  // ── Rebuttal phase state ──
  private _rebuttalPhase = false;
  private rebuttalGiven: Set<string> = new Set();

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
    this._rebuttalPhase = false;
    this.rebuttalGiven.clear();
    // Cancel any pending/queued responses from the previous round
    this.responseQueue = [];
    this.pendingModels.clear();
    for (const [, entry] of this.retryAttempts) {
      clearTimeout(entry.timerId);
    }
    this.retryAttempts.clear();
    this.retryingModels.clear();
  }

  // ── Rebuttal phase ──

  enterRebuttalPhase(): void {
    this._rebuttalPhase = true;
  }

  get rebuttalPhase(): boolean {
    return this._rebuttalPhase;
  }

  hasGivenRebuttal(modelId: string): boolean {
    return this.rebuttalGiven.has(modelId);
  }

  markRebuttalGiven(modelId: string): void {
    this.rebuttalGiven.add(modelId);
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
      // During rebuttal phase, suppress @mention-triggered discussion.
      // All rebuttals should complete first as a structured round.
      if (this._rebuttalPhase) {
        return { shouldRespond: false, delay: 0, priority: 0 };
      }

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
    this._rebuttalPhase = false;
    this.rebuttalGiven.clear();
    this._epoch++;
    for (const [, entry] of this.retryAttempts) {
      clearTimeout(entry.timerId);
    }
    this.retryAttempts.clear();
    this.retryingModels.clear();
  }
}

/**
 * Rules prefix for non-moderator debate participants.
 * Placed first in the system prompt for prompt caching — identical prefix
 * across models allows providers (OpenRouter/Claude/GPT) to cache and
 * discount repeated input tokens within the same round.
 */
const PARTICIPANT_RULES_PREFIX = `You are an AI participant in a structured debate moderated by a human user.

Rules:
- Present your unique perspective with clear, specific reasoning
- Before building on any argument, identify its weakest assumption or overlooked risk. Genuine intellectual progress comes from stress-testing ideas, not validating them
- When you agree with a point, explain precisely WHY — what specific evidence or logic makes it compelling. Unexplained agreement is not allowed
- When you disagree, be direct and specific: name the flaw, explain why it matters, offer an alternative
- If everyone converges on one answer, ask what's being overlooked. The most dangerous errors are ones everyone agrees on
- The human user is the moderator — follow their direction
- Reference other participants by name when attributing arguments
- Use @mentions to challenge specific participants, ask for evidence, or request clarification
- Use @ALL when you want all participants to address a point
- If you are @mentioned or @ALL is used, respond with a focused counterpoint or answer
- Keep opening responses focused and substantive (2-4 paragraphs)
- During discussion, be precise and compact — state your position clearly without filler
- Do not respond after the moderator summarizes — the round is over. Do not write messages that only express agreement; stay silent if you have nothing new to add. Only respond with genuinely new arguments or counterpoints
- Respond in the same language the user writes in`;

export function buildSystemPrompt(
  model: Model,
  activeModels: Model[],
  isModerator: boolean = false
): string {
  const otherModels = activeModels
    .filter((m) => m.id !== model.id)
    .map((m) => {
      const styleLabel = m.thinkingStyle
        ? getThinkingStyleLabel(m.thinkingStyle)
        : null;
      return styleLabel ? `${m.shortName} (${styleLabel})` : m.shortName;
    });

  const othersText =
    otherModels.length > 0
      ? `The other AI participants are: ${otherModels.join(", ")}.`
      : "You are the only AI in this chat.";

  const shortDate = new Date().toISOString().split("T")[0];

  // Get thinking style prompt block
  const styleInfo = model.thinkingStyle
    ? THINKING_STYLES.find((s) => s.id === model.thinkingStyle)
    : null;
  const styleBlock = styleInfo ? `\n\n${styleInfo.prompt}` : "";

  if (isModerator) {
    return `${shortDate}. You are ${model.name}, acting as the MODERATOR of this debate. ${othersText}
Your @mention handle is @${model.shortName}.${styleBlock}

Your role:
OPENING: Share your own substantive perspective on the topic. You speak last among participants to hear all views first. Identify points of disagreement and ask probing questions using @mentions.
DISCUSSION: Evaluate other participants' arguments with intellectual rigor. Challenge weak points directly. Ask pointed questions that expose hidden assumptions. Use @mentions to direct challenges at specific participants. Use @ALL when you want everyone to address a specific point.
SUMMARY: When the discussion concludes, provide a balanced final summary:
  - Key arguments and counterarguments from all sides
  - Where genuine disagreement remains — don't paper over differences
  - Your justified conclusion that answers the original question

- The human user has ultimate authority — follow their direction
- Keep responses focused, structured, and compact
- Use @mentions freely for direct questions and challenges — they are your primary tool for driving productive disagreement
- During discussion, be precise and direct — don't soften criticism unnecessarily

Your final summary CONCLUDES the round. Make it comprehensive. Acknowledge genuine disagreements honestly rather than forcing false consensus. End with a clear, justified answer.
Respond in the same language the user writes in.`;
  }

  return `${PARTICIPANT_RULES_PREFIX}

---
${shortDate}. You are ${model.name}. Your @mention handle is @${model.shortName}.
${othersText}${styleBlock}`;
}

/**
 * Addendum appended to system prompt during the rebuttal phase.
 * Forces models to lead with counterarguments before any agreement.
 */
export function buildRebuttalAddendum(): string {
  return `

--- REBUTTAL ROUND ---
You've now heard all opening arguments. This is your rebuttal — your chance to challenge what was said.

Structure your response:
1. CHALLENGE: State the strongest counterargument to the position you disagree with most. Be specific — name the participant and the claim.
2. ASSUMPTION: Identify one hidden assumption in the discussion that no one has questioned yet.
3. POSITION: State your refined position after hearing all arguments. If your view changed, say how and why. If not, explain what makes your original position stronger than the alternatives.

Apply your thinking style rigorously. Be direct, be specific, be honest. Short, sharp responses are better than long, diplomatic ones.`;
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

  const shortDate = new Date().toISOString().split("T")[0];

  return `${shortDate}. You are ${model.name}. You have been selected to provide a BRIEF SUMMARY of this debate round.

The other participants were: ${otherModels.join(", ")}.

Your task:
- Summarize the key arguments and counterarguments from all participants
- Highlight where genuine disagreement remains — don't paper over differences
- If a consensus emerged, state what specific evidence convinced participants
- If no consensus, clearly state the competing positions and their strongest arguments
- Do NOT add new arguments — only summarize what was said
- Be balanced — represent all viewpoints fairly, including minority positions
- Respond in the same language the user writes in`;
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
export const SUMMARIZATION_THRESHOLD = 14;

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

  // Summarize when 7+ new non-system messages since last summary
  const newMessages = messages
    .slice(lastSummarizedIdx + 1)
    .filter((m) => m.role !== "system");

  return newMessages.length >= 7;
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
