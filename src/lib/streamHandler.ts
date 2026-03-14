interface StreamCallbacks {
  onToken: (content: string, reasoning?: string) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
}

// Track active abort controllers for cancellation
const activeControllers = new Map<string, AbortController>();

function getApiKeyHeader(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const key = sessionStorage.getItem("openrouter-api-key");
  return key ? { "x-api-key": key } : {};
}

export function stopAllStreams(): void {
  activeControllers.forEach((controller) => {
    controller.abort();
  });
  activeControllers.clear();
}

export function stopStream(modelId: string): void {
  const controller = activeControllers.get(modelId);
  if (controller) {
    controller.abort();
    activeControllers.delete(modelId);
  }
}

export function hasActiveStreams(): boolean {
  return activeControllers.size > 0;
}

export async function streamModelResponse(
  modelId: string,
  messages: { role: string; content: string }[],
  callbacks: StreamCallbacks,
  options?: { temperature?: number }
): Promise<void> {
  const { onToken, onComplete, onError } = callbacks;

  // Create abort controller for this request
  const controller = new AbortController();
  activeControllers.set(modelId, controller);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getApiKeyHeader(),
      },
      body: JSON.stringify({ model: modelId, messages, temperature: options?.temperature }),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorMessage = `API error: ${response.status}`;
      try {
        const body = await response.json();
        if (body.error) {
          errorMessage = typeof body.error === "string"
            ? body.error
            : body.error.message || errorMessage;
        }
      } catch {
        // Use default error message if body parsing fails
      }
      throw new Error(errorMessage);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error("No response body");
    }

    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Check if aborted
      if (controller.signal.aborted) {
        reader.cancel();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith("data: ")) {
          const data = trimmedLine.slice(6).trim();
          if (data === "[DONE]") {
            activeControllers.delete(modelId);
            onComplete();
            return;
          }
          let parsed;
          try {
            parsed = JSON.parse(data);
          } catch {
            continue; // Skip unparseable chunks
          }
          if (parsed.error) {
            throw new Error(parsed.error);
          }
          if (parsed.content || parsed.reasoning) {
            onToken(parsed.content || "", parsed.reasoning || "");
          }
        }
      }
    }

    activeControllers.delete(modelId);
    onComplete();
  } catch (error) {
    activeControllers.delete(modelId);
    if ((error as Error).name === "AbortError") {
      onComplete(); // Treat abort as completion (message stays as-is)
      return;
    }
    onError(error as Error);
  }
}
