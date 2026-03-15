"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useChatStore } from "@/store/chatStore";
import { Model } from "@/types/chat";
import { getNextUniqueColor } from "@/lib/models";

interface OpenRouterModel {
  id: string;
  name: string;
  description: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
    request: string;
    image: string;
  };
}

interface ModelDiscoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function getApiKeyHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const key = sessionStorage.getItem("openrouter-api-key");
  return key ? { "x-api-key": key } : {};
}

export function ModelDiscoveryModal({ isOpen, onClose }: ModelDiscoveryModalProps) {
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [freeOnly, setFreeOnly] = useState(false);
  const addAvailableModel = useChatStore((state) => state.addAvailableModel);
  const availableModels = useChatStore((state) => state.availableModels);

  useEffect(() => {
    if (isOpen) {
      fetchModels();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const fetchModels = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/models", {
        headers: getApiKeyHeader(),
      });
      const data = await response.json();
      if (data.data) {
        setModels(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch models:", error);
    } finally {
      setLoading(false);
    }
  };

  const isFreeModel = (m: OpenRouterModel) =>
    parseFloat(m.pricing.prompt) === 0 && parseFloat(m.pricing.completion) === 0;

  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      const matchesSearch =
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.id.toLowerCase().includes(search.toLowerCase());
      const matchesFree = !freeOnly || isFreeModel(m);
      return matchesSearch && matchesFree;
    });
  }, [models, search, freeOnly]);

  const handleAddModel = (orModel: OpenRouterModel) => {
    const provider = orModel.id.split("/")[0];
    const shortName =
      orModel.name.split(" ")[0].split(":")[0].split("/").pop() || "AI";

    const uniqueColor = getNextUniqueColor(availableModels);

    const newModel: Model = {
      id: orModel.id,
      name: orModel.name,
      shortName: shortName,
      provider: provider,
      color: uniqueColor,
      isActive: false,
      pricing: {
        prompt: orModel.pricing.prompt,
        completion: orModel.pricing.completion,
      },
      description: orModel.description,
      context_length: orModel.context_length,
    };

    addAvailableModel(newModel);
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-separator w-full max-w-[560px] max-h-[85vh] md:max-h-[72vh] rounded-t-2xl md:rounded-2xl shadow-2xl shadow-black/30 flex flex-col overflow-hidden animate-modal-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-separator">
          <h2 className="text-[16px] font-semibold tracking-[-0.01em]">Discover Agents</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-elevated transition-colors duration-150"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-3 border-b border-separator space-y-2">
          <input
            type="text"
            placeholder="Search by name or provider..."
            className="w-full bg-surface-light rounded-lg border border-separator px-3.5 py-2 text-[14px] focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 placeholder:text-muted transition-all duration-150"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus={typeof window !== "undefined" && window.innerWidth >= 768}
          />
          <button
            onClick={() => setFreeOnly(!freeOnly)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-all duration-150 cursor-pointer ${
              freeOnly
                ? "bg-green-500/15 text-green-400 border-green-500/30 ring-1 ring-green-500/20"
                : "text-muted border-separator hover:text-foreground hover:border-muted/40 hover:bg-surface-light"
            }`}
          >
            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-all duration-150 ${
              freeOnly
                ? "bg-green-500/25 border-green-500/50"
                : "border-muted/40"
            }`}>
              {freeOnly && (
                <svg className="w-2.5 h-2.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            Free only
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted gap-3">
              <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
              <span className="text-[14px]">Loading agents...</span>
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-[14px] text-muted">
              No results for &ldquo;{search}&rdquo;
            </div>
          ) : (
            filteredModels.map((model) => {
              const isAdded = availableModels.some((m) => m.id === model.id);
              const free = isFreeModel(model);
              const promptPrice = (
                parseFloat(model.pricing.prompt) * 1000000
              ).toFixed(2);
              const completionPrice = (
                parseFloat(model.pricing.completion) * 1000000
              ).toFixed(2);

              return (
                <div
                  key={model.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-elevated transition-colors duration-150"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[14px] font-medium truncate text-foreground/90">
                        {model.name}
                      </span>
                      <span className="text-[11px] px-1.5 py-[1px] rounded bg-elevated text-muted uppercase tracking-wide flex-shrink-0">
                        {model.id.split("/")[0]}
                      </span>
                      {free && (
                        <span className="text-[10px] px-1.5 py-[1px] rounded bg-green-500/15 text-green-400 font-semibold uppercase tracking-wide flex-shrink-0">
                          free
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted font-mono">
                      {free ? (
                        <span className="text-green-400">Free</span>
                      ) : (
                        <>
                          <span>${promptPrice}/1M in</span>
                          <span>${completionPrice}/1M out</span>
                        </>
                      )}
                      <span>{(model.context_length / 1024).toFixed(0)}k ctx</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleAddModel(model)}
                    disabled={isAdded}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors duration-150 ${
                      isAdded
                        ? "text-muted/50 cursor-default"
                        : "bg-primary/15 text-primary hover:bg-primary/25"
                    }`}
                  >
                    {isAdded ? "Added" : "Add"}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="px-5 py-2.5 border-t border-separator text-center">
          <p className="text-[11px] text-muted">
            Powered by OpenRouter
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
