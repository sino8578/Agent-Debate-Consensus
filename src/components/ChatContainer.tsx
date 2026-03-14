"use client";

import { useEffect, useCallback, useState } from "react";
import { useChatStore } from "@/store/chatStore";
import {
  conversationEngine,
  buildSystemPrompt,
  buildContextWindow,
} from "@/lib/conversationEngine";
import { streamModelResponse, stopAllStreams } from "@/lib/streamHandler";
import { messagesToMarkdown, downloadMarkdown } from "@/lib/exportChat";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { ModelSelector } from "./ModelSelector";
import { ActiveModels } from "./ActiveModels";
import { WelcomeScreen } from "./WelcomeScreen";
import { Message } from "@/types/chat";

export function ChatContainer() {
  const addMessage = useChatStore((state) => state.addMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const completeMessage = useChatStore((state) => state.completeMessage);
  const setTyping = useChatStore((state) => state.setTyping);
  const activeModels = useChatStore((state) => state.activeModels);
  const typingModels = useChatStore((state) => state.typingModels);
  const contextWindowSize = useChatStore((state) => state.contextWindowSize);
  const clearChat = useChatStore((state) => state.clearChat);
  const messages = useChatStore((state) => state.messages);
  const theme = useChatStore((state) => state.theme);
  const setTheme = useChatStore((state) => state.setTheme);
  const publicMode = useChatStore((state) => state.publicMode);
  const setPublicMode = useChatStore((state) => state.setPublicMode);
  const apiKey = useChatStore((state) => state.apiKey);
  const setApiKey = useChatStore((state) => state.setApiKey);
  const clearApiKey = useChatStore((state) => state.clearApiKey);

  const [configLoaded, setConfigLoaded] = useState(false);

  const isGenerating = typingModels.length > 0 || messages.some((m) => m.isStreaming);

  // Load config and restore session key on mount
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch("/api/config");
        const data = await res.json();
        setPublicMode(data.publicMode);

        if (data.publicMode) {
          const stored = sessionStorage.getItem("openrouter-api-key");
          if (stored) {
            setApiKey(stored);
          }
        }
      } catch {
        // If config fails, assume private mode
        setPublicMode(false);
      }
      setConfigLoaded(true);
    }
    init();
  }, [setPublicMode, setApiKey]);

  // Show nothing until config is loaded (prevents flash)
  if (!configLoaded) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Public mode without key — show welcome screen
  if (publicMode && !apiKey) {
    return <WelcomeScreen />;
  }

  return <ChatApp />;
}

// Extracted to a separate component to keep hooks unconditional
function ChatApp() {
  const addMessage = useChatStore((state) => state.addMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const completeMessage = useChatStore((state) => state.completeMessage);
  const removeMessage = useChatStore((state) => state.removeMessage);
  const setTyping = useChatStore((state) => state.setTyping);
  const activeModels = useChatStore((state) => state.activeModels);
  const typingModels = useChatStore((state) => state.typingModels);
  const contextWindowSize = useChatStore((state) => state.contextWindowSize);
  const clearChat = useChatStore((state) => state.clearChat);
  const messages = useChatStore((state) => state.messages);
  const theme = useChatStore((state) => state.theme);
  const setTheme = useChatStore((state) => state.setTheme);
  const publicMode = useChatStore((state) => state.publicMode);
  const clearApiKey = useChatStore((state) => state.clearApiKey);
  const fontSize = useChatStore((state) => state.fontSize);
  const setFontSize = useChatStore((state) => state.setFontSize);

  const isGenerating = typingModels.length > 0 || messages.some((m) => m.isStreaming);

  const handleStop = useCallback(() => {
    stopAllStreams();
    conversationEngine.reset();
    typingModels.forEach((t) => setTyping(t.modelId, t.modelName, false));
    messages.forEach((m) => {
      if (m.isStreaming) {
        completeMessage(m.id);
      }
    });
  }, [typingModels, messages, setTyping, completeMessage]);

  const triggerModelResponse = useCallback(
    async (modelId: string) => {
      const state = useChatStore.getState();
      const model = state.activeModels.find((m) => m.id === modelId);
      if (!model) {
        conversationEngine.completeResponse(modelId);
        return;
      }

      setTyping(modelId, model.name, true);

      const systemPrompt = buildSystemPrompt(model, state.activeModels);
      const contextMessages = buildContextWindow(
        state.messages,
        contextWindowSize,
        model
      );

      const apiMessages = [
        { role: "system" as const, content: systemPrompt },
        ...contextMessages,
      ];

      const messageId = addMessage({
        role: "assistant",
        content: "",
        modelId: model.id,
        modelName: model.name,
        isStreaming: true,
      });

      setTyping(modelId, model.name, false);

      let content = "";
      let reasoning = "";
      await streamModelResponse(modelId, apiMessages, {
        onToken: (token, reasoningToken) => {
          if (token) content += token;
          if (reasoningToken) reasoning += reasoningToken;
          updateMessage(messageId, content, reasoning);
        },
        onComplete: () => {
          // Remove empty messages (stream returned no content)
          if (!content) {
            removeMessage(messageId);
            conversationEngine.completeResponse(modelId);
            return;
          }

          completeMessage(messageId);
          conversationEngine.completeResponse(modelId);

          const latestState = useChatStore.getState();
          const latestMessage = latestState.messages.find(
            (m) => m.id === messageId
          );
          if (latestMessage) {
            processModelResponses(latestMessage);
          }
        },
        onError: (error) => {
          console.error("Stream error:", error);
          updateMessage(messageId, content || "[Error: Failed to get response]", reasoning);
          completeMessage(messageId);
          conversationEngine.completeResponse(modelId);
        },
      });
    },
    [addMessage, updateMessage, completeMessage, removeMessage, setTyping, contextWindowSize]
  );

  useEffect(() => {
    conversationEngine.setResponseHandler(triggerModelResponse);
  }, [triggerModelResponse]);

  const processModelResponses = useCallback(
    (latestMessage: Message) => {
      const state = useChatStore.getState();

      for (const model of state.activeModels) {
        const decision = conversationEngine.analyzeForResponse(
          model,
          state.messages,
          latestMessage,
          state.activeModels
        );

        if (decision.shouldRespond) {
          conversationEngine.queueResponse(model.id, decision.delay, decision.priority);
        }
      }
    },
    []
  );

  const handleSendMessage = useCallback(
    (content: string) => {
      if (activeModels.length === 0) {
        return;
      }

      const messageId = addMessage({
        role: "user",
        content,
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

  return (
    <div className="h-screen flex overflow-hidden">
      {/* macOS-style sidebar */}
      <div className="w-[260px] flex-shrink-0 vibrancy border-r border-separator flex flex-col">
        {/* App header */}
        <div className="h-[52px] flex items-center gap-2.5 px-4 border-b border-separator">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-primary-hover flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="text-[14px] font-semibold tracking-[-0.01em] flex-1">Agent Debate</span>

          {/* Theme toggle */}
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
        </div>

        {/* Participants */}
        <div className="px-3 pt-4 pb-2">
          <h2 className="px-2 text-[12px] font-medium text-muted uppercase tracking-[0.05em] mb-2.5">
            Participants
          </h2>
          <ActiveModels />
        </div>

        {/* Agents list */}
        <div className="flex-1 overflow-y-auto px-3 pt-1">
          <ModelSelector />
        </div>

        {/* Font size slider */}
        <div className="px-4 py-2.5 border-t border-separator">
          <div className="flex items-center gap-2.5">
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
        <div className="px-3 py-3 border-t border-separator space-y-1.5">
          <div className="flex gap-1.5">
            {messages.length > 0 && (
              <button
                onClick={() => {
                  const md = messagesToMarkdown(messages);
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
                clearChat();
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

          {publicMode && (
            <button
              onClick={clearApiKey}
              className="w-full flex items-center justify-center gap-1.5 h-[30px] text-[12px] text-muted/70 hover:text-red-400 rounded-lg hover:bg-elevated transition-colors duration-150"
              title="Clear API key and return to welcome screen"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Disconnect API Key
            </button>
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        <MessageList />
        <ChatInput
          onSend={handleSendMessage}
          onStop={handleStop}
          disabled={activeModels.length === 0}
          isGenerating={isGenerating}
        />
      </div>
    </div>
  );
}
