"use client";

import { useState, useRef, useEffect } from "react";

interface Props {
  onSend: (message: string) => void;
  onStop: () => void;
  disabled?: boolean;
  isGenerating?: boolean;
}

export function ChatInput({ onSend, onStop, disabled, isGenerating }: Props) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        150
      )}px`;
    }
  }, [input]);

  const handleSubmit = () => {
    if (input.trim() && !disabled) {
      onSend(input.trim());
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="px-5 pb-5 pt-2">
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            disabled
              ? "Select agents to begin..."
              : "Message... (use @Model to mention)"
          }
          disabled={disabled}
          rows={1}
          className="w-full bg-surface-light rounded-[14px] border border-separator pl-4 pr-24 py-[10px] text-[15px] leading-[1.5] resize-none focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 disabled:opacity-30 disabled:cursor-not-allowed placeholder:text-muted transition-all duration-150"
        />
        <div className="absolute right-2 bottom-[6px] flex items-center gap-1.5">
          {isGenerating && (
            <button
              onClick={onStop}
              title="Stop generation"
              className="w-[32px] h-[32px] flex items-center justify-center rounded-full bg-surface-hover text-muted hover:text-foreground transition-colors duration-150"
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
            className="w-[32px] h-[32px] flex items-center justify-center rounded-full bg-primary text-white transition-all duration-150 disabled:opacity-20 disabled:cursor-not-allowed hover:bg-primary-hover active:scale-95"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
            </svg>
          </button>
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
