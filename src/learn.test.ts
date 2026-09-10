import { describe, expect, it } from "vitest";
import { brainInsights, emptyBrain, isMajorRunner, learnFromTokens, scoreAgainstBrain } from "./learn";
import type { TrackedToken } from "./types";

const base = (extra: Partial<TrackedToken> = {}): TrackedToken => ({
  id: extra.id ?? "solana:x",
  chainId: "solana",
  tokenAddress: "x",
  name: "Test",
  symbol: extra.symbol ?? "TEST",
  dexUrl: "https://pump.fun",
  source: "launch",
  launchpad: "pump.fun",
  ...extra,
});

describe("learnFromTokens", () => {
  it("studies a rip and then scores a similar new coin higher", () => {
    const now = 1_780_000_000_000;
    const rip = base({
      id: "solana:rip",
      symbol: "RIP",
      change1h: 120,
      tweetLikes: 500,
      tweetRetweets: 40,
      pairCreatedAt: now - 20 * 60_000,
      launchpad: "pump.fun",
    });
    expect(isMajorRunner(rip)).toBe(true);
    const learned = learnFromTokens(emptyBrain(), [rip], now);
    expect(learned.fresh).toHaveLength(1);
    expect(learned.fresh[0].why.some((line) => /likes/i.test(line))).toBe(true);
    expect(brainInsights(learned.brain).join(" ")).toMatch(/Studied 1/);

    const twin = base({
      id: "solana:twin",
      symbol: "TWIN",
      tweetLikes: 480,
      tweetRetweets: 20,
      pairCreatedAt: now - 18 * 60_000,
      launchpad: "pump.fun",
      bondingPct: 60,
    });
    const quiet = base({
      id: "solana:quiet",
      symbol: "QUIET",
      tweetLikes: 0,
      pairCreatedAt: now - 4 * 24 * 60 * 60_000,
      launchpad: "Bags",
    });
    expect(scoreAgainstBrain(twin, learned.brain).score).toBeGreaterThan(
      scoreAgainstBrain(quiet, learned.brain).score,
    );
    expect(scoreAgainstBrain(twin, learned.brain).level).not.toBe("watch");
  });
});
