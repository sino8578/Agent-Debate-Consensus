"use client";

import { useState } from "react";
import { useChatStore } from "@/store/chatStore";
import { ModelDiscoveryModal } from "./ModelDiscoveryModal";
import { ApiKeyPromptModal } from "./ApiKeyPromptModal";
import { availableModels as defaultModels } from "@/lib/models";

export function ModelSelector() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [keyPromptOpen, setKeyPromptOpen] = useState(false);
  const [keyPromptModel, setKeyPromptModel] = useState<string | undefined>();

  const availableModels = useChatStore((state) => state.availableModels);
  const activeModels = useChatStore((state) => state.activeModels);
  const toggleModel = useChatStore((state) => state.toggleModel);
  const removeModel = useChatStore((state) => state.removeModel);
  const moderatorId = useChatStore((state) => state.moderatorId);
  const setModerator = useChatStore((state) => state.setModerator);
  const failedModels = useChatStore((state) => state.failedModels);
  const clearModelFailed = useChatStore((state) => state.clearModelFailed);
  const maxActiveModels = useChatStore((state) => state.maxActiveModels);
  const appMode = useChatStore((state) => state.appMode);
  const hasServerKey = useChatStore((state) => state.hasServerKey);
  const apiKey = useChatStore((state) => state.apiKey);
  const freeModelIds = useChatStore((state) => state.freeModelIds);

  const isPublicMode = appMode === "public" && hasServerKey;
  const userHasKey = !!apiKey;

  const isAtLimit = activeModels.length >= maxActiveModels;

  const activeIds = new Set(activeModels.map((m) => m.id));
  const sortedModels = [...availableModels].sort((a, b) => {
    const aActive = activeIds.has(a.id) ? 0 : 1;
    const bActive = activeIds.has(b.id) ? 0 : 1;
    return aActive - bActive;
  });

  const isModelFree = (modelId: string) => {
    // If we have the free model list, use it as source of truth
    if (freeModelIds.length > 0) {
      return freeModelIds.includes(modelId);
    }
    // Fallback to pricing field if available
    const model = availableModels.find((m) => m.id === modelId);
    if (model?.pricing) {
      return (
        parseFloat(model.pricing.prompt) === 0 &&
        parseFloat(model.pricing.completion) === 0
      );
    }
    return false;
  };

  return (
    <div>
      <div className="flex items-center justify-between px-2 mb-2">
        <h3 className="text-[12px] font-medium text-muted uppercase tracking-[0.05em]">
          Agents
        </h3>
        <span className={`text-[10px] font-medium ${isAtLimit ? "text-amber-400" : "text-muted/60"}`}>
          {activeModels.length}/{maxActiveModels}
        </span>
        <button
          onClick={() => setIsModalOpen(true)}
          className="w-6 h-6 flex items-center justify-center rounded-md text-muted hover:text-foreground hover:bg-elevated transition-colors duration-150 text-[16px] leading-none"
          title="Discover more agents"
        >
          +
        </button>
      </div>

      <div className="space-y-px">
        {sortedModels.map((model, index) => {
          const isActive = activeIds.has(model.id);
          const nextModel = sortedModels[index + 1];
          const showSeparator = isActive && nextModel && !activeIds.has(nextModel.id);
          const isDefault = defaultModels.some((m) => m.id === model.id);
          const isModerator = model.id === moderatorId;
          const isFailed = !!failedModels[model.id];
          const failReason = failedModels[model.id];
          const isDisabledByLimit = !isActive && isAtLimit;
          const isFree = isModelFree(model.id);
          const isPaidBlocked = isPublicMode && !userHasKey && !isFree;

          return (
            <div key={model.id} className="group relative">
              <button
                onClick={() => {
                  if (isDisabledByLimit) return;
                  // In public mode without user key, block paid models
                  if (isPaidBlocked && !isActive) {
                    setKeyPromptModel(model.name);
                    setKeyPromptOpen(true);
                    return;
                  }
                  if (isFailed) {
                    clearModelFailed(model.id);
                  }
                  toggleModel(model.id);
                }}
                className={`w-full flex items-center gap-2.5 px-2 py-[7px] rounded-lg text-left transition-all duration-150 ${
                  isActive
                    ? isFailed ? "bg-red-500/10" : "bg-elevated"
                    : isDisabledByLimit || isPaidBlocked ? "opacity-40 cursor-not-allowed" : "hover:bg-elevated"
                }`}
              >
                <div
                  className={`w-2 h-2 rounded-full flex-shrink-0 transition-all duration-150 ${
                    isActive ? "opacity-100" : "opacity-40"
                  }`}
                  style={{ backgroundColor: isFailed ? "#ef4444" : model.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className={`text-[14px] font-normal truncate leading-tight flex items-center gap-1.5 ${
                    isFailed ? "text-red-400/80" : "text-foreground/90"
                  }`}>
                    <span className="truncate">{model.name}</span>
                    {isPublicMode && !userHasKey && (
                      isFree ? (
                        <span className="text-[9px] px-1 py-[0.5px] rounded bg-green-500/15 text-green-400 font-semibold uppercase tracking-wide flex-shrink-0">
                          free
                        </span>
                      ) : (
                        <span className="text-[9px] px-1 py-[0.5px] rounded bg-amber-500/15 text-amber-400 font-semibold uppercase tracking-wide flex-shrink-0">
                          paid
                        </span>
                      )
                    )}
                    {/* Show free badge in non-public mode based on pricing */}
                    {(!isPublicMode || userHasKey) && model.pricing && parseFloat(model.pricing.prompt) === 0 && parseFloat(model.pricing.completion) === 0 && (
                      <span className="text-[9px] px-1 py-[0.5px] rounded bg-green-500/15 text-green-400 font-semibold uppercase tracking-wide flex-shrink-0">
                        free
                      </span>
                    )}
                  </div>
                </div>
                {isFailed && (
                  <div className="relative flex-shrink-0 group/fail">
                    <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    {/* Tooltip */}
                    <div className="absolute right-0 bottom-full mb-1.5 w-48 px-2.5 py-1.5 rounded-lg bg-background border border-separator text-[11px] text-muted leading-snug opacity-0 pointer-events-none group-hover/fail:opacity-100 transition-opacity duration-150 z-20 shadow-lg">
                      <span className="text-red-400 font-medium">Unavailable</span>
                      {failReason && (
                        <p className="mt-0.5 text-muted/80 break-words">{failReason}</p>
                      )}
                    </div>
                  </div>
                )}
                {isPaidBlocked && !isActive && (
                  <svg className="w-3.5 h-3.5 text-muted/40 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                )}
                {isModerator && !isFailed && (
                  <span className="text-[10px] text-amber-400 flex-shrink-0" title="Moderator">
                    &#9733;
                  </span>
                )}
                {isActive && !isModerator && !isFailed && (
                  <div className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                )}
              </button>

              {/* Moderator toggle — visible on hover for active non-failed models */}
              {isActive && !isFailed && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setModerator(isModerator ? null : model.id);
                  }}
                  className={`absolute right-7 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-md text-[10px] transition-all duration-150 ${
                    isModerator
                      ? "text-amber-400 opacity-100"
                      : "text-muted hover:text-amber-400 opacity-0 group-hover:opacity-100"
                  }`}
                  title={isModerator ? "Remove as debate moderator (you will moderate)" : "Set as debate moderator"}
                >
                  &#9733;
                </button>
              )}

              {/* Retry button for failed models */}
              {isFailed && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clearModelFailed(model.id);
                  }}
                  className="absolute right-7 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-md text-[11px] text-muted hover:text-foreground opacity-0 group-hover:opacity-100 transition-all duration-150"
                  title="Retry — clear error"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              )}

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
              {showSeparator && (
                <div className="h-px bg-separator mx-2 my-1.5" />
              )}
            </div>
          );
        })}
      </div>

      {isAtLimit && (
        <div className="mt-2 px-2 text-[11px] text-amber-400/80 leading-snug">
          Limit reached — deactivate an agent to add another
        </div>
      )}

      <ModelDiscoveryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
      <ApiKeyPromptModal
        isOpen={keyPromptOpen}
        onClose={() => setKeyPromptOpen(false)}
        reason="paid-model"
        modelName={keyPromptModel}
      />
    </div>
  );
}
