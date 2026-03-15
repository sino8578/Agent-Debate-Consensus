"use client";

import React from "react";
import { Message, Model } from "@/types/chat";
import { useChatStore } from "@/store/chatStore";
import { messageToMarkdown } from "@/lib/exportChat";
import { getThinkingStyleLabel } from "@/lib/conversationEngine";
import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

/**
 * Sanitization schema based on GitHub's defaults (allows br, table, a, img, etc.).
 * Adds <mark> for highlighted text. Blocks <script>, <iframe>, <style>, <object>,
 * <embed>, <form>, and all event handler attributes.
 */
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "mark"],
};

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
          inUserBubble ? (
            <span
              key={match.index}
              className="inline-flex items-center font-semibold px-1.5 py-0.5 rounded-md text-white text-[0.9em]"
              style={{ backgroundColor: `${mentionedModel.color}80` }}
            >
              @{mentionedModel.shortName}
            </span>
          ) : (
            <span
              key={match.index}
              className="font-semibold"
              style={{ color: mentionedModel.color }}
            >
              @{mentionedModel.shortName}
            </span>
          )
        );
      } else if (mentionName.toLowerCase() === "user") {
        parts.push(
          <span key={match.index} className="font-semibold underline underline-offset-2">
            @User
          </span>
        );
      } else if (mentionName.toLowerCase() === "all") {
        parts.push(
          inUserBubble ? (
            <span
              key={match.index}
              className="inline-flex items-center font-semibold px-1.5 py-0.5 rounded-md text-white text-[0.9em] bg-primary/60"
            >
              @ALL
            </span>
          ) : (
            <span key={match.index} className="font-semibold text-primary">
              @ALL
            </span>
          )
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
const FILE_PREVIEW_LINES = 20;

interface Props {
  message: Message;
  onBoost?: (content: string, modelName: string) => void;
}

export function MessageBubble({ message, onBoost }: Props) {
  const activeModels = useChatStore((state) => state.activeModels);
  const availableModels = useChatStore((state) => state.availableModels);
  const fontSize = useChatStore((state) => state.fontSize);
  const moderatorId = useChatStore((state) => state.moderatorId);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [fileExpanded, setFileExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const isUser = message.role === "user";
  const isSummary = message.messageType === "summary";
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

  // System event notifications — centered, muted
  if (message.role === "system") {
    return (
      <div className="flex justify-center my-2 animate-fade-in">
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-light/50 border border-separator/50">
          <svg className="w-3 h-3 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-[12px] text-muted">{message.content}</span>
        </div>
      </div>
    );
  }

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
        <div className="max-w-[85%] md:max-w-[72%]">
          <div className="flex items-center justify-end gap-1.5 mb-1">
            <button
              onClick={handleCopy}
              className="opacity-0 group-hover/msg:opacity-100 touch-visible p-1 rounded-md hover:bg-elevated transition-all duration-150"
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
          <div className="bg-primary text-white rounded-[18px] md:rounded-[20px] rounded-br-md px-3 py-2 md:px-4 md:py-2.5">
            {message.content && (
              <div className="whitespace-pre-wrap leading-[1.6]" style={{ fontSize: `${fontSize}px` }}>
                {highlightMentions(message.content, uniqueModels, true)}
              </div>
            )}
            {message.attachment && (
              <div className={`${message.content ? "mt-2 pt-2 border-t border-white/20" : ""}`}>
                <button
                  onClick={(e) => { e.stopPropagation(); setFileExpanded(!fileExpanded); }}
                  className="flex items-center gap-2 text-[13px] text-white/80 hover:text-white transition-colors w-full"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="truncate">{message.attachment.fileName}</span>
                  <span className="text-[11px] text-white/50 flex-shrink-0">
                    {(message.attachment.size / 1024).toFixed(1)} KB
                  </span>
                  <svg
                    className={`w-3 h-3 flex-shrink-0 transition-transform duration-150 ${fileExpanded ? "rotate-90" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                {fileExpanded && (
                  <pre className="mt-2 p-2 bg-black/20 rounded-lg text-[12px] leading-[1.5] overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap break-words">
                    {message.attachment.content.split("\n").length > FILE_PREVIEW_LINES
                      ? message.attachment.content.split("\n").slice(0, FILE_PREVIEW_LINES).join("\n") + `\n\n... (${message.attachment.content.split("\n").length - FILE_PREVIEW_LINES} more lines)`
                      : message.attachment.content}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // AI messages — full Markdown rendering with collapse
  return (
    <div className={`flex justify-start mb-3 animate-fade-in group/msg ${isSummary ? "mb-4" : ""}`}>
      <div className={`flex gap-2 md:gap-2.5 ${isSummary ? "max-w-[96%] md:max-w-[85%]" : "max-w-[92%] md:max-w-[78%]"}`}>
        <div
          className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center text-white text-[11px] md:text-[12px] font-semibold flex-shrink-0 mt-5 ${
            isSummary ? "ring-2 ring-amber-400/60" : ""
          }`}
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
            {isSummary && (
              <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-400/15 text-amber-400 border border-amber-400/25">
                <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                Summary
              </span>
            )}
            {!isSummary && message.modelId === moderatorId && (
              <span className="text-[9px] text-amber-400" title="Moderator">&#9733; mod</span>
            )}
            {!isSummary && model?.thinkingStyle && (
              <span
                className="text-[9px] font-medium text-muted/60 uppercase tracking-wider"
                title={`Thinking style: ${getThinkingStyleLabel(model.thinkingStyle)}`}
              >
                {getThinkingStyleLabel(model.thinkingStyle)}
              </span>
            )}
            <button
              onClick={handleCopy}
              className="opacity-0 group-hover/msg:opacity-100 touch-visible p-0.5 rounded hover:bg-elevated transition-all duration-150"
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
            {onBoost && (
              <button
                onClick={() => onBoost(message.content, message.modelName ?? "Agent")}
                className="opacity-0 group-hover/msg:opacity-100 touch-visible p-0.5 rounded hover:bg-elevated transition-all duration-150 text-muted/60 hover:text-amber-400"
                title="Develop this idea further"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </button>
            )}
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
            className={`rounded-[18px] md:rounded-[20px] rounded-tl-md px-3 py-2 md:px-4 md:py-2.5 relative ${
              isLongMessage ? "cursor-pointer" : ""
            } ${
              isSummary
                ? "bg-amber-400/[0.04] border-l-[3px] border-l-amber-400/60 border border-amber-400/15"
                : "bg-surface-light border border-separator"
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
                rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
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
              <div className="absolute bottom-0 left-0 right-0 h-16 rounded-b-[20px] pointer-events-none">
                <div className="w-full h-full bg-gradient-to-t from-surface-light to-transparent" />
                {isSummary && (
                  <div className="absolute inset-0 bg-gradient-to-t from-amber-400/[0.04] to-transparent" />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
