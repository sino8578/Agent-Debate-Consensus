"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useChatStore } from "@/store/chatStore";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { TopicBanner } from "./TopicBanner";

interface Props {
  onBoost?: (content: string, modelName: string) => void;
}

export function MessageList({ onBoost }: Props) {
  const messages = useChatStore((state) => state.messages);
  const typingModels = useChatStore((state) => state.typingModels);
  const activeModels = useChatStore((state) => state.activeModels);
  // Shared props lifted here so MessageBubble (React.memo) can skip re-renders
  // during streaming — these rarely change compared to message updates.
  const availableModels = useChatStore((state) => state.availableModels);
  const fontSize = useChatStore((state) => state.fontSize);
  const moderatorId = useChatStore((state) => state.moderatorId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const checkIfAtBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    // Consider "at bottom" if within 80px of the end
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Track scroll position
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const handleScroll = () => {
      setIsAtBottom(checkIfAtBottom());
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [checkIfAtBottom]);

  // Auto-scroll only when user is at bottom
  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, typingModels, isAtBottom]);

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-3 py-3 md:px-5 md:py-5 relative">
      {messages.length === 0 ? (
        activeModels.length === 0 ? (
          /* No agents active — primary onboarding state */
          <div className="min-h-full flex items-center justify-center py-8 animate-fade-in">
            <div className="text-center max-w-[360px]">
              {/* Service intro */}
              <p className="text-[20px] font-bold tracking-[-0.02em] text-foreground mb-2">
                Agent Debate
              </p>
              <p className="text-[13px] text-muted leading-relaxed mb-4">
                Pick 2–5 AI models, pose a question, and watch them argue their perspectives in real time.
                You moderate, steer the discussion, and drive toward consensus.
              </p>

              {/* How it works — 2×2 process cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5 text-left">
                {[
                  {
                    step: "01",
                    color: "#bf5af2",
                    title: "Pick Agents",
                    desc: "Choose 2–5 AI models from the sidebar",
                    icon: (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                      </svg>
                    ),
                  },
                  {
                    step: "02",
                    color: "#0a84ff",
                    title: "Pose a Question",
                    desc: "Any topic, problem, or hypothesis",
                    icon: (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                      </svg>
                    ),
                  },
                  {
                    step: "03",
                    color: "#30d158",
                    title: "Watch the Debate",
                    desc: "Models respond and argue in real time",
                    icon: (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" />
                      </svg>
                    ),
                  },
                  {
                    step: "04",
                    color: "#ff9f0a",
                    title: "Steer Consensus",
                    desc: "@mention models, boost arguments",
                    icon: (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
                      </svg>
                    ),
                  },
                ].map(({ step, color, title, desc, icon }) => (
                  <div
                    key={step}
                    className="relative overflow-hidden rounded-xl border border-separator p-3"
                    style={{ backgroundColor: `${color}0d` }}
                  >
                    <span
                      className="absolute top-2 right-2.5 text-[10px] font-mono font-medium opacity-40"
                      style={{ color }}
                    >
                      {step}
                    </span>
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center mb-2"
                      style={{ backgroundColor: `${color}25`, color }}
                    >
                      {icon}
                    </div>
                    <p className="text-[12px] font-semibold text-foreground/90 mb-0.5">{title}</p>
                    <p className="text-[11px] text-muted leading-snug">{desc}</p>
                  </div>
                ))}
              </div>

              {/* Who it's for */}
              <div className="flex flex-wrap justify-center gap-1.5 mb-6">
                {["Researchers", "Developers", "Students", "Curious minds"].map((label) => (
                  <span
                    key={label}
                    className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-elevated text-muted border border-separator"
                  >
                    {label}
                  </span>
                ))}
              </div>

              <div className="border-t border-separator mb-6" />

              {/* Arrow pointing left toward sidebar */}
              <div className="flex items-center justify-center mb-4 gap-3">
                <div className="relative flex items-center">
                  {/* Animated arrow */}
                  <svg
                    className="w-5 h-5 text-primary/60"
                    style={{ animation: "nudge-left 1.8s ease-in-out infinite" }}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                  </svg>
                </div>
                {/* Stacked agent dots — pulsing */}
                <div className="flex items-center gap-1">
                  {["#bf5af2", "#0a84ff", "#30d158", "#ff9f0a"].map((color, i) => (
                    <div
                      key={i}
                      className="w-2.5 h-2.5 rounded-full opacity-30"
                      style={{
                        backgroundColor: color,
                        animation: `pulse-dot 2s ease-in-out infinite`,
                        animationDelay: `${i * 0.2}s`,
                      }}
                    />
                  ))}
                </div>
              </div>

              <h2 className="text-[15px] font-semibold text-foreground/80 mb-2 tracking-[-0.01em]">
                Activate agents to begin
              </h2>
              <p className="text-[13px] text-muted leading-relaxed">
                <span className="md:hidden">Tap the menu button (☰) to open the sidebar and activate agents.</span>
                <span className="hidden md:inline">Click any agent in the sidebar to add it to the debate. You need at least one.</span>
              </p>
            </div>
          </div>
        ) : (
          /* Agents ready, no messages yet */
          <div className="h-full flex items-center justify-center animate-fade-in">
            <div className="text-center max-w-[300px]">
              <div className="mx-auto mb-4 w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                <svg className="w-6 h-6 text-primary/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
              </div>
              <h2 className="text-[16px] font-semibold text-foreground/80 mb-1.5 tracking-[-0.01em]">Start a Debate</h2>
              <p className="text-[14px] text-muted leading-relaxed">
                Pose a question or topic below to begin.
              </p>
            </div>
          </div>
        )
      ) : (
        <>
          <TopicBanner />
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              activeModels={activeModels}
              availableModels={availableModels}
              fontSize={fontSize}
              moderatorId={moderatorId}
              onBoost={onBoost}
            />
          ))}
        </>
      )}
      <TypingIndicator />
      <div ref={bottomRef} />

      {/* Scroll to bottom button */}
      {!isAtBottom && messages.length > 0 && (
        <button
          onClick={() => {
            scrollToBottom();
            setIsAtBottom(true);
          }}
          className="sticky bottom-4 left-1/2 -translate-x-1/2 float-right mr-4 w-9 h-9 flex items-center justify-center rounded-full bg-surface border border-separator shadow-lg shadow-black/20 text-muted hover:text-foreground hover:bg-surface-light transition-all duration-150 animate-fade-in"
          title="Scroll to bottom"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      )}
    </div>
  );
}
