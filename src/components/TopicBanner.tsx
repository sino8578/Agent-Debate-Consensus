"use client";

import { useChatStore } from "@/store/chatStore";

export function TopicBanner() {
  const messages = useChatStore((state) => state.messages);

  // Find the first user message (the debate topic)
  const topic = messages.find((m) => m.role === "user");

  if (!topic) return null;

  return (
    <div className="px-5 pt-3 pb-0">
      <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/10">
        <svg className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 4V2m0 2a2 2 0 100 4m0-4a2 2 0 110 4m0 0v14m0-14a2 2 0 100-4m12 4.5V2m0 2a2 2 0 100 4m0-4a2 2 0 110 4m0 0v14" />
        </svg>
        <p className="text-[13px] text-foreground/80 leading-snug line-clamp-2">
          {topic.content}
        </p>
      </div>
    </div>
  );
}
