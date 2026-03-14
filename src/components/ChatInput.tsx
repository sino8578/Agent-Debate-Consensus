"use client";

import { useState, useRef, useEffect } from "react";
import { useChatStore } from "@/store/chatStore";
import { Model, FileAttachment } from "@/types/chat";
import { ApiKeyPromptModal } from "./ApiKeyPromptModal";

const MAX_FILE_SIZE = 100 * 1024; // 100 KB
const ALLOWED_EXTENSIONS = [
  ".txt", ".md",
  ".csv", ".json", ".xml",
  ".html", ".css",
  ".js", ".ts", ".jsx", ".tsx",
  ".py", ".rb", ".go", ".rs", ".java", ".kt",
  ".yaml", ".yml", ".toml", ".ini", ".env",
  ".sh", ".bash", ".zsh", ".bat", ".cmd", ".ps1",
  ".sql", ".graphql",
  ".log", ".conf", ".cfg",
  ".svg",
];

interface Props {
  onSend: (message: string, attachment?: FileAttachment) => void;
  onStop: () => void;
  disabled?: boolean;
  isGenerating?: boolean;
}

export function ChatInput({ onSend, onStop, disabled, isGenerating }: Props) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);

  // Mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);

  const [pendingFile, setPendingFile] = useState<FileAttachment | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [keyPromptOpen, setKeyPromptOpen] = useState(false);

  const { activeModels, availableModels, webSearchEnabled, setWebSearch } = useChatStore();
  const appMode = useChatStore((state) => state.appMode);
  const hasServerKey = useChatStore((state) => state.hasServerKey);
  const apiKey = useChatStore((state) => state.apiKey);
  const isPublicMode = appMode === "public" && hasServerKey;
  const userHasKey = !!apiKey;
  const webSearchBlocked = isPublicMode && !userHasKey;

  const allModels: Model[] = [
    ...activeModels,
    ...availableModels,
  ].filter((m, i, arr) => arr.findIndex((a) => a.id === m.id) === i);

  const filteredModels = allModels
    .filter((m) => {
      if (!mentionQuery) return true;
      const q = mentionQuery.toLowerCase();
      return (
        m.shortName.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q)
      );
    })
    .slice(0, 5);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        150
      )}px`;
    }
  }, [input]);

  // Detect @mention at cursor position
  const detectMention = (value: string, cursorPos: number) => {
    const textBeforeCursor = value.slice(0, cursorPos);
    const match = textBeforeCursor.match(/@(\w*)$/);
    if (match) {
      setMentionOpen(true);
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionOpen(false);
      setMentionQuery("");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);
    detectMention(value, e.target.selectionStart ?? value.length);
  };

  const selectMention = (model: Model) => {
    if (!textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart ?? input.length;
    const textBeforeCursor = input.slice(0, cursorPos);
    const textAfterCursor = input.slice(cursorPos);

    // Replace @query with @shortName + space
    const newBefore = textBeforeCursor.replace(/@(\w*)$/, `@${model.shortName} `);
    const newValue = newBefore + textAfterCursor;
    setInput(newValue);
    setMentionOpen(false);
    setMentionQuery("");

    // Restore focus and move cursor after the inserted mention
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const newCursor = newBefore.length;
        textareaRef.current.setSelectionRange(newCursor, newCursor);
      }
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setFileError(`Only ${ALLOWED_EXTENSIONS.join(", ")} files are supported`);
      e.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setFileError(`File too large (${(file.size / 1024).toFixed(0)} KB). Max ${MAX_FILE_SIZE / 1024} KB`);
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      setPendingFile({
        fileName: file.name,
        fileType: ext.replace(".", ""),
        content,
        size: file.size,
        truncated: false,
      });
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const removePendingFile = () => {
    setPendingFile(null);
    setFileError(null);
  };

  const handleSubmit = () => {
    if ((input.trim() || pendingFile) && !disabled) {
      onSend(input.trim(), pendingFile ?? undefined);
      setInput("");
      setPendingFile(null);
      setFileError(null);
      setMentionOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && filteredModels.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => (i + 1) % filteredModels.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => (i - 1 + filteredModels.length) % filteredModels.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectMention(filteredModels[mentionIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionOpen(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="px-5 pb-5 pt-2">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_EXTENSIONS.join(",")}
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Pending file preview */}
      {pendingFile && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-surface-light border border-separator rounded-xl">
          <svg className="w-4 h-4 text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-[13px] text-foreground truncate flex-1">{pendingFile.fileName}</span>
          <span className="text-[11px] text-muted">{(pendingFile.size / 1024).toFixed(1)} KB</span>
          <button
            onClick={removePendingFile}
            className="w-5 h-5 flex items-center justify-center rounded-full text-muted hover:text-foreground hover:bg-elevated transition-colors duration-150"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* File error */}
      {fileError && (
        <div className="flex items-center gap-1.5 mb-2 px-3 py-1.5 text-[12px] text-red-400">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          {fileError}
        </div>
      )}

      <div className="relative">
        {/* Mention dropdown — appears above the input */}
        {mentionOpen && filteredModels.length > 0 && (
          <div className="absolute bottom-full mb-1 left-0 right-0 bg-surface-light border border-separator rounded-lg shadow-lg z-50 overflow-hidden">
            {filteredModels.map((model, idx) => (
              <div
                key={model.id}
                onMouseDown={(e) => {
                  // Use mousedown so blur on textarea doesn't close before click
                  e.preventDefault();
                  selectMention(model);
                }}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${
                  idx === mentionIndex ? "bg-elevated" : "hover:bg-elevated"
                }`}
              >
                {/* Color dot */}
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: model.color }}
                />
                <span className="text-[14px] text-foreground">{model.name}</span>
                <span className="text-[12px] text-muted ml-1">@{model.shortName}</span>
              </div>
            ))}
          </div>
        )}

        <div
          className={`flex items-end gap-2 bg-surface-light rounded-[14px] border px-3 py-2 transition-all duration-150 ${
            focused
              ? "border-primary/40 ring-1 ring-primary/20"
              : "border-separator"
          } ${disabled ? "opacity-30 cursor-not-allowed" : ""}`}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={
              disabled
                ? "Select agents to begin..."
                : "Message... (use @Model to mention)"
            }
            disabled={disabled}
            rows={1}
            className="flex-1 bg-transparent text-[15px] leading-[1.5] resize-none focus:outline-none disabled:cursor-not-allowed placeholder:text-muted py-0.5"
          />

          <div className="flex items-center gap-1.5 flex-shrink-0 pb-0.5">
            {/* File attach button */}
            <div className="relative group">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled}
                className="w-[30px] h-[30px] flex items-center justify-center rounded-full text-muted/40 hover:text-muted hover:bg-surface-hover transition-all duration-200 disabled:opacity-20 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>
              <div className="absolute bottom-full right-0 mb-2 px-2.5 py-1.5 rounded-lg bg-surface-light border border-separator shadow-lg text-[12px] leading-[1.4] text-foreground whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150">
                <span className="font-medium">Attach file</span>
                <span className="text-muted"> — txt, md, csv, json, code (max 100 KB)</span>
                <div className="absolute top-full right-3 w-2 h-2 bg-surface-light border-r border-b border-separator rotate-45 -mt-1" />
              </div>
            </div>

            <div className="relative group">
              <button
                onClick={() => {
                  if (webSearchBlocked) {
                    setKeyPromptOpen(true);
                    return;
                  }
                  setWebSearch(!webSearchEnabled);
                }}
                className={`w-[30px] h-[30px] flex items-center justify-center rounded-full transition-all duration-200 ${
                  webSearchEnabled
                    ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                    : "text-muted/40 hover:text-muted hover:bg-surface-hover"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  {!webSearchEnabled && (
                    <line x1="4" y1="4" x2="20" y2="20" strokeWidth={2} strokeLinecap="round" />
                  )}
                </svg>
              </button>
              <div className="absolute bottom-full right-0 mb-2 px-2.5 py-1.5 rounded-lg bg-surface-light border border-separator shadow-lg text-[12px] leading-[1.4] text-foreground whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150">
                {webSearchBlocked ? (
                  <>
                    <span className="font-medium">Web search</span>
                    <span className="text-muted"> — requires API key</span>
                  </>
                ) : webSearchEnabled ? (
                  <>
                    <span className="text-primary font-medium">Web search ON</span>
                    <span className="text-muted"> — models use live internet data</span>
                  </>
                ) : (
                  <>
                    <span className="font-medium">Web search OFF</span>
                    <span className="text-muted"> — click to enable</span>
                  </>
                )}
                <div className="absolute top-full right-3 w-2 h-2 bg-surface-light border-r border-b border-separator rotate-45 -mt-1" />
              </div>
            </div>
            {isGenerating && (
              <button
                onClick={onStop}
                title="Stop generation"
                className="w-[30px] h-[30px] flex items-center justify-center rounded-full bg-surface-hover text-muted hover:text-foreground transition-colors duration-150"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              </button>
            )}
            <button
              onClick={handleSubmit}
              disabled={(!input.trim() && !pendingFile) || disabled}
              title="Send message"
              className="w-[30px] h-[30px] flex items-center justify-center rounded-full bg-primary text-white transition-all duration-150 disabled:opacity-20 disabled:cursor-not-allowed hover:bg-primary-hover active:scale-95"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {isGenerating && (
        <p className="text-[12px] text-muted mt-2 ml-1">
          Agents debating — you can intervene at any time
        </p>
      )}

      <ApiKeyPromptModal
        isOpen={keyPromptOpen}
        onClose={() => setKeyPromptOpen(false)}
        reason="web-search"
      />
    </div>
  );
}
