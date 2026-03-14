import { NextRequest } from "next/server";
import OpenAI from "openai";

function getApiKey(req: NextRequest): string | null {
  const serverKey = process.env.OPENROUTER_API_KEY;
  if (serverKey) return serverKey;
  return req.headers.get("x-api-key");
}

export async function POST(req: NextRequest) {
  const apiKey = getApiKey(req);

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "No API key provided" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey,
    defaultHeaders: {
      "HTTP-Referer": "https://lryq.com",
      "X-Title": "Agent Debate Consensus",
    },
  });

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

    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 200) {
      return new Response(
        JSON.stringify({ error: "Invalid 'messages': must be a non-empty array (max 200)" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const validRoles = new Set(["system", "user", "assistant"]);
    const messagesValid = messages.every(
      (m: unknown) =>
        typeof m === "object" && m !== null &&
        typeof (m as Record<string, unknown>).role === "string" &&
        validRoles.has((m as Record<string, unknown>).role as string) &&
        typeof (m as Record<string, unknown>).content === "string"
    );
    if (!messagesValid) {
      return new Response(
        JSON.stringify({ error: "Each message must have a valid 'role' and 'content' string" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const temp = temperature ?? 0.7;
    if (typeof temp !== "number" || temp < 0 || temp > 2) {
      return new Response(
        JSON.stringify({ error: "Temperature must be a number between 0 and 2" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

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
            const delta = chunk.choices[0]?.delta as any;
            const content = delta?.content || "";
            const reasoning = delta?.reasoning_content || delta?.reasoning || "";

            if (content || reasoning) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ content, reasoning })}\n\n`)
              );
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          const message = error instanceof Error ? error.message : "Stream error";
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
    const message = error instanceof Error ? error.message : "Failed to process request";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
