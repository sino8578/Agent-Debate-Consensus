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

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
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

export interface ChatState {
  messages: Message[];
  activeModels: Model[];
  availableModels: Model[];
  typingModels: TypingState[];
  contextWindowSize: number;
  theme: Theme;
  fontSize: number;
  publicMode: boolean | null;
  apiKey: string | null;

  addMessage: (message: Omit<Message, "id" | "timestamp">) => string;
  updateMessage: (id: string, content: string, reasoning?: string) => void;
  completeMessage: (id: string) => void;
  setTyping: (modelId: string, modelName: string, isTyping: boolean) => void;
  toggleModel: (modelId: string) => void;
  addAvailableModel: (model: Model) => void;
  removeModel: (modelId: string) => void;
  setContextWindowSize: (size: number) => void;
  setTheme: (theme: Theme) => void;
  setFontSize: (size: number) => void;
  setPublicMode: (mode: boolean) => void;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  clearChat: () => void;
  initializeModels: (models: Model[]) => void;
}
