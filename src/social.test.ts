import { describe, expect, it } from "vitest";
import {
  attachXTrail,
  hasXTrail,
  isTapeOpportunity,
  pickRadarTokens,
  pickTwitterUrl,
  radarQuerySlice,
  radarSearchQueries,
  PLUMBER_CA,
} from "./social";
import type { TrackedToken } from "./types";

const token = (extra: Partial<TrackedToken> = {}): TrackedToken => ({
  id: extra.id ?? "solana:plumber",
  chainId: "solana",
  tokenAddress: extra.tokenAddress ?? "G8dmGbWTEFeK8Xmj5YaukwNsAKXCDEQfm11d5987crmZ",
  name: extra.name ?? "Plumber",
  symbol: extra.symbol ?? "Plumber",
  dexUrl: "https://dexscreener.com/solana/g8",
  source: extra.source ?? "newpool",
  ...extra,
});

describe("twitter radar trail", () => {
  it("treats a Dex pair tweet URL as an X trail — the Plumber miss", () => {
    const url = "https://x.com/polymarket/status/2097871648867172659";
    expect(pickTwitterUrl([{ type: "twitter", url }])).toBe(url);
    const attached = attachXTrail(token({ twitterUrl: url }));
    expect(attached.tweetUrl).toContain("2097871648867172659");
    expect(attached.twitterHandle).toBe("polymarket");
    expect(hasXTrail(token({ twitterUrl: url }))).toBe(true);
    expect(hasXTrail(token({}))).toBe(false);
  });

  it("reads untyped x.com links and @handles in the description", () => {
    expect(pickTwitterUrl([{ url: "https://x.com/someone" }])).toBe("https://x.com/someone");
    expect(hasXTrail(token({ description: "live https://x.com/foo/status/99" }))).toBe(true);
    expect(hasXTrail(token({ description: "posted by @plumbercoin" }))).toBe(true);
  });

  it("puts a Plumber-shaped rip on radar even before the tweet is attached", () => {
    const now = Date.now();
    const plumber = token({
      id: "solana:g8",
      change1h: 225,
      volume1h: 637_000,
      volume5m: 48_000,
      pairCreatedAt: now - 40 * 60_000,
    });
    const dead = token({ id: "solana:dead", symbol: "DEAD", change1h: 2, volume1h: 200 });
    expect(isTapeOpportunity(plumber, now)).toBe(true);
    expect(pickRadarTokens([plumber, dead], now).map((row) => row.id)).toEqual(["solana:g8"]);
    expect(radarSearchQueries([plumber])).toEqual(expect.arrayContaining(["Plumber", "Polymarket"]));
  });

  it("picks a tweet url parked on a Dex website field over a bare handle", () => {
    expect(
      pickTwitterUrl(
        [{ type: "twitter", url: "https://x.com/plumbercoin" }],
        "https://x.com/polymarket/status/2097871648867172659",
      ),
    ).toContain("2097871648867172659");
  });

  it("mixes a status-url hunt, ticker, and CA into each Dex search slice", () => {
    const now = Date.now();
    const plumber = token({
      change1h: 225,
      volume1h: 637_000,
      pairCreatedAt: now - 40 * 60_000,
    });
    const slice = radarQuerySlice([plumber], [], 0);
    expect(slice.length).toBeLessThanOrEqual(4);
    expect(slice.some((query) => query.includes("status"))).toBe(true);
    expect(slice).toEqual(expect.arrayContaining([plumber.symbol, plumber.tokenAddress]));
  });

  it("keeps the Plumber CA in the bait/meta slot when passed as extra", () => {
    const slices = [0, 1, 2, 3, 4, 5, 6, 7].map((tick) =>
      radarQuerySlice([token({ symbol: "AAA", tokenAddress: "mintAAA111111111111111111111111111111" })], [PLUMBER_CA], tick),
    );
    expect(slices.some((slice) => slice.includes(PLUMBER_CA))).toBe(true);
    expect(slices.every((slice) => slice.length <= 4)).toBe(true);
    expect(slices.some((slice) => slice.some((query) => query.includes("status")))).toBe(true);
  });
});
