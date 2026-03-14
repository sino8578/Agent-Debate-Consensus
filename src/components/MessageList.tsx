"use client";

import { useEffect, useRef } from "react";
import { useChatStore } from "@/store/chatStore";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";

export function MessageList() {
  const messages = useChatStore((state) => state.messages);
  const typingModels = useChatStore((state) => state.typingModels);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingModels]);

  return (
    <div className="flex-1 overflow-y-auto px-5 py-5">
      {messages.length === 0 ? (
        <div className="h-full flex items-center justify-center animate-fade-in">
          <div className="text-center max-w-[300px]">
            <div className="mx-auto mb-4 w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <svg className="w-6 h-6 text-primary/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
              </svg>
            </div>
            <h2 className="text-[16px] font-semibold text-foreground/80 mb-1.5 tracking-[-0.01em]">Start a Debate</h2>
            <p className="text-[14px] text-muted leading-relaxed">
              Select agents from the sidebar, then pose a question to begin.
            </p>
          </div>
        </div>
      ) : (
        <>
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </>
      )}
      <TypingIndicator />
      <div ref={bottomRef} />
    </div>
  );
}
