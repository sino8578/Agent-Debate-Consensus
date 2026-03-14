"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useChatStore } from "@/store/chatStore";
import { Model } from "@/types/chat";

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

  const filteredModels = useMemo(() => {
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(search.toLowerCase()) ||
        m.id.toLowerCase().includes(search.toLowerCase())
    );
  }, [models, search]);

  const handleAddModel = (orModel: OpenRouterModel) => {
    const provider = orModel.id.split("/")[0];
    const shortName =
      orModel.name.split(" ")[0].split(":")[0].split("/").pop() || "AI";

    const colors = ["#ff6482", "#32d583", "#fbbf24", "#60a5fa", "#a78bfa", "#34d399"];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newModel: Model = {
      id: orModel.id,
      name: orModel.name,
      shortName: shortName,
      provider: provider,
      color: randomColor,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface border border-separator w-full max-w-[560px] max-h-[72vh] rounded-2xl shadow-2xl shadow-black/30 flex flex-col overflow-hidden animate-modal-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-separator">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Discover Agents</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-elevated transition-colors duration-150"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-3 border-b border-separator">
          <input
            type="text"
            placeholder="Search by name or provider..."
            className="w-full bg-surface-light rounded-lg border border-separator px-3.5 py-2 text-[13px] focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 placeholder:text-muted/40 transition-all duration-150"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted/50 gap-3">
              <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
              <span className="text-[13px]">Loading agents...</span>
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-[13px] text-muted/50">
              No results for &ldquo;{search}&rdquo;
            </div>
          ) : (
            filteredModels.map((model) => {
              const isAdded = availableModels.some((m) => m.id === model.id);
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
                      <span className="text-[13px] font-medium truncate text-foreground/85">
                        {model.name}
                      </span>
                      <span className="text-[10px] px-1.5 py-[1px] rounded bg-elevated text-muted/50 uppercase tracking-wide flex-shrink-0">
                        {model.id.split("/")[0]}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted/40 font-mono">
                      <span>${promptPrice}/1M in</span>
                      <span>${completionPrice}/1M out</span>
                      <span>{(model.context_length / 1024).toFixed(0)}k ctx</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleAddModel(model)}
                    disabled={isAdded}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors duration-150 ${
                      isAdded
                        ? "text-muted/30 cursor-default"
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
          <p className="text-[10px] text-muted/30">
            Powered by OpenRouter
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
