import { describe, expect, it } from "vitest";
import { attachXTrail, hasXTrail, pickRadarTokens, pickTwitterUrl } from "./social";
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

  it("sorts radar by likes then the 1h rip", () => {
    const quiet = token({ id: "solana:a", tweetLikes: 2, change1h: 10 });
    const ripped = token({ id: "solana:b", twitterUrl: "https://x.com/x", change1h: 220, volume1h: 600_000 });
    const viral = token({ id: "solana:c", twitterUrl: "https://x.com/y", tweetLikes: 400, change1h: 20 });
    expect(pickRadarTokens([quiet, ripped, viral]).map((row) => row.id)).toEqual([
      "solana:c",
      "solana:b",
    ]);
  });
});
