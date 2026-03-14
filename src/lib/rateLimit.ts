const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 30;

interface WindowEntry {
  timestamps: number[];
}

const ipMap = new Map<string, WindowEntry>();

// Cleanup stale entries every 5 minutes
if (typeof globalThis !== "undefined") {
  const cleanup = () => {
    const cutoff = Date.now() - WINDOW_MS * 2;
    for (const [ip, entry] of ipMap) {
      entry.timestamps = entry.timestamps.filter((t) => t > cutoff);
      if (entry.timestamps.length === 0) ipMap.delete(ip);
    }
  };
  // Use globalThis to avoid duplicate intervals in HMR
  const key = "__rateLimit_cleanup";
  if (!(globalThis as Record<string, unknown>)[key]) {
    (globalThis as Record<string, unknown>)[key] = setInterval(cleanup, 300_000);
  }
}

export function checkRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  resetIn: number;
} {
  const now = Date.now();
  const entry = ipMap.get(ip) || { timestamps: [] };

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < WINDOW_MS);

  if (entry.timestamps.length >= MAX_REQUESTS) {
    const oldestInWindow = entry.timestamps[0];
    return {
      allowed: false,
      remaining: 0,
      resetIn: WINDOW_MS - (now - oldestInWindow),
    };
  }

  entry.timestamps.push(now);
  ipMap.set(ip, entry);

  return {
    allowed: true,
    remaining: MAX_REQUESTS - entry.timestamps.length,
    resetIn: 0,
  };
}
