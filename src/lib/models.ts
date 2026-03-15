import { Model } from "@/types/chat";

/**
 * Extended color palette with 16 visually distinct hues.
 * Ordered to maximize perceptual distance between adjacent colors,
 * so even sequential assignment avoids similar neighbors.
 */
export const MODEL_COLOR_PALETTE = [
  "#32d583", // emerald
  "#60a5fa", // blue
  "#fbbf24", // amber
  "#ff6482", // rose
  "#a78bfa", // violet
  "#f97316", // orange
  "#06b6d4", // cyan
  "#ec4899", // pink
  "#84cc16", // lime
  "#8b5cf6", // purple
  "#14b8a6", // teal
  "#ef4444", // red
  "#38bdf8", // sky
  "#d946ef", // fuchsia
  "#22c55e", // green
  "#eab308", // yellow
];

/**
 * Pick the next unused color from the palette.
 * Compares against colors already assigned to `existingModels`.
 * Falls back to deterministic hash if all colors are taken.
 */
export function getNextUniqueColor(existingModels: Model[]): string {
  const usedColors = new Set(existingModels.map((m) => m.color.toLowerCase()));

  for (const color of MODEL_COLOR_PALETTE) {
    if (!usedColors.has(color.toLowerCase())) {
      return color;
    }
  }

  // All palette colors used — generate a deterministic but distinct hue
  const hue = (existingModels.length * 137.508) % 360; // golden angle
  return `hsl(${Math.round(hue)}, 70%, 60%)`;
}

export const availableModels: Model[] = [
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    name: "Nemotron 3 Super 120B",
    shortName: "Nemotron",
    provider: "nvidia",
    color: MODEL_COLOR_PALETTE[0],
    isActive: false,
    pricing: { prompt: "0", completion: "0" },
    context_length: 131_072,
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    name: "Llama 3.3 70B",
    shortName: "Llama",
    provider: "meta-llama",
    color: MODEL_COLOR_PALETTE[1],
    isActive: false,
    pricing: { prompt: "0", completion: "0" },
    context_length: 131_072,
  },
  {
    id: "mistralai/mistral-small-3.1-24b-instruct:free",
    name: "Mistral Small 3.1",
    shortName: "Mistral",
    provider: "mistralai",
    color: MODEL_COLOR_PALETTE[2],
    isActive: false,
    pricing: { prompt: "0", completion: "0" },
    context_length: 96_000,
  },
  {
    id: "google/gemma-3-27b-it:free",
    name: "Gemma 3 27B",
    shortName: "Gemma",
    provider: "google",
    color: MODEL_COLOR_PALETTE[3],
    isActive: false,
    pricing: { prompt: "0", completion: "0" },
    context_length: 96_000,
  },
];
