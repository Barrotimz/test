import { describe, expect, it } from "vitest";
import {
  detectTodayMetas,
  familyForToken,
  matchingRipMeta,
  metaSearchQueries,
  pickMetaCoins,
  todayMoveScore,
  tokenFitsMeta,
} from "./meta";
import type { TrackedToken } from "./types";

const token = (extra: Partial<TrackedToken> = {}): TrackedToken => ({
  id: extra.id ?? `solana:${extra.symbol ?? "X"}`,
  chainId: extra.chainId ?? "solana",
  tokenAddress: extra.tokenAddress ?? "x",
  name: extra.name ?? extra.symbol ?? "X",
  symbol: extra.symbol ?? "X",
  dexUrl: "https://pump.fun",
  source: extra.source ?? "launch",
  ...extra,
});

describe("today's meta", () => {
  it("uses the coin that is ripping today, not yesterday's leftover million-cap", () => {
    const now = 1_780_000_000_000;
    const staleLaptop = token({
      symbol: "LAPTOP",
      name: "Laptop",
      marketCap: 4_200_000,
      pairCreatedAt: now - 3 * 24 * 60 * 60_000,
      change24h: -12,
      volume24h: 8_000,
      source: "search",
    });
    const todayRip = token({
      id: "solana:BANANA",
      symbol: "BANANA",
      name: "Banana",
      marketCap: 180_000,
      change24h: 420,
      volume24h: 900_000,
      source: "trending",
      pairCreatedAt: now - 4 * 60 * 60_000,
    });
    expect(todayMoveScore(staleLaptop, now)).toBe(0);
    expect(todayMoveScore(todayRip, now)).toBeGreaterThan(50);
    const metas = detectTodayMetas([staleLaptop, todayRip], [], now);
    expect(metas[0]?.seedSymbol).toBe("BANANA");
    expect(metas[0]?.headline).toMatch(/Today's meta is \$BANANA/i);
    expect(metas[0]?.themeId).toBe("food");
  });

  it("groups same-category coins beside today's rip", () => {
    const now = 1_780_000_000_000;
    const laptop = token({
      symbol: "LAPTOP",
      name: "Laptop",
      marketCap: 4_200_000,
      change24h: 260,
      volume24h: 1_200_000,
      source: "trending",
      pairCreatedAt: now - 3 * 60 * 60_000,
    });
    const desktop = token({
      id: "solana:DESKTOP",
      symbol: "DESKTOP",
      name: "Desktop",
      marketCap: 18_000,
      pairCreatedAt: now - 20 * 60_000,
    });
    const frog = token({
      id: "solana:FROG",
      symbol: "FROG",
      name: "Frog",
      marketCap: 9_000,
    });

    expect(familyForToken(laptop)?.id).toBe("computer");
    const metas = detectTodayMetas([laptop, desktop, frog], [], now);
    expect(metas[0]?.seedSymbol).toBe("LAPTOP");
    expect(tokenFitsMeta(desktop, metas[0])).toBe(true);
    expect(tokenFitsMeta(frog, metas[0])).toBe(false);
    expect(pickMetaCoins([laptop, desktop, frog], metas).map((row) => row.symbol)).toEqual([
      "LAPTOP",
      "DESKTOP",
    ]);
    expect(metaSearchQueries(metas)[0]).toBe("LAPTOP");
    expect(metaSearchQueries(metas)).toContain("desktop");
  });

  it("uses a studied rip only if it happened today", () => {
    const now = Date.now();
    const desktop = token({ symbol: "DESKTOP", name: "Desktop PC" });
    const today = matchingRipMeta(
      desktop,
      [{ id: "solana:LAPTOP", symbol: "LAPTOP", at: now - 60 * 60_000, peakMcap: 3_500_000, tier: "millions" }],
      now,
    );
    const yesterday = matchingRipMeta(
      desktop,
      [{ id: "solana:LAPTOP", symbol: "LAPTOP", at: now - 2 * 24 * 60 * 60_000, peakMcap: 3_500_000, tier: "millions" }],
      now,
    );
    expect(today?.seedSymbol).toBe("LAPTOP");
    expect(yesterday).toBeUndefined();
  });
});
