"use client";

import { useChatStore } from "@/store/chatStore";

export function TypingIndicator() {
  const typingModels = useChatStore((state) => state.typingModels);
  const activeModels = useChatStore((state) => state.activeModels);

  if (typingModels.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 mb-2 animate-fade-in">
      {typingModels.map((typing) => {
        const model = activeModels.find((m) => m.id === typing.modelId);
        return (
          <div
            key={typing.modelId}
            className="flex items-center gap-2 ml-[42px]"
          >
            <span className="text-[12px] text-muted font-medium">
              {typing.modelName}
            </span>
            <span className="flex items-center gap-[3px]">
              <span
                className="w-[5px] h-[5px] rounded-full animate-bounce-dot"
                style={{ backgroundColor: model?.color ?? "#aeaeb2" }}
              />
              <span
                className="w-[5px] h-[5px] rounded-full animate-bounce-dot-delay-1"
                style={{ backgroundColor: model?.color ?? "#aeaeb2" }}
              />
              <span
                className="w-[5px] h-[5px] rounded-full animate-bounce-dot-delay-2"
                style={{ backgroundColor: model?.color ?? "#aeaeb2" }}
              />
            </span>
          </div>
        );
      })}
    </div>
  );
}
