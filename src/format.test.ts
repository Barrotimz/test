import { describe, expect, it } from "vitest";
import { coinAgeBucket, coinAgeLabel, toMillis, tweetInteractions } from "./format";

describe("tweetInteractions", () => {
  it("sums likes, RTs, replies, quotes, and bookmarks", () => {
    expect(
      tweetInteractions({
        tweetLikes: 100,
        tweetRetweets: 20,
        tweetReplies: 8,
        tweetQuotes: 5,
        tweetBookmarks: 7,
      }),
    ).toBe(140);
  });

  it("stays empty when no tweet stats exist", () => {
    expect(tweetInteractions({})).toBeUndefined();
  });
});

describe("coin age", () => {
  const now = 1_780_000_000_000;

  it("reads Dex millisecond timestamps", () => {
    expect(toMillis(now - 5 * 60_000)).toBe(now - 5 * 60_000);
    expect(coinAgeLabel(now - 12 * 60_000, now)).toBe("12m old");
    expect(coinAgeBucket(now - 12 * 60_000, now)).toBe("fresh");
  });

  it("labels hours, days, and older coins", () => {
    expect(coinAgeLabel(now - 5 * 60 * 60_000, now)).toBe("5h old");
    expect(coinAgeBucket(now - 5 * 60 * 60_000, now)).toBe("new");
    expect(coinAgeLabel(now - 3 * 24 * 60 * 60_000, now)).toBe("3d old");
    expect(coinAgeBucket(now - 3 * 24 * 60 * 60_000, now)).toBe("recent");
    expect(coinAgeLabel(now - 80 * 24 * 60 * 60_000, now)).toBe("2mo old");
    expect(coinAgeBucket(now - 80 * 24 * 60 * 60_000, now)).toBe("aged");
  });
});
