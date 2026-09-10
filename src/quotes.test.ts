import { describe, expect, it } from "vitest";
import {
  geckoBaseMint,
  noteDexStatus,
  quotePatchChanged,
  quotePatchFromPair,
  resetDexCooldown,
  dexIsCooling,
  dexCooldownLeft,
  selectQuoteTargets,
  bagsIsGated,
  noteBagsStatus,
  resetBagsGate,
} from "./api";
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

  it("attaches a tweet parked on Dex websites — the Plumber miss — unless a status is already known", () => {
    const pair = {
      chainId: "solana",
      dexId: "pumpswap",
      url: "https://dexscreener.com/solana/g8",
      pairAddress: "p",
      baseToken: { address: "G8dmGbWTEFeK8Xmj5YaukwNsAKXCDEQfm11d5987crmZ", name: "Plumber", symbol: "Plumber" },
      quoteToken: { address: "so", name: "SOL", symbol: "SOL" },
      marketCap: 50_000,
      info: {
        websites: [{ url: "https://x.com/polymarket/status/2097871648867172659" }],
        socials: [{ url: "https://x.com/plumbercoin", type: "twitter" }],
      },
    } as DexTokenPair;
    const attached = quotePatchFromPair(pair, token("g8"));
    expect(attached.tweetUrl).toContain("2097871648867172659");
    expect(attached.twitterUrl).toContain("2097871648867172659");
    const already = quotePatchFromPair(
      pair,
      token("g8", { twitterUrl: "https://x.com/other/status/1", tweetUrl: "https://x.com/other/status/1" }),
    );
    expect(already.tweetUrl).toBeUndefined();
    expect(already.marketCap).toBe(50000);
  });
});

describe("dex cooldown", () => {
  it("backs off after a 429 and recovers on success", () => {
    resetDexCooldown();
    const now = 5_000_000;
    expect(dexIsCooling(now)).toBe(false);
    noteDexStatus(429, now);
    expect(dexIsCooling(now + 100)).toBe(true);
    expect(dexCooldownLeft(now + 100)).toBeGreaterThan(1000);
    noteDexStatus(200, now + 60_000);
    expect(dexIsCooling(now + 60_000)).toBe(false);
    resetDexCooldown();
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

describe("geckoBaseMint", () => {
  it("reads the token mint, not the pool address", () => {
    const mint = geckoBaseMint(
      {
        id: "solana_pool",
        attributes: { name: "Plumber", address: "POOLADDR11111111111111111111111111111111" },
        relationships: { base_token: { data: { id: "solana_G8dmGbWTEFeK8Xmj5YaukwNsAKXCDEQfm11d5987crmZ" } } },
      },
      "solana",
    );
    expect(mint).toBe("G8dmGbWTEFeK8Xmj5YaukwNsAKXCDEQfm11d5987crmZ");
    expect(geckoBaseMint({ id: "solana_x", attributes: { name: "x", address: "ONLYPOOL" } }, "solana")).toBeUndefined();
  });
});

describe("bags gate", () => {
  it("parks the feed once Bags demands an api key, and reopens on a good reply", () => {
    resetBagsGate();
    expect(bagsIsGated()).toBe(false);
    noteBagsStatus(401);
    expect(bagsIsGated()).toBe(true);
    noteBagsStatus(200);
    expect(bagsIsGated()).toBe(false);
  });

  it("lets the gate lapse on its own", () => {
    resetBagsGate();
    const now = 1_000_000;
    noteBagsStatus(403, now);
    expect(bagsIsGated(now + 60_000)).toBe(true);
    expect(bagsIsGated(now + 31 * 60_000)).toBe(false);
  });
});
