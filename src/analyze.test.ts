import { describe, expect, it } from "vitest";
import { analyzeToken, heatLane, heatRank, indexAnalyses, listsByHeat, pickByHeat } from "./analyze";
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

  it("orders heat hot before warm before fresh", () => {
    expect(heatRank("hot")).toBeLessThan(heatRank("warm"));
    expect(heatRank("warm")).toBeLessThan(heatRank("fresh"));
    expect(heatRank("fresh")).toBeLessThan(heatRank("quiet"));
    expect(heatRank("quiet")).toBeLessThan(heatRank("trap"));
    const quiet = heatLane(
      token({ id: "solana:old", pairCreatedAt: Date.now() - 10 * 24 * 60 * 60_000, source: "profile" }),
      emptyBrain(),
    );
    expect(["quiet", "trap", "fresh"]).toContain(quiet);
  });

  it("does not mark a bare trending-feed coin as hot", () => {
    const lane = heatLane(
      token({
        id: "solana:trend",
        source: "trending",
        pairCreatedAt: Date.now() - 3 * 24 * 60 * 60_000,
      }),
      emptyBrain(),
    );
    expect(lane).not.toBe("hot");
  });

  it("counts concurrent livestream viewers as a plus", () => {
    const live = analyzeToken(
      token({
        id: "solana:live",
        livestream: true,
        viewers: 74,
        volume1h: 2_000,
        pairCreatedAt: Date.now() - 20 * 60_000,
      }),
      emptyBrain(),
    );
    expect(live.notes.some((note) => /74 watching/.test(note.text))).toBe(true);
  });

  it("puts a new empty launch in fresh and a dump in the cooling lane", () => {
    const brain = emptyBrain();
    const fresh = heatLane(
      token({
        id: "solana:new",
        stage: "launching",
        pairCreatedAt: Date.now() - 8 * 60_000,
      }),
      brain,
    );
    const dump = token({
      id: "solana:dump",
      change5m: -22,
      change1h: -40,
      buys1h: 8,
      sells1h: 40,
      volume1h: 9_000,
    });
    expect(fresh).toBe("fresh");
    expect(heatLane(dump, brain)).toBe("trap");
    expect(pickByHeat([dump, token({ id: "solana:other" })], brain, "trap").map((row) => row.id)).toEqual([
      "solana:dump",
    ]);
  });

  it("penalizes too-bundled clone holder bags", () => {
    const row = analyzeToken(
      token({
        id: "solana:bundle",
        volume1h: 8_000,
        pairCreatedAt: Date.now() - 20 * 60_000,
      }),
      emptyBrain(),
      {
        level: "caution",
        score: 12,
        flags: [],
        stats: { tooBundled: true, bundleWallets: 8, bundledPct: 22 },
        sources: ["RugCheck"],
      },
    );
    expect(row.notes.some((note) => /too bundled/i.test(note.text))).toBe(true);
  });

  it("indexes analysis once and groups heat lists from that map", () => {
    const brain = emptyBrain();
    const dump = token({
      id: "solana:dump2",
      change5m: -22,
      change1h: -40,
      buys1h: 8,
      sells1h: 40,
      volume1h: 9_000,
    });
    const fresh = token({
      id: "solana:fresh2",
      stage: "launching",
      pairCreatedAt: Date.now() - 8 * 60_000,
    });
    const map = indexAnalyses([dump, fresh], brain);
    expect(map.size).toBe(2);
    const lists = listsByHeat([dump, fresh], map);
    expect(lists.trap.map((row) => row.id)).toEqual(["solana:dump2"]);
    expect(lists.hot).toHaveLength(0);
  });
});
