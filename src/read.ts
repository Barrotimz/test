import { coinAgeLabel, pairAgeMs } from "./format";
import type { TrackedToken } from "./types";

export type PulseStage = "new" | "stretch" | "migrated";

export type CreatorTape = {
  launches: number;
  dead: number;
  bestMcap?: number;
  serialLauncher: boolean;
};

export type TapeQuality = {
  turnover?: number;
  uniqueShare?: number;
  washy: boolean;
  athDrawdown?: number;
};

/** Axiom Pulse lanes: new creations, final stretch, just migrated. */
export function pulseStage(token: TrackedToken, now = Date.now()): PulseStage | undefined {
  if (token.stage === "graduated" || token.bondingPct === 100) return "migrated";
  if (token.bondingPct != null && token.bondingPct >= 70) return "stretch";
  const age = pairAgeMs(token.pairCreatedAt, now);
  if (token.stage === "launching" || (age != null && age < 30 * 60_000)) return "new";
  return undefined;
}

export function pulseLabel(stage?: PulseStage): string | undefined {
  if (stage === "new") return "NEW";
  if (stage === "stretch") return "STRETCH";
  if (stage === "migrated") return "MIGRATED";
  return undefined;
}

export function summarizeCreatorTokens(
  tokens: { marketCap?: number }[] | undefined,
): CreatorTape {
  const list = tokens ?? [];
  const launches = list.length;
  const dead = list.filter((row) => (row.marketCap ?? 0) < 2_000).length;
  const bestMcap = list.reduce((best, row) => Math.max(best, row.marketCap ?? 0), 0);
  return {
    launches,
    dead,
    bestMcap: bestMcap || undefined,
    serialLauncher: launches >= 5 && dead / launches >= 0.7,
  };
}

/** Unique buyers vs buy prints, turnover, dump from ATH — GMGN/Photon organic tape. */
export function tapeQuality(token: TrackedToken): TapeQuality {
  const mcap = token.marketCap ?? 0;
  const vol = token.volume1h ?? token.volume24h ?? 0;
  const buys = token.buys1h ?? 0;
  const buyers = token.buyers1h;
  const turnover = mcap > 0 && vol > 0 ? vol / mcap : undefined;
  const uniqueShare = buyers != null && buys > 0 ? buyers / buys : undefined;
  const washy =
    (buyers != null && buys >= 16 && buyers / buys < 0.15) ||
    (buyers != null && vol >= 8_000 && buyers <= 4);
  const ath = token.athMarketCap;
  const athDrawdown = ath && mcap > 0 && ath > mcap ? (1 - mcap / ath) * 100 : undefined;
  return {
    turnover,
    uniqueShare,
    washy,
    athDrawdown: athDrawdown != null && athDrawdown >= 8 ? athDrawdown : undefined,
  };
}

export function twitterAccountAgeMs(joinedAt?: number, now = Date.now()): number | undefined {
  if (joinedAt == null) return undefined;
  return Math.max(0, now - joinedAt);
}

export function twitterAgeChip(joinedAt?: number, now = Date.now()): string | undefined {
  if (joinedAt == null) return undefined;
  const label = coinAgeLabel(joinedAt, now);
  if (label === "—") return undefined;
  return `X ${label.replace(" old", "")}`;
}

export function parseTwitterJoined(raw?: string): number | undefined {
  if (!raw) return undefined;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : undefined;
}
