import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import { ChatState, Model, Message, Theme } from "@/types/chat";
import { availableModels as defaultModels } from "@/lib/models";

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
      publicMode: null,
      apiKey: null,
      failedModels: {},

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

          // Clear failure when re-activating a model
          const { [modelId]: _, ...cleanedFailed } = state.failedModels;

          return {
            activeModels: isCurrentlyActive
              ? state.activeModels.filter((m) => m.id !== modelId)
              : [...state.activeModels, { ...model, isActive: true }],
            failedModels: isCurrentlyActive ? state.failedModels : cleanedFailed,
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
        document.documentElement.setAttribute("data-theme", theme);
        set({ theme });
      },

      setFontSize: (size) => set({ fontSize: size }),

      setModerator: (modelId) => set({ moderatorId: modelId }),

      setPublicMode: (mode) => set({ publicMode: mode }),

      setApiKey: (key) => {
        sessionStorage.setItem("openrouter-api-key", key);
        set({ apiKey: key });
      },

      clearApiKey: () => {
        sessionStorage.removeItem("openrouter-api-key");
        set({ apiKey: null });
      },

      clearChat: () => set({ messages: [], typingModels: [], failedModels: {} }),

      markModelFailed: (modelId, reason) =>
        set((state) => {
          const newFailed = { ...state.failedModels, [modelId]: reason };

          // If failed model is moderator, reassign to another active non-failed model
          if (state.moderatorId === modelId) {
            const candidates = state.activeModels.filter(
              (m) => m.id !== modelId && !newFailed[m.id]
            );
            const newMod = candidates.length > 0
              ? candidates[Math.floor(Math.random() * candidates.length)].id
              : null;
            return { failedModels: newFailed, moderatorId: newMod };
          }
          return { failedModels: newFailed };
        }),

      clearModelFailed: (modelId) =>
        set((state) => {
          const { [modelId]: _, ...rest } = state.failedModels;
          return { failedModels: rest };
        }),

      initializeModels: (models) => set({ availableModels: models }),
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
      }),
    }
  )
);
