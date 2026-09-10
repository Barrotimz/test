import { describe, expect, it } from "vitest";
import { scoreRugSignals, summarizeHolders } from "./rug";

describe("summarizeHolders", () => {
  it("drops LP/AMM wallets from top 10 and sums insider bags", () => {
    const stats = summarizeHolders(
      [
        { owner: "pool", address: "lp", pct: 40, insider: false },
        { owner: "a", pct: 12, insider: true },
        { owner: "b", pct: 8, insider: false },
        { owner: "c", pct: 5, insider: true },
      ],
      { pool: { type: "AMM" } },
      [{ liquidityB: "lp" }],
    );
    expect(stats.topHolderPct).toBe(12);
    expect(stats.top10Pct).toBe(25);
    expect(stats.insiderPct).toBe(17);
    expect(stats.insiderCount).toBe(2);
  });
});

describe("scoreRugSignals", () => {
  it("marks a clean locked mint as safe", () => {
    const report = scoreRugSignals({
      mintAuthority: false,
      freezeAuthority: false,
      lpLockedPct: 100,
      liquidityUsd: 25_000,
      holderCount: 800,
    });
    expect(report.level).toBe("safe");
    expect(report.score).toBeLessThan(15);
    expect(report.flags.some((flag) => flag.id === "mint" && flag.level === "pass")).toBe(true);
    expect(report.stats.mintAuthority).toBe(false);
    expect(report.stats.freezeAuthority).toBe(false);
    expect(report.stats.holderCount).toBe(800);
  });

  it("fails mint authority and honeypot as danger", () => {
    const minted = scoreRugSignals({ mintAuthority: true, liquidityUsd: 8_000 });
    expect(minted.level).toBe("danger");

    const pot = scoreRugSignals({ honeypot: true });
    expect(pot.level).toBe("danger");
    expect(pot.flags.some((flag) => flag.id === "honeypot")).toBe(true);
  });

  it("treats thin liquidity as caution, not a hard rug", () => {
    const report = scoreRugSignals({
      mintAuthority: false,
      freezeAuthority: false,
      liquidityUsd: 900,
    });
    expect(report.level).toBe("caution");
  });

  it("reads holder shares whether they are fractions or percents", () => {
    const fraction = scoreRugSignals({ topHolderPct: 0.42 * 100 });
    expect(fraction.flags.some((flag) => flag.id === "whale")).toBe(true);
  });
});
