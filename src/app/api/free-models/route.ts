import { NextResponse } from "next/server";

export async function GET() {
  const serverKey = process.env.OPENROUTER_API_KEY;
  if (!serverKey) {
    return NextResponse.json(
      { error: "No server key configured" },
      { status: 503 }
    );
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        Authorization: `Bearer ${serverKey}`,
        "HTTP-Referer": "https://lryq.com",
        "X-Title": "Agent Debate Consensus",
      },
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API responded with ${response.status}`);
    }

    const data = await response.json();
    const freeModelIds: string[] = data.data
      .filter(
        (m: { pricing: { prompt: string; completion: string } }) =>
          parseFloat(m.pricing.prompt) === 0 &&
          parseFloat(m.pricing.completion) === 0
      )
      .map((m: { id: string }) => m.id);

    return NextResponse.json(
      { freeModelIds },
      {
        headers: { "Cache-Control": "public, max-age=3600" },
      }
    );
  } catch (error) {
    console.error("Failed to fetch free models:", error);
    return NextResponse.json(
      { error: "Failed to fetch models from OpenRouter" },
      { status: 500 }
    );
  }
}
