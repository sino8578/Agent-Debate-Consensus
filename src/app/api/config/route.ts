import { NextResponse } from "next/server";

export async function GET() {
  const hasServerKey = !!process.env.OPENROUTER_API_KEY;
  const appMode = process.env.APP_MODE === "public" ? "public" : "private";
  const maxActiveModels = parseInt(process.env.MAX_ACTIVE_MODELS || "8", 10);

  return NextResponse.json({
    hasServerKey,
    appMode,
    maxActiveModels:
      Number.isFinite(maxActiveModels) && maxActiveModels > 0
        ? maxActiveModels
        : 8,
  });
}
