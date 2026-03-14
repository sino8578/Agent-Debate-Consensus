"use client";

import { useState, useRef, useEffect } from "react";
import { useChatStore } from "@/store/chatStore";
import { Model } from "@/types/chat";

interface Props {
  onSend: (message: string) => void;
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

  const { activeModels, availableModels } = useChatStore();

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

  const handleSubmit = () => {
    if (input.trim() && !disabled) {
      onSend(input.trim());
      setInput("");
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
              disabled={!input.trim() || disabled}
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
    </div>
  );
}
