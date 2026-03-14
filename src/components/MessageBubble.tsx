"use client";

import React from "react";
import { Message, Model } from "@/types/chat";
import { useChatStore } from "@/store/chatStore";
import { messageToMarkdown } from "@/lib/exportChat";
import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Process React children and replace @mentions with colored spans.
 * Matches @shortName against known models and colors them accordingly.
 */
function highlightMentions(
  children: React.ReactNode,
  models: Model[],
  inUserBubble = false
): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child !== "string") return child;

    const mentionRegex = /@(\w[\w.-]*)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = mentionRegex.exec(child)) !== null) {
      if (match.index > lastIndex) {
        parts.push(child.slice(lastIndex, match.index));
      }

      const mentionName = match[1];
      const mentionedModel = models.find(
        (m) => m.shortName.toLowerCase() === mentionName.toLowerCase()
      );

      if (mentionedModel) {
        parts.push(
          <span
            key={match.index}
            className="font-semibold"
            style={{ color: inUserBubble ? "white" : mentionedModel.color }}
          >
            {inUserBubble && (
              <span
                className="inline-block w-1.5 h-1.5 rounded-full mr-0.5 align-middle"
                style={{ backgroundColor: mentionedModel.color }}
              />
            )}
            @{mentionedModel.shortName}
          </span>
        );
      } else if (mentionName.toLowerCase() === "user") {
        parts.push(
          <span key={match.index} className="font-semibold underline underline-offset-2">
            @User
          </span>
        );
      } else {
        parts.push(match[0]);
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < child.length) {
      parts.push(child.slice(lastIndex));
    }

    return parts.length > 0 ? <>{parts}</> : child;
  });
}

const COLLAPSE_THRESHOLD = 300; // pixels

interface Props {
  message: Message;
}

export function MessageBubble({ message }: Props) {
  const activeModels = useChatStore((state) => state.activeModels);
  const availableModels = useChatStore((state) => state.availableModels);
  const fontSize = useChatStore((state) => state.fontSize);
  const moderatorId = useChatStore((state) => state.moderatorId);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const isUser = message.role === "user";
  const allModels = [...activeModels, ...availableModels];
  const model = allModels.find((m) => m.id === message.modelId);
  // Deduplicate models for mention highlighting
  const uniqueModels = allModels.filter(
    (m, i, arr) => arr.findIndex((a) => a.id === m.id) === i
  );

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

  // Check if content is long enough to collapse (rough heuristic: >500 chars)
  const isLongMessage = message.content.length > 600 && !message.isStreaming;

  // User messages — plain text
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
              {highlightMentions(message.content, uniqueModels, true)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // AI messages — full Markdown rendering with collapse
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
            {message.modelId === moderatorId && (
              <span className="text-[9px] text-amber-400" title="Moderator">&#9733; mod</span>
            )}
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

          <div
            className={`bg-surface-light rounded-[20px] rounded-tl-md px-4 py-2.5 border border-separator relative ${
              isLongMessage ? "cursor-pointer" : ""
            }`}
            onClick={() => { if (isLongMessage) setExpanded(!expanded); }}
          >
            <div
              ref={contentRef}
              className={`markdown-body leading-[1.6] text-foreground transition-all duration-200 ${
                isLongMessage && !expanded ? "overflow-hidden" : ""
              }`}
              style={{
                fontSize: `${fontSize}px`,
                maxHeight: isLongMessage && !expanded ? `${COLLAPSE_THRESHOLD}px` : undefined,
              }}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0">{highlightMentions(children, uniqueModels)}</p>,
                  strong: ({ children }) => <strong className="font-semibold">{highlightMentions(children, uniqueModels)}</strong>,
                  em: ({ children }) => <em className="italic">{highlightMentions(children, uniqueModels)}</em>,
                  h1: ({ children }) => <h1 className="text-[1.3em] font-bold mb-2 mt-3 first:mt-0">{highlightMentions(children, uniqueModels)}</h1>,
                  h2: ({ children }) => <h2 className="text-[1.15em] font-bold mb-1.5 mt-2.5 first:mt-0">{highlightMentions(children, uniqueModels)}</h2>,
                  h3: ({ children }) => <h3 className="text-[1.05em] font-semibold mb-1 mt-2 first:mt-0">{highlightMentions(children, uniqueModels)}</h3>,
                  ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
                  li: ({ children }) => <li className="leading-[1.5]">{highlightMentions(children, uniqueModels)}</li>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-primary/40 pl-3 my-2 text-foreground/70 italic">
                      {highlightMentions(children, uniqueModels)}
                    </blockquote>
                  ),
                  code: ({ className, children }) => {
                    const isBlock = className?.includes("language-");
                    if (isBlock) {
                      return (
                        <code className="block bg-background rounded-lg px-3 py-2 my-2 text-[0.88em] font-mono overflow-x-auto whitespace-pre">
                          {children}
                        </code>
                      );
                    }
                    return (
                      <code className="bg-elevated px-1.5 py-0.5 rounded text-[0.88em] font-mono">
                        {children}
                      </code>
                    );
                  },
                  pre: ({ children }) => <pre className="my-1">{children}</pre>,
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2 hover:text-accent/80" onClick={(e) => e.stopPropagation()}>
                      {children}
                    </a>
                  ),
                  hr: () => <hr className="border-separator my-3" />,
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-2">
                      <table className="min-w-full text-[0.9em]">{children}</table>
                    </div>
                  ),
                  th: ({ children }) => <th className="border border-separator px-2 py-1 font-semibold text-left bg-elevated">{highlightMentions(children, uniqueModels)}</th>,
                  td: ({ children }) => <td className="border border-separator px-2 py-1">{highlightMentions(children, uniqueModels)}</td>,
                }}
              >
                {message.content}
              </ReactMarkdown>
              {message.isStreaming && (
                <span className="inline-block w-[2px] h-[1.1em] bg-foreground/50 animate-blink ml-0.5 align-text-bottom" />
              )}
            </div>

            {/* Gradient fade when collapsed */}
            {isLongMessage && !expanded && (
              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-surface-light to-transparent rounded-b-[20px] pointer-events-none" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
