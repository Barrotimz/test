import { describe, expect, it } from "vitest";
import { quotePatchChanged, quotePatchFromPair, selectQuoteTargets } from "./api";
import type { DexTokenPair, TrackedToken } from "./types";

const token = (id: string, extra: Partial<TrackedToken> = {}): TrackedToken => ({
  id,
  chainId: "solana",
  tokenAddress: id,
  name: id,
  symbol: id,
  dexUrl: "https://pump.fun",
  source: "launch",
  ...extra,
});

describe("quotePatchFromPair", () => {
  it("pulls mcap and change without touching socials", () => {
    const patch = quotePatchFromPair({
      chainId: "solana",
      dexId: "raydium",
      url: "https://dexscreener.com/solana/x",
      pairAddress: "p",
      baseToken: { address: "mint", name: "Plumber", symbol: "Plumber" },
      quoteToken: { address: "so", name: "SOL", symbol: "SOL" },
      priceUsd: "0.000154",
      marketCap: 153_421.8,
      fdv: 153_421.8,
      volume: { h1: 723_400.2, m5: 12_000 },
      priceChange: { h1: 12.34, h24: -3.21 },
      liquidity: { usd: 40_107.9 },
    } as DexTokenPair);
    expect(patch.marketCap).toBe(153422);
    expect(patch.change1h).toBe(12.3);
    expect(patch.twitterUrl).toBeUndefined();
    expect(patch.tweetLikes).toBeUndefined();
  });
});

describe("selectQuoteTargets", () => {
  it("prefers visible cards, then the open coin, and caps the set", () => {
    const bag = [token("a"), token("b"), token("c"), token("d")];
    const picked = selectQuoteTargets(bag, ["b", "a"], "d", ["c"], 3);
    expect(picked.map((row) => row.id)).toEqual(["b", "a", "d"]);
  });
});

describe("quotePatchChanged", () => {
  it("ignores identical mcap reprints so the board does not rerender", () => {
    const row = token("a", { marketCap: 12_000, change1h: 8 });
    expect(quotePatchChanged(row, { marketCap: 12_000, change1h: 8 })).toBe(false);
    expect(quotePatchChanged(row, { marketCap: 13_000 })).toBe(true);
  });
});
