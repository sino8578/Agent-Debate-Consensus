export interface Model {
  id: string;
  name: string;
  shortName: string;
  provider: string;
  color: string;
  isActive: boolean;
  pricing?: {
    prompt: string;
    completion: string;
  };
  description?: string;
  context_length?: number;
}

export interface FileAttachment {
  fileName: string;
  fileType: string;
  content: string;
  size: number;
  truncated: boolean;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
  attachment?: FileAttachment;
  modelId?: string;
  modelName?: string;
  timestamp: number;
  isStreaming?: boolean;
}

export interface TypingState {
  modelId: string;
  modelName: string;
}

export type Theme = "light" | "dark";

export type AppMode = "private" | "public";

export type TemperaturePreset = "creative" | "balanced" | "precise";

export interface DebateSession {
  id: string;
  title: string;
  messages: Message[];
  activeModelIds: string[];
  moderatorId: string | null;
  temperature: TemperaturePreset;
  createdAt: number;
  updatedAt: number;
}

export interface ChatState {
  messages: Message[];
  activeModels: Model[];
  availableModels: Model[];
  typingModels: TypingState[];
  contextWindowSize: number;
  theme: Theme;
  fontSize: number;
  moderatorId: string | null;
  appMode: AppMode | null;
  hasServerKey: boolean;
  freeModelIds: string[];
  freeModelsLoadedAt: number | null;
  apiKey: string | null;
  failedModels: Record<string, string>; // modelId -> error reason
  maxActiveModels: number;

  addMessage: (message: Omit<Message, "id" | "timestamp">) => string;
  updateMessage: (id: string, content: string, reasoning?: string) => void;
  completeMessage: (id: string) => void;
  removeMessage: (id: string) => void;
  setTyping: (modelId: string, modelName: string, isTyping: boolean) => void;
  toggleModel: (modelId: string) => void;
  addAvailableModel: (model: Model) => void;
  removeModel: (modelId: string) => void;
  setContextWindowSize: (size: number) => void;
  setTheme: (theme: Theme) => void;
  setFontSize: (size: number) => void;
  setModerator: (modelId: string | null) => void;
  setAppMode: (mode: AppMode) => void;
  setHasServerKey: (has: boolean) => void;
  setFreeModelIds: (ids: string[]) => void;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  clearChat: () => void;
  setMaxActiveModels: (limit: number) => void;
  markModelFailed: (modelId: string, reason: string) => void;
  clearModelFailed: (modelId: string) => void;
  initializeModels: (models: Model[]) => void;
  temperature: TemperaturePreset;
  sessions: DebateSession[];
  currentSessionId: string | null;
  webSearchEnabled: boolean;
  setTemperature: (preset: TemperaturePreset) => void;
  setWebSearch: (enabled: boolean) => void;
  saveCurrentSession: () => void;
  loadSession: (id: string) => void;
  deleteSession: (id: string) => void;
  newDebate: () => void;
}
