import { describe, expect, it } from "vitest";
import {
  detectTodayMetas,
  familyForToken,
  matchingRipMeta,
  metaSearchQueries,
  pickMetaCoins,
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
  it("puts DESKTOP in the same computer bag after LAPTOP rips to millions", () => {
    const now = 1_780_000_000_000;
    const laptop = token({
      symbol: "LAPTOP",
      name: "Laptop",
      marketCap: 4_200_000,
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
    expect(metas[0]?.themeId).toBe("computer");
    expect(metas[0]?.seedSymbol).toBe("LAPTOP");
    expect(tokenFitsMeta(desktop, metas[0])).toBe(true);
    expect(tokenFitsMeta(frog, metas[0])).toBe(false);
    expect(pickMetaCoins([laptop, desktop, frog], metas).map((row) => row.symbol)).toEqual([
      "LAPTOP",
      "DESKTOP",
    ]);
    expect(metaSearchQueries(metas)).toContain("desktop");
  });

  it("uses a studied million-rip even if that coin left the live board", () => {
    const now = Date.now();
    const desktop = token({ symbol: "DESKTOP", name: "Desktop PC" });
    const hit = matchingRipMeta(desktop, [
      { id: "solana:LAPTOP", symbol: "LAPTOP", at: now - 60 * 60_000, peakMcap: 3_500_000, tier: "millions" },
    ], now);
    expect(hit?.seedSymbol).toBe("LAPTOP");
    expect(hit?.label).toMatch(/computer/i);
  });
});
