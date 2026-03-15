import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import { ChatState, Model, Message, Theme, AppMode, TemperaturePreset, DebateSession, ThinkingStyle } from "@/types/chat";
import { availableModels as defaultModels } from "@/lib/models";
import { assignThinkingStyle } from "@/lib/conversationEngine";

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: [],
      activeModels: [],
      availableModels: defaultModels,
      typingModels: [],
      contextWindowSize: 20,
      theme: "dark" as Theme,
      fontSize: 15,
      moderatorId: null,
      appMode: null as AppMode | null,
      hasServerKey: false,
      freeModelIds: [] as string[],
      freeModelsLoadedAt: null as number | null,
      apiKey: null,
      failedModels: {},
      maxActiveModels: 8,
      contextSummary: null,
      temperature: "balanced" as TemperaturePreset,
      sessions: [],
      currentSessionId: null,
      webSearchEnabled: false,

      addMessage: (message) => {
        const id = uuidv4();
        set((state) => ({
          messages: [
            ...state.messages,
            { ...message, id, timestamp: Date.now() },
          ],
        }));
        return id;
      },

      updateMessage: (id, content, reasoning) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id
              ? {
                  ...m,
                  content: content ? content : m.content,
                  reasoning: reasoning !== undefined ? reasoning : m.reasoning,
                }
              : m
          ),
        })),

      completeMessage: (id) =>
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === id ? { ...m, isStreaming: false } : m
          ),
        })),

      removeMessage: (id) =>
        set((state) => ({
          messages: state.messages.filter((m) => m.id !== id),
        })),

      setTyping: (modelId, modelName, isTyping) =>
        set((state) => ({
          typingModels: isTyping
            ? [...state.typingModels.filter((t) => t.modelId !== modelId), { modelId, modelName }]
            : state.typingModels.filter((t) => t.modelId !== modelId),
        })),

      toggleModel: (modelId) =>
        set((state) => {
          const model = state.availableModels.find((m) => m.id === modelId);
          if (!model) return state;

          const isCurrentlyActive = state.activeModels.some(
            (m) => m.id === modelId
          );

          // Enforce max active models limit when activating
          if (!isCurrentlyActive && state.activeModels.length >= state.maxActiveModels) {
            return state;
          }

          // Clear failure when re-activating a model
          const { [modelId]: _, ...cleanedFailed } = state.failedModels;

          if (isCurrentlyActive) {
            return {
              activeModels: state.activeModels.filter((m) => m.id !== modelId),
              failedModels: state.failedModels,
            };
          }

          // Assign thinking style from unused pool
          const usedStyles = new Set(
            state.activeModels.map((m) => m.thinkingStyle)
          );
          const style = assignThinkingStyle(usedStyles);

          return {
            activeModels: [
              ...state.activeModels,
              { ...model, isActive: true, thinkingStyle: style },
            ],
            failedModels: cleanedFailed,
          };
        }),

      addAvailableModel: (model) =>
        set((state) => {
          if (state.availableModels.some((m) => m.id === model.id)) {
            return state;
          }
          return {
            availableModels: [...state.availableModels, model],
          };
        }),

      removeModel: (modelId) =>
        set((state) => ({
          availableModels: state.availableModels.filter((m) => m.id !== modelId),
          activeModels: state.activeModels.filter((m) => m.id !== modelId),
        })),

      setContextWindowSize: (size) => set({ contextWindowSize: size }),

      setTheme: (theme) => {
        // DOM update handled by ThemeProvider useEffect — keep store pure
        set({ theme });
      },

      setFontSize: (size) => set({ fontSize: size }),

      setModerator: (modelId) =>
        set((state) => {
          const prevId = state.moderatorId;
          if (prevId === modelId) return state;

          const findName = (id: string | null) =>
            id ? state.availableModels.find((m) => m.id === id)?.name ?? id : null;

          let text: string;
          if (!modelId) {
            text = `Moderator changed: ${findName(prevId)} → You (human)`;
          } else if (!prevId) {
            text = `Moderator assigned: ${findName(modelId)}`;
          } else {
            text = `Moderator changed: ${findName(prevId)} → ${findName(modelId)}`;
          }

          const notification: Message = {
            id: uuidv4(),
            role: "system",
            content: text,
            timestamp: Date.now(),
          };

          return {
            moderatorId: modelId,
            messages: [...state.messages, notification],
          };
        }),

      setAppMode: (mode) => set({ appMode: mode }),
      setHasServerKey: (has) => set({ hasServerKey: has }),
      setFreeModelIds: (ids) => set({ freeModelIds: ids, freeModelsLoadedAt: Date.now() }),

      setApiKey: (key) => {
        sessionStorage.setItem("openrouter-api-key", key);
        set({ apiKey: key });
      },

      clearApiKey: () => {
        sessionStorage.removeItem("openrouter-api-key");
        set({ apiKey: null });
      },

      setContextSummary: (summary) => set({ contextSummary: summary }),

      clearChat: () => set({ messages: [], typingModels: [], failedModels: {}, contextSummary: null }),

      setMaxActiveModels: (limit) => set({ maxActiveModels: limit }),

      markModelFailed: (modelId, reason) =>
        set((state) => {
          const newFailed = { ...state.failedModels, [modelId]: reason };

          // If failed model is moderator, reassign to another active non-failed model
          if (state.moderatorId === modelId) {
            const candidates = state.activeModels.filter(
              (m) => m.id !== modelId && !newFailed[m.id]
            );
            const newMod = candidates.length > 0
              ? candidates[Math.floor(Math.random() * candidates.length)]
              : null;

            const failedName = state.availableModels.find((m) => m.id === modelId)?.name ?? modelId;
            const text = newMod
              ? `Moderator auto-reassigned: ${failedName} (failed) → ${newMod.name}`
              : `Moderator removed: ${failedName} failed, no candidates available`;

            const notification: Message = {
              id: uuidv4(),
              role: "system",
              content: text,
              timestamp: Date.now(),
            };

            return {
              failedModels: newFailed,
              moderatorId: newMod?.id ?? null,
              messages: [...state.messages, notification],
            };
          }
          return { failedModels: newFailed };
        }),

      clearModelFailed: (modelId) =>
        set((state) => {
          const { [modelId]: _, ...rest } = state.failedModels;
          return { failedModels: rest };
        }),

      initializeModels: (models) => set({ availableModels: models }),

      setTemperature: (preset) => set({ temperature: preset }),

      setWebSearch: (enabled) => set({ webSearchEnabled: enabled }),

      saveCurrentSession: () =>
        set((state) => {
          const now = Date.now();
          const firstUserMsg = state.messages.find((m) => m.role === "user");
          const title = firstUserMsg
            ? firstUserMsg.content.slice(0, 60)
            : "New Debate";
          const activeModelIds = state.activeModels.map((m) => m.id);

          if (state.currentSessionId) {
            const sessions = state.sessions.map((s) =>
              s.id === state.currentSessionId
                ? {
                    ...s,
                    messages: state.messages,
                    activeModelIds,
                    moderatorId: state.moderatorId,
                    temperature: state.temperature,
                    contextSummary: state.contextSummary,
                    updatedAt: now,
                  }
                : s
            );
            return { sessions };
          } else {
            const id = uuidv4();
            const newSession: DebateSession = {
              id,
              title,
              messages: state.messages,
              activeModelIds,
              moderatorId: state.moderatorId,
              temperature: state.temperature,
              contextSummary: state.contextSummary,
              createdAt: now,
              updatedAt: now,
            };
            return { sessions: [...state.sessions, newSession], currentSessionId: id };
          }
        }),

      loadSession: (id) =>
        set((state) => {
          // Save current if there are messages
          let updatedSessions = state.sessions;
          if (state.messages.length > 0) {
            const now = Date.now();
            const firstUserMsg = state.messages.find((m) => m.role === "user");
            const title = firstUserMsg
              ? firstUserMsg.content.slice(0, 60)
              : "New Debate";
            const activeModelIds = state.activeModels.map((m) => m.id);
            if (state.currentSessionId) {
              updatedSessions = state.sessions.map((s) =>
                s.id === state.currentSessionId
                  ? {
                      ...s,
                      messages: state.messages,
                      activeModelIds,
                      moderatorId: state.moderatorId,
                      temperature: state.temperature,
                      contextSummary: state.contextSummary,
                      updatedAt: now,
                    }
                  : s
              );
            } else {
              const newId = uuidv4();
              const newSession: DebateSession = {
                id: newId,
                title,
                messages: state.messages,
                activeModelIds,
                moderatorId: state.moderatorId,
                temperature: state.temperature,
                contextSummary: state.contextSummary,
                createdAt: now,
                updatedAt: now,
              };
              updatedSessions = [...state.sessions, newSession];
            }
          }

          const session = updatedSessions.find((s) => s.id === id);
          if (!session) return { sessions: updatedSessions };

          const usedStyles = new Set<ThinkingStyle | undefined>();
          const restoredActiveModels = state.availableModels
            .filter((m) => session.activeModelIds.includes(m.id))
            .map((m) => {
              const style = assignThinkingStyle(usedStyles);
              usedStyles.add(style);
              return { ...m, isActive: true, thinkingStyle: style };
            });

          return {
            sessions: updatedSessions,
            messages: session.messages,
            activeModels: restoredActiveModels,
            moderatorId: session.moderatorId,
            temperature: session.temperature,
            contextSummary: session.contextSummary ?? null,
            currentSessionId: id,
            typingModels: [],
            failedModels: {},
          };
        }),

      deleteSession: (id) =>
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== id),
          currentSessionId: state.currentSessionId === id ? null : state.currentSessionId,
        })),

      newDebate: () =>
        set((state) => {
          let updatedSessions = state.sessions;
          if (state.messages.length > 0) {
            const now = Date.now();
            const firstUserMsg = state.messages.find((m) => m.role === "user");
            const title = firstUserMsg
              ? firstUserMsg.content.slice(0, 60)
              : "New Debate";
            const activeModelIds = state.activeModels.map((m) => m.id);
            if (state.currentSessionId) {
              updatedSessions = state.sessions.map((s) =>
                s.id === state.currentSessionId
                  ? {
                      ...s,
                      messages: state.messages,
                      activeModelIds,
                      moderatorId: state.moderatorId,
                      temperature: state.temperature,
                      contextSummary: state.contextSummary,
                      updatedAt: now,
                    }
                  : s
              );
            } else {
              const newId = uuidv4();
              const newSession: DebateSession = {
                id: newId,
                title,
                messages: state.messages,
                activeModelIds,
                moderatorId: state.moderatorId,
                temperature: state.temperature,
                contextSummary: state.contextSummary,
                createdAt: now,
                updatedAt: now,
              };
              updatedSessions = [...state.sessions, newSession];
            }
          }
          return {
            sessions: updatedSessions,
            messages: [],
            typingModels: [],
            failedModels: {},
            contextSummary: null,
            currentSessionId: uuidv4(),
          };
        }),
    }),
    {
      name: "chat-storage",
      partialize: (state) => ({
        messages: state.messages,
        availableModels: state.availableModels,
        activeModels: state.activeModels,
        contextWindowSize: state.contextWindowSize,
        theme: state.theme,
        fontSize: state.fontSize,
        moderatorId: state.moderatorId,
        sessions: state.sessions,
        temperature: state.temperature,
        webSearchEnabled: state.webSearchEnabled,
        contextSummary: state.contextSummary,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Clean up stale streaming state that persisted from a page close mid-stream
          const hasStale = state.messages.some((m) => m.isStreaming);
          if (hasStale) {
            useChatStore.setState({
              messages: state.messages.map((m) =>
                m.isStreaming ? { ...m, isStreaming: false } : m
              ),
              typingModels: [],
            });
          }

          // Migrate: assign thinking styles to active models that don't have one
          const needsStyle = state.activeModels.some((m) => !m.thinkingStyle);
          if (needsStyle) {
            const usedStyles = new Set<ThinkingStyle | undefined>();
            const updatedModels = state.activeModels.map((m) => {
              if (m.thinkingStyle) {
                usedStyles.add(m.thinkingStyle);
                return m;
              }
              const style = assignThinkingStyle(usedStyles);
              usedStyles.add(style);
              return { ...m, thinkingStyle: style };
            });
            useChatStore.setState({ activeModels: updatedModels });
          }
        }
      },
    }
  )
);
