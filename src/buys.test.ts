import { describe, expect, it } from "vitest";
import {
  estimateBuysInWindow,
  pickBuyTape,
  recordBuySample,
  scaleBuys5mTo2m,
  stampBuys2m,
} from "./buys";
import type { TrackedToken } from "./types";

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

describe("scaleBuys5mTo2m", () => {
  it("scales a flat 5m tape to two minutes", () => {
    expect(scaleBuys5mTo2m(100)).toBe(40);
    expect(scaleBuys5mTo2m(undefined)).toBeUndefined();
  });
});

describe("estimateBuysInWindow", () => {
  it("tracks a steady 5m print as ~40 buys per 2 minutes", () => {
    const start = 1_000_000;
    let samples = recordBuySample([], 100, start);
    for (let i = 1; i <= 12; i += 1) {
      samples = recordBuySample(samples, 100, start + i * 10_000);
    }
    const estimated = estimateBuysInWindow(samples, start + 120_000);
    expect(estimated).toBeGreaterThanOrEqual(35);
    expect(estimated).toBeLessThanOrEqual(45);
  });

  it("jumps when the 5m buy count spikes", () => {
    const start = 2_000_000;
    const samples = recordBuySample(recordBuySample([], 20, start), 80, start + 10_000);
    expect(estimateBuysInWindow(samples, start + 10_000)).toBeGreaterThan(50);
  });
});

describe("pickBuyTape", () => {
  it("sorts coins with the most 2-minute buys first", () => {
    const ranked = pickBuyTape([
      token("slow", { buys5m: 10 }),
      token("hot", { buys2m: 90, buys5m: 40 }),
      token("mid", { buys2m: 20, buys5m: 80 }),
      token("none", { buys1h: 400 }),
    ]);
    expect(ranked.map((row) => row.id)).toEqual(["hot", "mid", "slow"]);
  });
});

describe("stampBuys2m", () => {
  it("writes a 2m estimate onto the token", () => {
    const samples = new Map();
    const stamped = stampBuys2m(token("a", { buys5m: 50 }), samples, 10);
    expect(stamped.buys2m).toBe(20);
    expect(samples.get("a")).toHaveLength(1);
  });
});
