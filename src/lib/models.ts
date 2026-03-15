import { Model } from "@/types/chat";

const modelColors = [
  "#32d583", // emerald
  "#60a5fa", // blue
  "#fbbf24", // amber
  "#ff6482", // rose
];

export const availableModels: Model[] = [
  {
    id: "nvidia/nemotron-3-super-120b-a12b:free",
    name: "Nemotron 3 Super 120B",
    shortName: "Nemotron",
    provider: "nvidia",
    color: modelColors[0],
    isActive: false,
    pricing: { prompt: "0", completion: "0" },
    context_length: 131_072,
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    name: "Llama 3.3 70B",
    shortName: "Llama",
    provider: "meta-llama",
    color: modelColors[1],
    isActive: false,
    pricing: { prompt: "0", completion: "0" },
    context_length: 131_072,
  },
  {
    id: "mistralai/mistral-small-3.1-24b-instruct:free",
    name: "Mistral Small 3.1",
    shortName: "Mistral",
    provider: "mistralai",
    color: modelColors[2],
    isActive: false,
    pricing: { prompt: "0", completion: "0" },
    context_length: 96_000,
  },
  {
    id: "google/gemma-3-27b-it:free",
    name: "Gemma 3 27B",
    shortName: "Gemma",
    provider: "google",
    color: modelColors[3],
    isActive: false,
    pricing: { prompt: "0", completion: "0" },
    context_length: 96_000,
  },
];
