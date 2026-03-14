"use client";

import { useChatStore } from "@/store/chatStore";

export function ActiveModels() {
  const activeModels = useChatStore((state) => state.activeModels);
  const moderatorId = useChatStore((state) => state.moderatorId);
  const failedModels = useChatStore((state) => state.failedModels);

  if (activeModels.length === 0) {
    return (
      <p className="px-2 text-[13px] text-muted leading-relaxed">
        No agents selected
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5 px-1">
      {activeModels.map((model) => {
        const isFailed = !!failedModels[model.id];

        return (
          <div
            key={model.id}
            className={`flex items-center gap-1.5 pl-2 pr-2.5 py-[3px] rounded-full text-[12px] font-medium ${
              isFailed
                ? "bg-red-500/10 text-red-400/80"
                : "bg-elevated text-foreground/80"
            }`}
            title={isFailed ? `Unavailable: ${failedModels[model.id]}` : undefined}
          >
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: isFailed ? "#ef4444" : model.color }}
            />
            {model.shortName}
            {isFailed && (
              <svg className="w-3 h-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
              </svg>
            )}
            {!isFailed && model.id === moderatorId && (
              <span className="text-[9px] text-amber-400" title="Moderator">&#9733;</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
