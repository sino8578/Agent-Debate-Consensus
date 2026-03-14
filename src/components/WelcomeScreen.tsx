"use client";

import { useState } from "react";
import { useChatStore } from "@/store/chatStore";

export function WelcomeScreen() {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [validating, setValidating] = useState(false);
  const setApiKey = useChatStore((state) => state.setApiKey);

  const handleSubmit = async () => {
    const trimmed = key.trim();
    if (!trimmed) return;

    setValidating(true);
    setError("");

    try {
      const res = await fetch("/api/models", {
        headers: { "x-api-key": trimmed },
      });

      if (!res.ok) {
        setError("Invalid API key. Please check and try again.");
        setValidating(false);
        return;
      }

      setApiKey(trimmed);
    } catch {
      setError("Failed to validate key. Please try again.");
      setValidating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-[440px] animate-fade-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center mb-5 shadow-lg shadow-primary/20">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-[24px] font-semibold tracking-[-0.02em] mb-2">
            Agent Debate Consensus
          </h1>
          <p className="text-[15px] text-muted text-center leading-relaxed max-w-[360px]">
            Multi-agent debate platform where AI models discuss, argue,
            and find consensus on any topic you choose.
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-2 gap-2.5 mb-8">
          {[
            { icon: "M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a2 2 0 01-2-2v-6a2 2 0 012-2h8zM7 4h8a2 2 0 012 2v.5", label: "Multi-agent debate" },
            { icon: "M13 10V3L4 14h7v7l9-11h-7z", label: "Real-time streaming" },
            { icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z", label: "User intervention" },
            { icon: "M12 10v6m0 0l-3-3m3 3l3-3M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z", label: "Export to Markdown" },
          ].map((f) => (
            <div key={f.label} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-surface-light/50">
              <svg className="w-4 h-4 text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d={f.icon} />
              </svg>
              <span className="text-[13px] text-foreground/80">{f.label}</span>
            </div>
          ))}
        </div>

        {/* API Key input */}
        <div className="space-y-3 mb-4">
          <label className="block text-[13px] font-medium text-muted uppercase tracking-[0.05em]">
            OpenRouter API Key
          </label>
          <input
            type="password"
            value={key}
            onChange={(e) => { setKey(e.target.value); setError(""); }}
            onKeyDown={handleKeyDown}
            placeholder="sk-or-v1-..."
            autoFocus
            className="w-full bg-surface-light rounded-xl border border-separator px-4 py-3 text-[15px] focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 placeholder:text-muted/50 transition-all duration-150 font-mono"
          />
          {error && (
            <p className="text-[13px] text-red-400">{error}</p>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={!key.trim() || validating}
          className="w-full h-11 rounded-xl bg-primary text-white text-[15px] font-medium transition-all duration-150 hover:bg-primary-hover active:scale-[0.98] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {validating ? "Validating..." : "Start Debating"}
        </button>

        {/* Privacy note */}
        <div className="flex items-start gap-2 mt-4 px-1">
          <svg className="w-3.5 h-3.5 text-muted flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p className="text-[12px] text-muted leading-relaxed">
            Your key is stored only in your browser session and is never saved on our servers.
            It is used solely to make requests to OpenRouter on your behalf.
            Closing the tab will erase the key.
          </p>
        </div>

        {/* Footer links */}
        <div className="flex items-center justify-center gap-5 mt-8 text-[13px] text-muted">
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors duration-150"
          >
            Get an API key
          </a>
          <span className="text-muted/30">|</span>
          <a
            href="https://github.com/nickcheranev/llm-grpchat"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-foreground transition-colors duration-150"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            GitHub
          </a>
        </div>
      </div>
    </div>
  );
}
