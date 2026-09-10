import { describe, expect, it } from "vitest";
import type { TrackedToken } from "./types";
import {
  isOwnAccount,
  pickVamped,
  readVamp,
  tweetFreshLabel,
  vampScore,
  vampTier,
} from "./vamp";

const token = (extra: Partial<TrackedToken> = {}): TrackedToken => ({
  id: "solana:mint",
  chainId: "solana",
  tokenAddress: "mint",
  name: "Plumber",
  symbol: "Plumber",
  dexUrl: "https://dexscreener.com",
  source: "launch",
  ...extra,
});

describe("isOwnAccount", () => {
  it("matches a promo handle built off the ticker", () => {
    expect(isOwnAccount("plumbercoin", "Plumber", "Plumber")).toBe(true);
    expect(isOwnAccount("PLUMBER_SOL", "Plumber", "Plumber")).toBe(true);
  });

  it("treats an unrelated account as outside", () => {
    expect(isOwnAccount("polymarket", "Plumber", "Plumber")).toBe(false);
  });

  it("ignores tickers too short to match on", () => {
    expect(isOwnAccount("ai", "AI", "AI")).toBe(false);
  });
});

describe("readVamp", () => {
  it("flags a coin riding an outside account", () => {
    const read = readVamp(
      token({ twitterHandle: "polymarket", twitterFollowers: 1_200_000, tweetLikes: 900 }),
    );
    expect(read.origin).toBe("outside");
    expect(read.tier).toBe("major");
    expect(read.vamped).toBe(true);
    expect(read.label).toContain("@polymarket");
  });

  it("does not flag the coin's own promo account", () => {
    const read = readVamp(
      token({ twitterHandle: "plumbercoin", twitterFollowers: 400_000, tweetLikes: 900 }),
    );
    expect(read.origin).toBe("own");
    expect(read.vamped).toBe(false);
  });

  it("stays quiet until the post has been read", () => {
    expect(readVamp(token({ twitterHandle: "polymarket" })).origin).toBe("none");
  });

  it("does not call a tiny outside account a vamp", () => {
    const read = readVamp(
      token({ twitterHandle: "somekid", twitterFollowers: 120, tweetLikes: 3 }),
    );
    expect(read.origin).toBe("outside");
    expect(read.vamped).toBe(false);
  });
});

describe("vampTier", () => {
  it("buckets by reach", () => {
    expect(vampTier(2_000_000)).toBe("major");
    expect(vampTier(250_000)).toBe("notable");
    expect(vampTier(20_000)).toBe("small");
    expect(vampTier(900)).toBe("none");
  });
});

describe("vampScore", () => {
  const now = 1_000_000_000_000;

  it("ranks a big outside account over the coin's own account", () => {
    const outside = token({ twitterHandle: "polymarket", twitterFollowers: 1_200_000, tweetLikes: 900 });
    const own = token({ twitterHandle: "plumbercoin", twitterFollowers: 1_200_000, tweetLikes: 900 });
    expect(vampScore(outside, now)).toBeGreaterThan(vampScore(own, now));
  });

  it("ranks a brand new post over a stale one", () => {
    const base = { twitterHandle: "polymarket", twitterFollowers: 1_200_000, tweetLikes: 900 };
    const fresh = token({ ...base, tweetAt: now - 60_000 });
    const stale = token({ ...base, tweetAt: now - 5 * 24 * 3_600_000 });
    expect(vampScore(fresh, now)).toBeGreaterThan(vampScore(stale, now));
  });
});

describe("tweetFreshLabel", () => {
  const now = 1_000_000_000_000;

  it("labels post age", () => {
    expect(tweetFreshLabel(token({ tweetAt: now - 30_000 }), now)).toBe("POST <1m");
    expect(tweetFreshLabel(token({ tweetAt: now - 4 * 60_000 }), now)).toBe("POST 4m");
    expect(tweetFreshLabel(token({ tweetAt: now - 3 * 3_600_000 }), now)).toBe("POST 3h");
  });

  it("is undefined without a post time", () => {
    expect(tweetFreshLabel(token(), now)).toBeUndefined();
  });
});

describe("pickVamped", () => {
  it("keeps only outside-account coins, hottest first", () => {
    const big = token({
      id: "big",
      twitterHandle: "polymarket",
      twitterFollowers: 1_200_000,
      tweetLikes: 900,
    });
    const mid = token({
      id: "mid",
      twitterHandle: "someblog",
      twitterFollowers: 40_000,
      tweetLikes: 20,
    });
    const own = token({
      id: "own",
      twitterHandle: "plumbercoin",
      twitterFollowers: 900_000,
      tweetLikes: 50,
    });
    expect(pickVamped([mid, own, big]).map((item) => item.id)).toEqual(["big", "mid"]);
  });
});
