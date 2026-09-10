import { describe, expect, it } from "vitest";
import {
  brainInsights,
  emptyBrain,
  isMajorRunner,
  isMillionRunner,
  learnFromTokens,
  pickPossibleRunners,
  scoreAgainstBrain,
  whyOutperformed,
} from "./learn";
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

  it("studies a PONS-class million-mcap coin and lists similar possibles", () => {
    const pons = base({
      id: "robinhood:pons",
      chainId: "robinhood",
      symbol: "PONS",
      marketCap: 435_000_000,
      volume24h: 7_500_000,
      twitterHandle: "ponsdotfamily",
      twitterUrl: "https://x.com/ponsdotfamily",
    });
    const dust = base({ id: "solana:dust", symbol: "DUST", marketCap: 2_800 });
    expect(isMillionRunner(pons)).toBe(true);
    const learned = learnFromTokens(emptyBrain(), [pons, dust, dust, base({ id: "solana:c" })]);
    expect(learned.fresh[0].tier).toBe("millions");
    expect(whyOutperformed(pons, [pons, dust, dust, base({ id: "solana:c", marketCap: 3_000 })])[0]).toMatch(/mcap/);
    expect(brainInsights(learned.brain).join(" ")).toMatch(/millions/);

    const maybe = base({
      id: "robinhood:next",
      chainId: "robinhood",
      symbol: "NEXT",
      twitterHandle: "nexthandle",
      tweetLikes: 90,
      marketCap: 120_000,
      pairCreatedAt: Date.now() - 30 * 60_000,
    });
    const possibles = pickPossibleRunners([maybe, dust], learned.brain);
    expect(possibles.map((row) => row.symbol)).toContain("NEXT");
  });

  it("scores a DESKTOP-style copycat after a LAPTOP million-rip", () => {
    const now = Date.now();
    const laptop = base({
      id: "solana:laptop",
      symbol: "LAPTOP",
      name: "Laptop",
      marketCap: 3_200_000,
      pairCreatedAt: now - 2 * 60 * 60_000,
    });
    const learned = learnFromTokens(emptyBrain(), [laptop], now);
    const desktop = base({
      id: "solana:desktop",
      symbol: "DESKTOP",
      name: "Desktop",
      tweetLikes: 12,
      pairCreatedAt: now - 15 * 60_000,
    });
    const other = base({
      id: "solana:zzz",
      symbol: "ZZZ",
      name: "Zzz",
      tweetLikes: 12,
      pairCreatedAt: now - 15 * 60_000,
    });
    const deskCall = scoreAgainstBrain(desktop, learned.brain);
    expect(deskCall.reasons.join(" ")).toMatch(/LAPTOP|computer/i);
    expect(deskCall.score).toBeGreaterThan(scoreAgainstBrain(other, learned.brain).score);
  });
});
