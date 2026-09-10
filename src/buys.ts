import type { TrackedToken } from "./types";

export const BUY_WINDOW_MS = 120_000;
const WINDOW_5M_MS = 300_000;
const MAX_SAMPLES = 24;

export type BuySample = { at: number; buys5m: number };

export function scaleBuys5mTo2m(buys5m?: number): number | undefined {
  if (buys5m == null || !Number.isFinite(buys5m) || buys5m < 0) return undefined;
  return Math.round(buys5m * (BUY_WINDOW_MS / WINDOW_5M_MS));
}

export function recordBuySample(prev: BuySample[], buys5m: number | undefined, at = Date.now()): BuySample[] {
  if (buys5m == null || !Number.isFinite(buys5m) || buys5m < 0) return prev;
  const last = prev[prev.length - 1];
  if (last && at - last.at < 400 && last.buys5m === buys5m) return prev;
  return [...prev, { at, buys5m }].filter((row) => at - row.at <= WINDOW_5M_MS + 15_000).slice(-MAX_SAMPLES);
}

/** Dex only prints a rolling 5m buy count. Estimate the last 2 minutes from sampled deltas. */
export function estimateBuysInWindow(samples: BuySample[], now = Date.now(), windowMs = BUY_WINDOW_MS): number | undefined {
  const recent = samples.filter((row) => now - row.at <= Math.max(windowMs, WINDOW_5M_MS) && now - row.at <= windowMs + 20_000);
  const usable = recent.length ? recent : samples.slice(-2);
  if (usable.length === 0) return undefined;
  if (usable.length === 1) return scaleBuys5mTo2m(usable[0].buys5m);

  let buys = 0;
  for (let index = 1; index < usable.length; index += 1) {
    const prev = usable[index - 1];
    const curr = usable[index];
    if (curr.at < now - windowMs - 5_000) continue;
    const dt = Math.max(0, curr.at - prev.at);
    if (dt <= 0) continue;
    const dropped = prev.buys5m * Math.min(1, dt / WINDOW_5M_MS);
    buys += Math.max(0, curr.buys5m - prev.buys5m + dropped);
  }
  const span = usable[usable.length - 1].at - usable[0].at;
  if (span < windowMs * 0.35) {
    const scaled = scaleBuys5mTo2m(usable[usable.length - 1].buys5m) ?? 0;
    return Math.round(Math.max(buys, scaled));
  }
  return Math.round(buys);
}

export function stampBuys2m(
  token: TrackedToken,
  samplesById: Map<string, BuySample[]>,
  at = Date.now(),
): TrackedToken {
  if (token.buys5m == null) return token;
  const samples = recordBuySample(samplesById.get(token.id) ?? [], token.buys5m, at);
  samplesById.set(token.id, samples);
  const buys2m = estimateBuysInWindow(samples, at) ?? scaleBuys5mTo2m(token.buys5m);
  if (buys2m == null || buys2m === token.buys2m) return token;
  return { ...token, buys2m };
}

export function patchBuys2m(
  id: string,
  patch: Partial<TrackedToken>,
  samplesById: Map<string, BuySample[]>,
  at = Date.now(),
): Partial<TrackedToken> {
  if (patch.buys5m == null) return patch;
  const samples = recordBuySample(samplesById.get(id) ?? [], patch.buys5m, at);
  samplesById.set(id, samples);
  const buys2m = estimateBuysInWindow(samples, at) ?? scaleBuys5mTo2m(patch.buys5m);
  return buys2m == null ? patch : { ...patch, buys2m };
}

export function buys2mScore(token: TrackedToken): number {
  if (token.buys2m != null && token.buys2m > 0) return token.buys2m;
  return scaleBuys5mTo2m(token.buys5m) ?? 0;
}

export function pickBuyTape(tokens: TrackedToken[]): TrackedToken[] {
  return [...tokens]
    .filter((token) => buys2mScore(token) > 0)
    .sort((a, b) => {
      const buys = buys2mScore(b) - buys2mScore(a);
      if (buys !== 0) return buys;
      return (b.volume5m ?? b.volume1h ?? 0) - (a.volume5m ?? a.volume1h ?? 0);
    });
}
