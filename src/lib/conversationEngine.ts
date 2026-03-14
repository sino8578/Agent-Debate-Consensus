import { Model, Message } from "@/types/chat";

interface ResponseDecision {
  shouldRespond: boolean;
  delay: number;
  priority: number;
}

const MAX_AI_ROUNDS = 3; // Max AI-to-AI exchanges before pausing for user

export class ConversationEngine {
  private cooldowns: Map<string, number> = new Map();
  private responseQueue: Array<{ modelId: string; priority: number }> = [];
  private pendingModels: Set<string> = new Set();
  private maxConcurrent = 1;
  private currentlyResponding = 0;
  private onTriggerResponse?: (modelId: string) => void;

  setResponseHandler(handler: (modelId: string) => void) {
    this.onTriggerResponse = handler;
  }

  /**
   * Count consecutive AI messages since the last user message.
   */
  private countAiRoundsSinceUser(messages: Message[]): number {
    let count = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") break;
      if (messages[i].role === "assistant" && !messages[i].isStreaming) {
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
    moderatorId?: string | null
  ): ResponseDecision {
    // Don't respond to own messages
    if (latestMessage.modelId === model.id) {
      return { shouldRespond: false, delay: 0, priority: 0 };
    }

    const isModerator = model.id === moderatorId;

    let priority = 0;
    let shouldRespond = false;

    // Highest priority: @mentioned - BYPASSES COOLDOWN and round limit
    const mentionPattern = new RegExp(`@${model.shortName.toLowerCase()}\\b`, "i");
    const isMentioned = mentionPattern.test(latestMessage.content);

    if (isMentioned) {
      shouldRespond = true;
      priority = 100;
    }

    // Check cooldown (10 seconds) - but @mentions bypass this
    const lastResponse = this.cooldowns.get(model.id) || 0;
    const isOnCooldown = Date.now() - lastResponse < 10000;

    if (isOnCooldown && !isMentioned) {
      return { shouldRespond: false, delay: 0, priority: 0 };
    }

    const aiRounds = this.countAiRoundsSinceUser(messages);

    // Moderator logic: respond after round limit to summarize
    if (isModerator && !isMentioned) {
      // Moderator responds to user messages
      if (latestMessage.role === "user") {
        shouldRespond = true;
        priority = 70; // Slightly lower than regular models so it goes after them
      }
      // Moderator summarizes after the round limit is reached
      else if (aiRounds >= MAX_AI_ROUNDS) {
        shouldRespond = true;
        priority = 90; // High priority for summary
      }
      // Moderator doesn't jump into mid-debate randomly
      else {
        return { shouldRespond: false, delay: 0, priority: 0 };
      }

      const readingTime = Math.min(latestMessage.content.length * 15, 2000);
      const delay = 3000 + readingTime + Math.random() * 1500; // Longer delay — waits for others
      return { shouldRespond, delay, priority };
    }

    // Regular model: check round limit
    if (!isMentioned && latestMessage.role !== "user" && aiRounds >= MAX_AI_ROUNDS) {
      return { shouldRespond: false, delay: 0, priority: 0 };
    }

    // High priority: User message — all active models respond
    if (!shouldRespond && latestMessage.role === "user") {
      shouldRespond = true;
      priority = 80;
    }

    // Medium priority: Another AI asked a question
    if (!shouldRespond && latestMessage.content.includes("?")) {
      shouldRespond = true;
      priority = 60;
    }

    // Low priority: Random chance (10%) for natural flow
    if (!shouldRespond && Math.random() < 0.10) {
      shouldRespond = true;
      priority = 20;
    }

    // Calculate delay based on message length (simulate reading)
    const readingTime = Math.min(latestMessage.content.length * 15, 2000);
    const baseDelay = 1500 + Math.random() * 2000;
    const delay = baseDelay + readingTime;

    return { shouldRespond, delay, priority };
  }

  queueResponse(modelId: string, delay: number, priority: number): void {
    // Don't queue if already queued or currently responding
    if (this.pendingModels.has(modelId)) {
      return;
    }
    this.pendingModels.add(modelId);

    setTimeout(() => {
      // Double-check still pending (might have been cleared by stop)
      if (!this.pendingModels.has(modelId)) {
        return;
      }

      if (this.currentlyResponding < this.maxConcurrent) {
        this.triggerResponse(modelId);
      } else {
        // Insert in priority order
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

  completeResponse(modelId: string): void {
    this.cooldowns.set(modelId, Date.now());
    this.currentlyResponding--;
    this.pendingModels.delete(modelId);

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
    this.currentlyResponding = 0;
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

  if (isModerator) {
    return `You are ${model.name}, acting as the MODERATOR of this debate. ${othersText}

Your role as moderator:
- Guide the discussion — ask clarifying questions, redirect off-topic tangents
- After participants have debated, provide a concise summary of the key arguments
- Identify areas of agreement and remaining disagreements
- When consensus is reached, clearly state the conclusion
- When the debate is exhausted (no new arguments), wrap up with a final summary
- You can address participants using @mentions (e.g., @${otherModels[0] || "User"})
- The human user has ultimate authority — follow their direction if they intervene
- Keep your moderator responses focused and structured
- Do NOT take sides in the debate — remain neutral and analytical

CRITICAL LANGUAGE RULE: You MUST respond in the same language the user used in their message. If the user writes in Ukrainian, respond in Ukrainian. If in English, respond in English. Always match the user's language. This applies to all your responses without exception.`;
  }

  return `You are ${model.name}, participating in a structured debate with a human moderator${otherModels.length > 0 ? " and other AI models" : ""}.

${othersText}

Rules:
- Engage in thoughtful, substantive debate on the topic at hand
- Present your unique perspective with clear reasoning
- When you disagree with others, explain why respectfully and specifically
- Build on good arguments made by others — acknowledge strong points
- Work toward finding consensus where possible, but never agree superficially
- The human user is the moderator — they guide the discussion and can intervene at any time. Follow their direction.
- You can address others using @mentions (e.g., @${otherModels[0] || "User"})
- If directly addressed with @${model.shortName}, you must respond
- Keep responses focused and substantive (2-4 sentences usually, unless more detail is warranted)
- If consensus has been reached or you have nothing new to add, say so briefly rather than repeating points

CRITICAL LANGUAGE RULE: You MUST respond in the same language the user used in their message. If the user writes in Ukrainian, respond in Ukrainian. If in English, respond in English. Always match the user's language. This applies to all your responses without exception.`;
}

export function buildContextWindow(
  messages: Message[],
  windowSize: number,
  model: Model
): { role: "user" | "assistant" | "system"; content: string }[] {
  const recentMessages = messages.slice(-windowSize);

  return recentMessages.map((msg) => ({
    role: msg.role as "user" | "assistant",
    content:
      msg.modelId && msg.modelId !== model.id
        ? `[${msg.modelName}]: ${msg.content}`
        : msg.content,
  }));
}

export const conversationEngine = new ConversationEngine();
