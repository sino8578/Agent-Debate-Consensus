"use client";

import { useState } from "react";
import { useChatStore } from "@/store/chatStore";
import { ModelDiscoveryModal } from "./ModelDiscoveryModal";
import { availableModels as defaultModels } from "@/lib/models";

export function ModelSelector() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const availableModels = useChatStore((state) => state.availableModels);
  const activeModels = useChatStore((state) => state.activeModels);
  const toggleModel = useChatStore((state) => state.toggleModel);
  const removeModel = useChatStore((state) => state.removeModel);

  return (
    <div>
      <div className="flex items-center justify-between px-2 mb-2">
        <h3 className="text-[12px] font-medium text-muted uppercase tracking-[0.05em]">
          Agents
        </h3>
        <button
          onClick={() => setIsModalOpen(true)}
          className="w-6 h-6 flex items-center justify-center rounded-md text-muted hover:text-foreground hover:bg-elevated transition-colors duration-150 text-[16px] leading-none"
          title="Discover more agents"
        >
          +
        </button>
      </div>

      <div className="space-y-px">
        {availableModels.map((model) => {
          const isActive = activeModels.some((m) => m.id === model.id);
          const isDefault = defaultModels.some((m) => m.id === model.id);

          return (
            <div key={model.id} className="group relative">
              <button
                onClick={() => toggleModel(model.id)}
                className={`w-full flex items-center gap-2.5 px-2 py-[7px] rounded-lg text-left transition-all duration-150 ${
                  isActive
                    ? "bg-elevated"
                    : "hover:bg-elevated"
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 transition-all duration-150 ${
                    isActive ? "opacity-100" : "opacity-40"
                  }`}
                  style={{ backgroundColor: model.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-normal truncate text-foreground/90 leading-tight">
                    {model.name}
                  </div>
                </div>
                {isActive && (
                  <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                )}
              </button>

              {!isDefault && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeModel(model.id);
                  }}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-md text-[11px] text-muted hover:text-foreground hover:bg-elevated opacity-0 group-hover:opacity-100 transition-all duration-150"
                  title="Remove"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>

      <ModelDiscoveryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </div>
  );
}
