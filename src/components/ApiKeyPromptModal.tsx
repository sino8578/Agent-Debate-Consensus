"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useChatStore } from "@/store/chatStore";

interface ApiKeyPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason: "paid-model" | "web-search";
  modelName?: string;
}

export function ApiKeyPromptModal({
  isOpen,
  onClose,
  reason,
  modelName,
}: ApiKeyPromptModalProps) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [validating, setValidating] = useState(false);
  const setApiKey = useChatStore((state) => state.setApiKey);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setKey("");
      setError("");
      setValidating(false);
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    const trimmed = key.trim();
    if (!trimmed) return;

    setValidating(true);
    setError("");

    try {
      const res = await fetch("/api/models", {
        headers: { "x-api-key": trimmed },
      });

      if (!res.ok) {
        setError("Invalid API key. Please check and try again.");
        setValidating(false);
        return;
      }

      setApiKey(trimmed);
      onClose();
    } catch {
      setError("Failed to validate key. Please try again.");
      setValidating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!isOpen) return null;

  const title =
    reason === "paid-model" ? "API Key Required" : "API Key Required";

  const description =
    reason === "paid-model"
      ? `${modelName || "This model"} is a paid model. Enter your OpenRouter API key to unlock paid models, web search, and unlimited access.`
      : "Web search requires an API key. Enter your OpenRouter key to enable web search, paid models, and unlimited access.";

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface border border-separator w-full max-w-[440px] rounded-2xl shadow-2xl shadow-black/30 overflow-hidden animate-modal-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-separator">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <svg
                className="w-4 h-4 text-primary"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
            </div>
            <h2 className="text-[16px] font-semibold tracking-[-0.01em]">
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-elevated transition-colors duration-150"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <p className="text-[14px] text-muted leading-relaxed">
            {description}
          </p>

          <div className="space-y-2">
            <input
              type="password"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setError("");
              }}
              onKeyDown={handleKeyDown}
              placeholder="sk-or-v1-..."
              autoFocus
              className="w-full bg-surface-light rounded-xl border border-separator px-4 py-3 text-[15px] focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 placeholder:text-muted/50 transition-all duration-150 font-mono"
            />
            {error && <p className="text-[13px] text-red-400">{error}</p>}
          </div>

          <button
            onClick={handleSubmit}
            disabled={!key.trim() || validating}
            className="w-full h-10 rounded-xl bg-primary text-white text-[14px] font-medium transition-all duration-150 hover:bg-primary-hover active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {validating ? "Validating..." : "Connect"}
          </button>

          {/* Privacy + link */}
          <div className="flex items-start gap-2">
            <svg
              className="w-3.5 h-3.5 text-muted flex-shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <p className="text-[12px] text-muted leading-relaxed">
              Your key is stored only in your browser session. Closing the tab
              erases it.{" "}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Get an API key
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
