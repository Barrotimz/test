import { describe, expect, it } from "vitest";
import { scoreTokenHype, scoreTweetAttraction } from "./attraction";
import type { TrackedToken } from "./types";

const baseToken: TrackedToken = {
  id: "solana:x",
  chainId: "solana",
  tokenAddress: "x",
  name: "Test",
  symbol: "TEST",
  dexUrl: "https://dexscreener.com",
  source: "search",
};

describe("scoreTweetAttraction", () => {
  it("marks a dead post as quiet", () => {
    expect(scoreTweetAttraction({ likes: 2, retweets: 0, views: 40 }).level).toBe("quiet");
  });

  it("marks a widely liked post as viral", () => {
    const viral = scoreTweetAttraction({
      likes: 12_000,
      retweets: 3_400,
      views: 400_000,
      followers: 80_000,
    });
    expect(viral.level).toBe("viral");
    expect(viral.score).toBeGreaterThan(20_000);
  });

  it("treats a mid-size KOL post as warming even with few likes", () => {
    expect(scoreTweetAttraction({ likes: 8, retweets: 1, followers: 80_000 }).level).toBe("warming");
  });
});

describe("scoreTokenHype", () => {
  it("stays quiet on a thin, flat token", () => {
    expect(scoreTokenHype({ ...baseToken, volume24h: 800, change1h: 1 }).level).toBe("quiet");
  });

  it("goes hot when volume and a pump line up", () => {
    const hot = scoreTokenHype({
      ...baseToken,
      volume24h: 900_000,
      marketCap: 200_000,
      change1h: 45,
      boostAmount: 50,
    });
    expect(["hot", "viral"]).toContain(hot.level);
  });
});
