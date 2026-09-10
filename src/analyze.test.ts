import { describe, expect, it } from "vitest";
import { analyzeToken } from "./analyze";
import { emptyBrain, learnFromTokens } from "./learn";
import type { TrackedToken } from "./types";

const token = (extra: Partial<TrackedToken> = {}): TrackedToken => ({
  id: extra.id ?? "solana:a",
  chainId: extra.chainId ?? "solana",
  tokenAddress: "a",
  name: "A",
  symbol: extra.symbol ?? "A",
  dexUrl: "https://pump.fun",
  source: "launch",
  launchpad: "pump.fun",
  ...extra,
});

describe("analyzeToken", () => {
  it("prefers aligned momentum and buyers over a fading dump", () => {
    const brain = emptyBrain();
    const strong = analyzeToken(
      token({
        change5m: 18,
        change1h: 40,
        buys1h: 80,
        sells1h: 20,
        tweetLikes: 120,
        tweetRetweets: 20,
        volume1h: 40_000,
        liquidity: 20_000,
        marketCap: 90_000,
        pairCreatedAt: Date.now() - 25 * 60_000,
      }),
      brain,
    );
    const dump = analyzeToken(
      token({
        id: "solana:d",
        change5m: -22,
        change1h: -40,
        buys1h: 8,
        sells1h: 40,
        boostAmount: 80,
        tweetLikes: 2,
        liquidity: 400,
        marketCap: 50_000,
      }),
      brain,
    );
    expect(strong.score).toBeGreaterThan(dump.score);
    expect(strong.momentum).toBe("up");
    expect(dump.verdict).toBe("trap");
    expect(dump.notes.some((note) => note.side === "against")).toBe(true);
  });

  it("treats Robinhood + handle as stronger after a PONS-class lesson", () => {
    const pons = token({
      id: "robinhood:pons",
      chainId: "robinhood",
      symbol: "PONS",
      marketCap: 400_000_000,
      twitterHandle: "ponsdotfamily",
      launchpad: "Robinhood",
    });
    const brain = learnFromTokens(emptyBrain(), [pons]).brain;
    const next = analyzeToken(
      token({
        id: "robinhood:n",
        chainId: "robinhood",
        twitterHandle: "next",
        tweetLikes: 60,
        marketCap: 110_000,
        pairCreatedAt: Date.now() - 40 * 60_000,
        launchpad: "Robinhood",
      }),
      brain,
    );
    expect(next.call.reasons.join(" ")).toMatch(/PONS|Robinhood/i);
  });
});
