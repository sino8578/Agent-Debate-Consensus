import { NextRequest } from "next/server";
import OpenAI from "openai";
import { checkRateLimit } from "@/lib/rateLimit";

// --- Server-side free model cache ---
let freeModelCache: { ids: Set<string>; fetchedAt: number } | null = null;
const SERVER_CACHE_TTL = 3600_000; // 1 hour

async function isModelFree(modelId: string): Promise<boolean> {
  const now = Date.now();
  if (freeModelCache && now - freeModelCache.fetchedAt < SERVER_CACHE_TTL) {
    return freeModelCache.ids.has(modelId);
  }

  try {
    const serverKey = process.env.OPENROUTER_API_KEY!;
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${serverKey}`,
        "HTTP-Referer": "https://lryq.com",
        "X-Title": "Agent Debate Consensus",
      },
    });
    const data = await res.json();
    const freeIds = new Set<string>(
      data.data
        .filter(
          (m: { pricing: { prompt: string; completion: string } }) =>
            parseFloat(m.pricing.prompt) === 0 &&
            parseFloat(m.pricing.completion) === 0
        )
        .map((m: { id: string }) => m.id)
    );
    freeModelCache = { ids: freeIds, fetchedAt: now };
    return freeIds.has(modelId);
  } catch {
    // On error, deny by default in public mode
    return false;
  }
}

// --- Key resolution ---
function resolveApiKey(
  req: NextRequest
): { key: string; source: "server" | "user" } | null {
  const serverKey = process.env.OPENROUTER_API_KEY;
  const userKey = req.headers.get("x-api-key");
  const appMode = process.env.APP_MODE === "public" ? "public" : "private";

  // Scenario 1: No server key — must use user key
  if (!serverKey) {
    return userKey ? { key: userKey, source: "user" } : null;
  }

  // Scenario 2: private mode — always use server key
  if (appMode === "private") {
    return { key: serverKey, source: "server" };
  }

  // Scenario 3: public mode — prefer user key, fallback to server key (free only)
  if (userKey) {
    return { key: userKey, source: "user" };
  }

  return { key: serverKey, source: "server" };
}

export async function POST(req: NextRequest) {
  const appMode = process.env.APP_MODE === "public" ? "public" : "private";
  const resolved = resolveApiKey(req);

  if (!resolved) {
    return new Response(
      JSON.stringify({ error: "No API key provided" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { messages, model, temperature, webSearch } = body;

    // Input validation
    if (!model || typeof model !== "string") {
      return new Response(
        JSON.stringify({ error: "Invalid or missing 'model' parameter" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (
      !Array.isArray(messages) ||
      messages.length === 0 ||
      messages.length > 200
    ) {
      return new Response(
        JSON.stringify({
          error: "Invalid 'messages': must be a non-empty array (max 200)",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const validRoles = new Set(["system", "user", "assistant"]);
    const messagesValid = messages.every(
      (m: unknown) =>
        typeof m === "object" &&
        m !== null &&
        typeof (m as Record<string, unknown>).role === "string" &&
        validRoles.has((m as Record<string, unknown>).role as string) &&
        typeof (m as Record<string, unknown>).content === "string"
    );
    if (!messagesValid) {
      return new Response(
        JSON.stringify({
          error: "Each message must have a valid 'role' and 'content' string",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const temp = temperature ?? 0.7;
    if (typeof temp !== "number" || temp < 0 || temp > 2) {
      return new Response(
        JSON.stringify({
          error: "Temperature must be a number between 0 and 2",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // === RATE LIMITING (public mode + server key only) ===
    if (appMode === "public" && resolved.source === "server") {
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        "unknown";
      const rateCheck = checkRateLimit(ip);
      if (!rateCheck.allowed) {
        return new Response(
          JSON.stringify({
            error:
              "Rate limit exceeded. Please try again later or add your own API key for unlimited access.",
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(Math.ceil(rateCheck.resetIn / 1000)),
            },
          }
        );
      }
    }

    // === FREE MODEL VALIDATION (public mode + server key) ===
    if (appMode === "public" && resolved.source === "server") {
      const isFree = await isModelFree(model);
      if (!isFree) {
        return new Response(
          JSON.stringify({
            error:
              "This model requires your own API key in public mode.",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }

      // Web search is not allowed with server key in public mode
      if (webSearch) {
        return new Response(
          JSON.stringify({
            error:
              "Web search requires your own API key in public mode.",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: resolved.key,
      defaultHeaders: {
        "HTTP-Referer": "https://lryq.com",
        "X-Title": "Agent Debate Consensus",
      },
    });

    const effectiveModel = webSearch ? `${model}:online` : model;

    const stream = await openai.chat.completions.create({
      model: effectiveModel,
      messages,
      stream: true,
      temperature: temp,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta as Record<string, unknown>;
            const content = (delta?.content as string) || "";
            const reasoning =
              (delta?.reasoning_content as string) ||
              (delta?.reasoning as string) ||
              "";

            if (content || reasoning) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ content, reasoning })}\n\n`
                )
              );
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Stream error";
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: message })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("API Error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to process request";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
