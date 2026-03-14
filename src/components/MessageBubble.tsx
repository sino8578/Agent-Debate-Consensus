"use client";

import { Message } from "@/types/chat";
import { useChatStore } from "@/store/chatStore";
import { messageToMarkdown } from "@/lib/exportChat";
import { useMemo, useState } from "react";

interface Props {
  message: Message;
}

export function MessageBubble({ message }: Props) {
  const activeModels = useChatStore((state) => state.activeModels);
  const availableModels = useChatStore((state) => state.availableModels);
  const fontSize = useChatStore((state) => state.fontSize);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const model = [...activeModels, ...availableModels].find(
    (m) => m.id === message.modelId
  );

  const formattedContent = useMemo(() => {
    const allModels = [...activeModels, ...availableModels];
    const parts: (string | { text: string; color: string })[] = [];

    const mentionRegex = /@(\w+)/g;
    let lastIndex = 0;
    let execResult: RegExpExecArray | null;

    while ((execResult = mentionRegex.exec(message.content)) !== null) {
      const match = execResult;
      if (match.index > lastIndex) {
        parts.push(message.content.slice(lastIndex, match.index));
      }

      const mentionedModel = allModels.find(
        (m) => m.shortName.toLowerCase() === match[1].toLowerCase()
      );

      if (mentionedModel) {
        parts.push({ text: match[0], color: mentionedModel.color });
      } else if (match[1].toLowerCase() === "user") {
        parts.push({ text: match[0], color: "#bf5af2" });
      } else {
        parts.push(match[0]);
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < message.content.length) {
      parts.push(message.content.slice(lastIndex));
    }

    return parts;
  }, [message.content, activeModels, availableModels]);

  const handleCopy = async () => {
    const md = messageToMarkdown(message);
    await navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const avatarLetter = model?.shortName?.[0]?.toUpperCase() ?? "A";

  // Don't render empty messages that finished streaming
  if (!isUser && !message.content && !message.isStreaming) {
    return null;
  }

  if (isUser) {
    return (
      <div className="flex justify-end mb-3 animate-fade-in group/msg">
        <div className="max-w-[72%]">
          <div className="flex items-center justify-end gap-1.5 mb-1">
            <button
              onClick={handleCopy}
              className="opacity-0 group-hover/msg:opacity-100 p-1 rounded-md hover:bg-elevated transition-all duration-150"
              title="Copy as Markdown"
            >
              {copied ? (
                <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
            <span className="text-[12px] text-muted font-medium">You</span>
          </div>
          <div className="bg-primary text-white rounded-[20px] rounded-br-md px-4 py-2.5">
            <div className="whitespace-pre-wrap leading-[1.6]" style={{ fontSize: `${fontSize}px` }}>
              {formattedContent.map((part, i) =>
                typeof part === "string" ? (
                  <span key={i}>{part}</span>
                ) : (
                  <span key={i} className="font-semibold text-white/80">
                    {part.text}
                  </span>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start mb-3 animate-fade-in group/msg">
      <div className="flex gap-2.5 max-w-[78%]">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[12px] font-semibold flex-shrink-0 mt-5"
          style={{ backgroundColor: model?.color ?? "#3a3a3c" }}
        >
          {avatarLetter}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-[12px] font-semibold leading-none"
              style={{ color: model?.color ?? "#98989d" }}
            >
              {message.modelName ?? "Agent"}
            </span>
            <button
              onClick={handleCopy}
              className="opacity-0 group-hover/msg:opacity-100 p-0.5 rounded hover:bg-elevated transition-all duration-150"
              title="Copy as Markdown"
            >
              {copied ? (
                <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-muted/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>

          {message.reasoning && (
            <div className="mb-1.5">
              <button
                onClick={() => setReasoningOpen(!reasoningOpen)}
                className="flex items-center gap-1.5 text-[12px] text-muted hover:text-foreground transition-colors duration-150"
              >
                <svg
                  className={`w-3 h-3 transition-transform duration-150 ${reasoningOpen ? "rotate-90" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                Thinking...
              </button>
              {reasoningOpen && (
                <div className="mt-1.5 ml-4 pl-3 border-l border-separator text-[13px] text-muted italic leading-relaxed">
                  {message.reasoning}
                </div>
              )}
            </div>
          )}

          <div className="bg-surface-light rounded-[20px] rounded-tl-md px-4 py-2.5 border border-separator">
            <div className="whitespace-pre-wrap leading-[1.6] text-foreground" style={{ fontSize: `${fontSize}px` }}>
              {formattedContent.map((part, i) =>
                typeof part === "string" ? (
                  <span key={i}>{part}</span>
                ) : (
                  <span key={i} style={{ color: part.color }} className="font-semibold">
                    {part.text}
                  </span>
                )
              )}
              {message.isStreaming && (
                <span className="inline-block w-[2px] h-[1.1em] bg-foreground/50 animate-blink ml-0.5 align-text-bottom" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
