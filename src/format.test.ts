import { describe, expect, it } from "vitest";
import { authLabel, coinAgeBucket, coinAgeLabel, padreTradeUrl, sharePct, toMillis, tweetInteractions } from "./format";

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

describe("padreTradeUrl", () => {
  it("opens the exact coin on Padre for Solana, BNB, ETH, and Base", () => {
    expect(padreTradeUrl("solana", "Abc123pump")).toBe("https://trade.padre.gg/trade/solana/Abc123pump");
    expect(padreTradeUrl("bsc", "0xabc")).toBe("https://trade.padre.gg/trade/bsc/0xabc");
    expect(padreTradeUrl("bnb", "0xabc")).toBe("https://trade.padre.gg/trade/bsc/0xabc");
    expect(padreTradeUrl("ethereum", "0xdef")).toBe("https://trade.padre.gg/trade/ethereum/0xdef");
    expect(padreTradeUrl("base", "0x111")).toBe("https://trade.padre.gg/trade/base/0x111");
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

describe("sharePct", () => {
  it("formats holder shares without a plus sign", () => {
    expect(sharePct(23.4)).toBe("23%");
    expect(sharePct(3.2)).toBe("3.2%");
    expect(sharePct(undefined)).toBe("—");
    expect(authLabel(true)).toBe("Yes");
    expect(authLabel(false)).toBe("No");
    expect(authLabel(null)).toBe("—");
  });
});
