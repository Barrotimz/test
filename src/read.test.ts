import { describe, expect, it } from "vitest";
import { pulseStage, summarizeCreatorTokens, tapeQuality, twitterAgeChip } from "./read";
import type { TrackedToken } from "./types";

const token = (extra: Partial<TrackedToken> = {}): TrackedToken => ({
  id: extra.id ?? "solana:a",
  chainId: "solana",
  tokenAddress: "a",
  name: "A",
  symbol: "A",
  dexUrl: "https://pump.fun",
  source: "launch",
  ...extra,
});

describe("pulseStage", () => {
  it("maps bonding coins the way Axiom Pulse does", () => {
    expect(pulseStage(token({ stage: "launching", bondingPct: 12 }))).toBe("new");
    expect(pulseStage(token({ stage: "launching", bondingPct: 88 }))).toBe("stretch");
    expect(pulseStage(token({ stage: "graduated", bondingPct: 100 }))).toBe("migrated");
  });
});

describe("summarizeCreatorTokens", () => {
  it("flags a serial launcher when most prior coins are dead", () => {
    const tape = summarizeCreatorTokens([
      { marketCap: 800 },
      { marketCap: 40_000 },
      { marketCap: 12_000 },
      { marketCap: 90 },
      { marketCap: 80_000 },
      { marketCap: 50_000 },
    ]);
    expect(tape.launches).toBe(6);
    expect(tape.dead).toBe(2);
    expect(tape.serialLauncher).toBe(false);

    const serial = summarizeCreatorTokens(
      Array.from({ length: 10 }, () => ({ marketCap: 500 })).concat([{ marketCap: 900 }]),
    );
    expect(serial.serialLauncher).toBe(true);
    expect(serial.dead).toBe(11);
  });
});

describe("tapeQuality", () => {
  it("calls out wash-looking unique-buyer share and ATH drawdown", () => {
    const wash = tapeQuality(
      token({ buys1h: 80, buyers1h: 3, volume1h: 20_000, marketCap: 40_000, athMarketCap: 90_000 }),
    );
    expect(wash.washy).toBe(true);
    expect(wash.athDrawdown).toBeGreaterThan(40);
    const organic = tapeQuality(token({ buys1h: 20, buyers1h: 12, volume1h: 15_000, marketCap: 12_000 }));
    expect(organic.washy).toBe(false);
    expect(organic.uniqueShare).toBeGreaterThan(0.5);
  });
});

describe("twitterAgeChip", () => {
  it("shortens an aged X account", () => {
    const now = Date.parse("Tue Sep 10 00:00:00 +0000 2026");
    const joined = Date.parse("Tue Jun 02 20:12:29 +0000 2009");
    expect(twitterAgeChip(joined, now)).toMatch(/^X /);
  });
});
