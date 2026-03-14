import { NextResponse } from "next/server";

export async function GET() {
  const hasServerKey = !!process.env.OPENROUTER_API_KEY;
  const maxActiveModels = parseInt(process.env.MAX_ACTIVE_MODELS || "8", 10);
  return NextResponse.json({
    publicMode: !hasServerKey,
    maxActiveModels: Number.isFinite(maxActiveModels) && maxActiveModels > 0 ? maxActiveModels : 8,
  });
}
