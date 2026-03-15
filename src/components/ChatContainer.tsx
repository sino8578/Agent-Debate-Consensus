"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import { useChatStore } from "@/store/chatStore";
import {
  conversationEngine,
  buildSystemPrompt,
  buildSummaryPrompt,
  buildRebuttalAddendum,
  buildContextWindow,
  buildSummarizationSystemPrompt,
  buildSummarizationInput,
  shouldSummarize,
  getSummarizationSplit,
  MAX_MODERATOR_ROUNDS,
  MAX_RETRIES,
} from "@/lib/conversationEngine";
import { streamModelResponse, stopAllStreams } from "@/lib/streamHandler";
import { MAX_COMPLETION_TOKENS } from "@/lib/tokenBudget";
import { messagesToMarkdown, downloadMarkdown } from "@/lib/exportChat";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { ModelSelector } from "./ModelSelector";
import { WelcomeScreen } from "./WelcomeScreen";
import { ApiKeyPromptModal } from "./ApiKeyPromptModal";
import { Message, TemperaturePreset, FileAttachment } from "@/types/chat";

const TEMP_MAP: Record<TemperaturePreset, number> = {
  creative: 0.9,
  balanced: 0.7,
  precise: 0.3,
};

export function ChatContainer() {
  const setAppMode = useChatStore((state) => state.setAppMode);
  const setHasServerKey = useChatStore((state) => state.setHasServerKey);
  const setFreeModelIds = useChatStore((state) => state.setFreeModelIds);
  const hasServerKey = useChatStore((state) => state.hasServerKey);
  const apiKey = useChatStore((state) => state.apiKey);
  const setApiKey = useChatStore((state) => state.setApiKey);
  const setMaxActiveModels = useChatStore((state) => state.setMaxActiveModels);
  const freeModelsLoadedAt = useChatStore((state) => state.freeModelsLoadedAt);

  const [configLoaded, setConfigLoaded] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("/api/config");
        const data = await res.json();
        setAppMode(data.appMode);
        setHasServerKey(data.hasServerKey);

        if (data.maxActiveModels) {
          setMaxActiveModels(data.maxActiveModels);
        }

        // Restore user key from session if applicable
        if (!data.hasServerKey || data.appMode === "public") {
          const stored = sessionStorage.getItem("openrouter-api-key");
          if (stored) {
            setApiKey(stored);
          }
        }

        // In public mode with server key, fetch free model list
        if (data.hasServerKey && data.appMode === "public") {
          const state = useChatStore.getState();
          const isCacheFresh =
            state.freeModelsLoadedAt &&
            Date.now() - state.freeModelsLoadedAt < 3600_000;
          if (!isCacheFresh) {
            try {
              const freeRes = await fetch("/api/free-models");
              const freeData = await freeRes.json();
              if (freeData.freeModelIds) {
                setFreeModelIds(freeData.freeModelIds);
              }
            } catch (err) {
              console.error("Failed to fetch free models:", err);
            }
          }
        }
      } catch {
        setAppMode("private");
        setHasServerKey(false);
      }
      setConfigLoaded(true);
    }
    init();
  }, [setAppMode, setHasServerKey, setFreeModelIds, setApiKey, setMaxActiveModels, freeModelsLoadedAt]);

  if (!configLoaded) {
    return (
      <div className="h-dvh flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Show WelcomeScreen only when there is no server key AND no user key
  const noKeyAvailable = !hasServerKey && !apiKey;
  if (noKeyAvailable) {
    return <WelcomeScreen />;
  }

  return <ChatApp />;
}

function ChatApp() {
  const addMessage = useChatStore((state) => state.addMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const completeMessage = useChatStore((state) => state.completeMessage);
  const removeMessage = useChatStore((state) => state.removeMessage);
  const setTyping = useChatStore((state) => state.setTyping);
  const activeModels = useChatStore((state) => state.activeModels);
  const typingModels = useChatStore((state) => state.typingModels);
  const contextWindowSize = useChatStore((state) => state.contextWindowSize);
  const messages = useChatStore((state) => state.messages);
  const theme = useChatStore((state) => state.theme);
  const setTheme = useChatStore((state) => state.setTheme);
  const appMode = useChatStore((state) => state.appMode);
  const hasServerKey = useChatStore((state) => state.hasServerKey);
  const apiKey = useChatStore((state) => state.apiKey);
  const clearApiKey = useChatStore((state) => state.clearApiKey);
  const fontSize = useChatStore((state) => state.fontSize);
  const setFontSize = useChatStore((state) => state.setFontSize);
  const moderatorId = useChatStore((state) => state.moderatorId);
  const contextSummary = useChatStore((state) => state.contextSummary);
  const setContextSummary = useChatStore((state) => state.setContextSummary);
  const markModelFailed = useChatStore((state) => state.markModelFailed);
  const clearModelFailed = useChatStore((state) => state.clearModelFailed);
  const temperature = useChatStore((state) => state.temperature);
  const setTemperature = useChatStore((state) => state.setTemperature);
  const sessions = useChatStore((state) => state.sessions);
  const newDebate = useChatStore((state) => state.newDebate);
  const loadSession = useChatStore((state) => state.loadSession);
  const deleteSession = useChatStore((state) => state.deleteSession);
  const currentSessionId = useChatStore((state) => state.currentSessionId);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= 768;
  });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [keyPromptOpen, setKeyPromptOpen] = useState(false);

  const isGenerating = typingModels.length > 0 || messages.some((m) => m.isStreaming);
  const summarizationAbort = useRef<AbortController | null>(null);

  // Auto-close sidebar when window resizes below mobile breakpoint
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleStop = useCallback(() => {
    // 1. Mark round complete FIRST — blocks all downstream activity
    conversationEngine.markRoundComplete();
    // 2. Abort all active HTTP streams + any in-flight summarization
    stopAllStreams();
    if (summarizationAbort.current) {
      summarizationAbort.current.abort();
      summarizationAbort.current = null;
    }
    // 3. Clean up UI state
    const currentState = useChatStore.getState();
    currentState.typingModels.forEach((t) => setTyping(t.modelId, t.modelName, false));
    currentState.messages.forEach((m) => {
      if (m.isStreaming) {
        completeMessage(m.id);
      }
    });
  }, [setTyping, completeMessage]);

  // ── Progressive summarization: fire-and-forget after round completes ──
  const triggerSummarization = useCallback(async () => {
    const state = useChatStore.getState();

    // Don't spend server credits on summarization in public mode without user's own key
    if (state.appMode === "public" && !state.apiKey) return;

    if (!shouldSummarize(state.messages, state.contextSummary)) return;

    // Pick model for summarization: moderator > random active model
    const failedIds = new Set(Object.keys(state.failedModels));
    const candidates = state.activeModels.filter((m) => !failedIds.has(m.id));
    if (candidates.length === 0) return;

    const summarizerModel = state.moderatorId
      ? candidates.find((m) => m.id === state.moderatorId) ?? candidates[0]
      : candidates[0];

    // Determine which messages to summarize
    const { toSummarize, recentStartIdx } = getSummarizationSplit(state.messages);
    if (toSummarize.length === 0) return;

    // Use the last non-system message in the summarized range as throughMessageId
    const lastSummarized = toSummarize[toSummarize.length - 1];
    if (!lastSummarized) return;

    // Build input
    const input = buildSummarizationInput(
      toSummarize,
      state.contextSummary?.content
    );
    const systemPrompt = buildSummarizationSystemPrompt();

    const apiMessages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: input },
    ];

    // Abort any previous in-flight summarization
    if (summarizationAbort.current) {
      summarizationAbort.current.abort();
    }
    const controller = new AbortController();
    summarizationAbort.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(typeof window !== "undefined" && sessionStorage.getItem("openrouter-api-key")
            ? { "x-api-key": sessionStorage.getItem("openrouter-api-key")! }
            : {}),
        },
        body: JSON.stringify({
          model: summarizerModel.id,
          messages: apiMessages,
          temperature: 0.3,
          max_tokens: 2048,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let summaryContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) summaryContent += parsed.content;
          } catch {
            // Skip malformed chunks
          }
        }
      }

      // Only save if we got meaningful content and weren't aborted
      if (summaryContent.length > 50 && !controller.signal.aborted) {
        setContextSummary({
          content: summaryContent,
          throughMessageId: lastSummarized.id,
          messageCount: toSummarize.length,
        });
      }
    } catch {
      // Aborted or network error — silently fail, truncation fallback is fine
    } finally {
      if (summarizationAbort.current === controller) {
        summarizationAbort.current = null;
      }
    }
  }, [setContextSummary]);

  // Check if discussion settled (no pending work) and trigger moderator/summarizer.
  // Used after empty responses or failed retries to keep the debate flowing.
  const checkSettled = useCallback(() => {
    if (conversationEngine.hasPendingWork || conversationEngine.roundComplete) return;
    const latestState = useChatStore.getState();
    const lastAssistantMsg = [...latestState.messages]
      .reverse()
      .find((m) => m.role === "assistant" && !m.isStreaming);
    if (lastAssistantMsg) {
      processModelResponses(lastAssistantMsg);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerModelResponse = useCallback(
    async (modelId: string, priority: number) => {
      const state = useChatStore.getState();
      const model = state.activeModels.find((m) => m.id === modelId);
      if (!model) {
        conversationEngine.completeResponse(modelId);
        conversationEngine.clearRetry(modelId);
        return;
      }

      if (state.failedModels[modelId] || conversationEngine.roundComplete) {
        conversationEngine.completeResponse(modelId);
        conversationEngine.clearRetry(modelId);
        return;
      }

      const isModerator = model.id === state.moderatorId;
      const isSummarizer = model.id === conversationEngine.summarizerModelId;
      const isRebuttal =
        conversationEngine.rebuttalPhase &&
        !conversationEngine.hasGivenRebuttal(modelId) &&
        !isModerator &&
        !isSummarizer;

      let systemPrompt: string;
      if (isSummarizer) {
        systemPrompt = buildSummaryPrompt(model, state.activeModels);
      } else {
        systemPrompt = buildSystemPrompt(model, state.activeModels, isModerator);
        if (isRebuttal) {
          systemPrompt += buildRebuttalAddendum();
        }
      }

      const contextMessages = buildContextWindow(
        state.messages,
        contextWindowSize,
        model,
        state.contextSummary
      );

      const apiMessages = [
        { role: "system" as const, content: systemPrompt },
        ...contextMessages,
      ];

      const streamOptions = {
        temperature: TEMP_MAP[state.temperature],
        webSearch: state.webSearchEnabled,
        maxTokens: MAX_COMPLETION_TOKENS,
      };

      // Mark summary/verdict messages: moderator settle (priority ≤ 50) or random summarizer
      const isSummaryMessage = (isModerator && priority <= 50) || isSummarizer;

      const messageId = addMessage({
        role: "assistant",
        content: "",
        modelId: model.id,
        modelName: model.name,
        isStreaming: true,
        ...(isSummaryMessage ? { messageType: "summary" as const } : {}),
      });

      const result = await new Promise<{ content: string; reasoning: string; error?: Error }>((resolve) => {
        let content = "";
        let reasoning = "";
        streamModelResponse(modelId, apiMessages, {
          onToken: (token, reasoningToken) => {
            if (token) content += token;
            if (reasoningToken) reasoning += reasoningToken;
            updateMessage(messageId, content, reasoning);
          },
          onComplete: () => resolve({ content, reasoning }),
          onError: (error) => resolve({ content: "", reasoning: "", error }),
        }, streamOptions);
      });

      // ── Error: release slot for other models, schedule background retry ──
      if (result.error) {
        removeMessage(messageId);
        conversationEngine.releaseSlot(modelId);

        const scheduled = conversationEngine.scheduleRetry(modelId, priority);
        if (scheduled) {
          addMessage({
            role: "system",
            content: `${model.name}: error, retrying (${conversationEngine.getRetryAttempt(modelId)}/${MAX_RETRIES})...`,
          });
        } else {
          console.error(`${model.name} failed after ${MAX_RETRIES} retries:`, result.error);
          addMessage({
            role: "system",
            content: `${model.name}: failed after ${MAX_RETRIES} retries — ${result.error.message}`,
          });
          markModelFailed(modelId, result.error.message);
          checkSettled();
        }
        return;
      }

      // ── Empty response ──
      if (!result.content) {
        removeMessage(messageId);
        if (isRebuttal) {
          conversationEngine.markRebuttalGiven(modelId);
        }
        const isDiscussion = conversationEngine.hasResponded(modelId);
        conversationEngine.completeResponse(modelId, isDiscussion);
        conversationEngine.clearRetry(modelId);
        checkSettled();
        return;
      }

      // ── Success ──
      completeMessage(messageId);
      conversationEngine.clearRetry(modelId);

      // Track rebuttal completion
      if (isRebuttal) {
        conversationEngine.markRebuttalGiven(modelId);
      }

      const latestState = useChatStore.getState();
      const isMod = modelId === latestState.moderatorId;
      const isSum = modelId === conversationEngine.summarizerModelId;

      const isDiscussion = conversationEngine.hasResponded(modelId);
      conversationEngine.completeResponse(modelId, isDiscussion);
      clearModelFailed(modelId);

      // Summarizer (random model when no moderator) → round over
      if (isSum) {
        conversationEngine.markRoundComplete();
        triggerSummarization();
        return;
      }

      const latestMessage = latestState.messages.find(
        (m) => m.id === messageId
      );

      if (isMod) {
        // Settle-triggered response (summary/conclusion, priority 50) → end the round
        // immediately. Don't scan for @mentions — the moderator's summary concludes
        // the debate, even if it attributes arguments with @ModelName.
        if (priority <= 50) {
          conversationEngine.markRoundComplete();
          triggerSummarization();
          return;
        }
        // Opening or discussion response — check for @mentions for further discussion
        if (latestMessage) {
          processModelResponses(latestMessage);
        }
        // If no models were queued → check if rebuttal started (don't end prematurely)
        if (!conversationEngine.hasPendingWork) {
          if (conversationEngine.rebuttalPhase) {
            // Rebuttal was triggered from processModelResponses — wait for it
            return;
          }
          conversationEngine.markRoundComplete();
          triggerSummarization();
        }
        return;
      }

      // Non-moderator: process responses (scan for @mentions, trigger discussion)
      if (latestMessage) {
        processModelResponses(latestMessage);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addMessage, updateMessage, completeMessage, removeMessage, setTyping, contextWindowSize, markModelFailed, clearModelFailed]
  );

  useEffect(() => {
    conversationEngine.setResponseHandler(triggerModelResponse);
  }, [triggerModelResponse]);

  const processModelResponses = useCallback(
    (latestMessage: Message) => {
      if (conversationEngine.roundComplete) return;

      const state = useChatStore.getState();
      const failedModelIds = new Set(Object.keys(state.failedModels));
      let anyQueued = false;

      for (const model of state.activeModels) {
        if (failedModelIds.has(model.id)) continue;

        const decision = conversationEngine.analyzeForResponse(
          model,
          state.messages,
          latestMessage,
          state.activeModels,
          state.moderatorId,
          failedModelIds
        );

        if (decision.shouldRespond) {
          conversationEngine.queueResponse(model.id, decision.delay, decision.priority);
          anyQueued = true;
        }
      }

      // When no more models want to respond and no pending work:
      // → Check rebuttal phase, then trigger moderator/summarizer
      if (!anyQueued && latestMessage.role === "assistant" && !conversationEngine.hasPendingWork) {
        // ── Rebuttal phase trigger ──
        // After all openings (and moderator opening if present), before any settle:
        // give each non-moderator model one rebuttal opportunity.
        if (!conversationEngine.rebuttalPhase) {
          const respondedNonMod = state.activeModels.filter(
            (m) =>
              !failedModelIds.has(m.id) &&
              m.id !== state.moderatorId &&
              conversationEngine.hasResponded(m.id)
          );
          if (respondedNonMod.length >= 2) {
            conversationEngine.enterRebuttalPhase();
            for (const m of respondedNonMod) {
              const delay = 1000 + Math.random() * 1500;
              conversationEngine.queueResponse(m.id, delay, 65);
            }
            return; // Wait for rebuttals — don't proceed to settle
          }
        }

        // ── Settle logic (existing) ──
        // Don't re-trigger moderator from its own completion — handled in onComplete
        if (latestMessage.modelId === state.moderatorId) {
          return;
        }

        if (state.moderatorId && !failedModelIds.has(state.moderatorId)) {
          if (conversationEngine.moderatorSettleCount < MAX_MODERATOR_ROUNDS) {
            // Moderator hasn't hit max settle-triggered interventions — trigger for summary/moderation
            conversationEngine.incrementModeratorSettle();
            conversationEngine.queueResponse(state.moderatorId, 2000, 50);
          } else {
            // Moderator exhausted its interventions — force round complete
            conversationEngine.markRoundComplete();
            triggerSummarization();
          }
        } else {
          // No AI moderator — pick random active model to give a brief summary
          const candidates = state.activeModels.filter(
            (m) => !failedModelIds.has(m.id) && conversationEngine.hasResponded(m.id)
          );
          if (candidates.length > 0 && !conversationEngine.summarizerModelId) {
            const summarizer = candidates[Math.floor(Math.random() * candidates.length)];
            conversationEngine.summarizerModelId = summarizer.id;
            conversationEngine.queueResponse(summarizer.id, 2000, 50);
          } else {
            conversationEngine.markRoundComplete();
            triggerSummarization();
          }
        }
      }
    },
    []
  );

  const handleSendMessage = useCallback(
    (content: string, attachment?: FileAttachment) => {
      if (activeModels.length === 0) return;

      // Abort any in-flight summarization — new round invalidates it
      if (summarizationAbort.current) {
        summarizationAbort.current.abort();
        summarizationAbort.current = null;
      }

      // New user message starts a fresh round
      conversationEngine.startNewRound();

      const messageId = addMessage({
        role: "user",
        content,
        attachment,
      });

      setTimeout(() => {
        const state = useChatStore.getState();
        const userMessage = state.messages.find((m) => m.id === messageId);
        if (userMessage) {
          processModelResponses(userMessage);
        }
      }, 0);
    },
    [addMessage, activeModels, processModelResponses]
  );

  const handleBoost = useCallback(
    (content: string, modelName: string) => {
      if (activeModels.length === 0) return;

      const quote = content.length > 150
        ? content.slice(0, 150) + "..."
        : content;

      handleSendMessage(
        `Let's develop this argument by ${modelName} further:\n\n> ${quote}`
      );
    },
    [activeModels, handleSendMessage]
  );

  // Sort sessions: newest first
  const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="h-dvh flex overflow-hidden">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`flex-shrink-0 vibrancy border-r border-separator flex flex-col transition-all duration-250 ease-in-out overflow-hidden
          fixed md:relative top-0 left-0 h-full z-30 md:z-auto
          ${sidebarOpen ? "w-[260px] translate-x-0" : "w-0 md:w-0 -translate-x-full md:translate-x-0 border-r-0"}`}
      >
        {/* App header */}
        <div className="h-[52px] flex items-center gap-2.5 px-4 border-b border-separator min-w-[260px]">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-[14px] font-semibold tracking-[-0.01em] flex-1 whitespace-nowrap">Agent Debate</span>

          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-elevated transition-colors duration-150"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          <button
            onClick={() => setSidebarOpen(false)}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-elevated transition-colors duration-150"
            title="Hide sidebar"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {/* Agents list */}
        <div className="flex-1 overflow-y-auto px-3 pt-4 min-w-[260px]">
          <ModelSelector />

          {/* Debate History — collapsible */}
          {sortedSessions.length > 0 && (
            <div className="mt-4 pt-3 border-t border-separator">
              <button
                onClick={() => setHistoryOpen(!historyOpen)}
                className="w-full flex items-center justify-between px-2 mb-1"
              >
                <span className="text-[12px] font-medium text-muted uppercase tracking-[0.05em]">
                  History
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted/60">{sortedSessions.length}</span>
                  <svg className={`w-3 h-3 text-muted transition-transform duration-150 ${historyOpen ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
              {historyOpen && (
                <div className="space-y-px">
                  {sortedSessions.map((session) => (
                    <div key={session.id} className="group relative">
                      <button
                        onClick={() => {
                          loadSession(session.id);
                          conversationEngine.reset();
                          setSidebarOpen(false);
                        }}
                        className={`w-full text-left px-2 py-[6px] rounded-lg text-[13px] truncate transition-all duration-150 ${
                          session.id === currentSessionId
                            ? "bg-elevated text-foreground"
                            : "text-foreground/70 hover:bg-elevated"
                        }`}
                        title={session.title}
                      >
                        {session.title}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSession(session.id);
                        }}
                        className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-md text-[11px] text-muted hover:text-red-400 opacity-0 group-hover:opacity-100 touch-visible transition-all duration-150"
                        title="Delete"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Settings: Style + Font size — merged into one block */}
        <div className="px-4 py-2.5 border-t border-separator min-w-[260px]">
          <div className="flex items-center gap-1 mb-1.5">
            <span className="text-[11px] text-muted uppercase tracking-[0.04em]">Style:</span>
          </div>
          <div className="flex rounded-lg bg-background p-0.5 gap-0.5">
            {(["creative", "balanced", "precise"] as TemperaturePreset[]).map((preset) => (
              <button
                key={preset}
                onClick={() => setTemperature(preset)}
                className={`flex-1 text-[11px] font-medium py-1.5 rounded-md transition-all duration-150 capitalize ${
                  temperature === preset
                    ? "bg-primary text-white shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2.5 mt-2">
            <span className="text-[12px] text-muted select-none">A</span>
            <input
              type="range"
              min={12}
              max={20}
              step={1}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="flex-1 h-1 appearance-none bg-surface-hover rounded-full cursor-pointer accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-sm"
            />
            <span className="text-[16px] text-muted select-none">A</span>
          </div>
        </div>

        {/* Bottom toolbar */}
        <div className="px-3 py-2.5 border-t border-separator min-w-[260px]">
          <div className="flex gap-1.5">
            {messages.length > 0 && (
              <button
                onClick={() => {
                  const state = useChatStore.getState();
                  const md = messagesToMarkdown(messages, {
                    activeModels: state.activeModels,
                    moderatorId: state.moderatorId,
                  });
                  const date = new Date().toISOString().split("T")[0];
                  downloadMarkdown(md, `debate-${date}.md`);
                }}
                className="flex-1 flex items-center justify-center gap-1.5 h-[30px] text-[13px] text-muted hover:text-foreground rounded-lg hover:bg-elevated transition-colors duration-150"
                title="Export debate as Markdown"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Export
              </button>
            )}
            <button
              onClick={() => {
                newDebate();
                conversationEngine.reset();
              }}
              className="flex-1 flex items-center justify-center gap-1.5 h-[30px] text-[13px] text-muted hover:text-foreground rounded-lg hover:bg-elevated transition-colors duration-150"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              New Debate
            </button>
          </div>

          <div className="flex items-center justify-between mt-1.5">
            {apiKey ? (
              <button
                onClick={clearApiKey}
                className="flex items-center gap-1 h-[26px] text-[11px] text-muted/60 hover:text-red-400 rounded-md hover:bg-elevated transition-colors duration-150 px-1.5"
                title="Clear API key and return to welcome screen"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Disconnect
              </button>
            ) : hasServerKey ? (
              <button
                onClick={() => setKeyPromptOpen(true)}
                className="flex items-center gap-1 h-[26px] text-[11px] text-muted/60 hover:text-primary rounded-md hover:bg-elevated transition-colors duration-150 px-1.5"
                title="Add your OpenRouter API key to unlock all models and avoid rate limits"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                API Key
              </button>
            ) : null}
            <a
              href="https://github.com/Lexus2016/Agent-Debate-Consensus"
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-1 h-[26px] text-[11px] text-muted/60 hover:text-foreground rounded-md hover:bg-elevated transition-colors duration-150 px-1.5 ${apiKey || hasServerKey ? "" : "ml-auto"}`}
              title="View source on GitHub"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              GitHub
            </a>
          </div>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 bg-background relative">
        {/* Sidebar open button when collapsed — fixed on mobile so it stays visible while scrolling */}
        {!sidebarOpen && (
          <div className="fixed md:absolute top-2.5 left-2.5 z-10">
            <button
              onClick={() => setSidebarOpen(true)}
              className="w-9 h-9 md:w-8 md:h-8 flex items-center justify-center rounded-xl md:rounded-lg bg-surface-light border border-separator text-muted hover:text-foreground hover:bg-elevated transition-colors duration-150 shadow-md md:shadow-sm"
              title="Show sidebar"
            >
              <svg className="w-4.5 h-4.5 md:w-4 md:h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        )}
        <MessageList onBoost={handleBoost} />
        <ChatInput
          onSend={handleSendMessage}
          onStop={handleStop}
          disabled={activeModels.length === 0}
          isGenerating={isGenerating}
        />
      </div>

      <ApiKeyPromptModal
        isOpen={keyPromptOpen}
        onClose={() => setKeyPromptOpen(false)}
        reason="proactive"
      />
    </div>
  );
}
