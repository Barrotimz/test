import { describe, expect, it } from "vitest";
import { extractMentions, firstTweetId } from "./extract";

describe("extractMentions", () => {
  it("pulls tickers, handles, and contract addresses from a tweet", () => {
    const tweet = [
      "just aped $KURO mentioned by @kurothecatsol",
      "ca: 5CwpF2UsgWvNKeDQaKZPjQCd6jM4K32yNVRVCuh1pump",
      "also evm 0x2B9D607cc0Be0742106d8F3F1EC09228a14fECC0",
    ].join(" ");

    const mentions = extractMentions(tweet);
    expect(mentions.tickers).toContain("KURO");
    expect(mentions.handles).toContain("kurothecatsol");
    expect(mentions.solana).toContain("5CwpF2UsgWvNKeDQaKZPjQCd6jM4K32yNVRVCuh1pump");
    expect(mentions.evm).toContain("0x2b9d607cc0be0742106d8f3f1ec09228a14fecc0");
    expect(mentions.tweetIds).toEqual([]);
  });

  it("pulls tweet ids from x.com links", () => {
    const mentions = extractMentions(
      "look https://x.com/jack/status/20 and https://twitter.com/foo/status/1234567890",
    );
    expect(mentions.tweetIds).toEqual(["20", "1234567890"]);
  });

  it("also reads i/status and bare /status links", () => {
    expect(extractMentions("https://x.com/i/status/555").tweetIds).toEqual(["555"]);
    expect(firstTweetId("x.com/status/777")).toBe("777");
  });

  it("finds the first status id across mixed social fields", () => {
    expect(
      firstTweetId("https://x.com/just_anon_sf/status/2097848630296092846?s=20", "https://otcdesks.cash"),
    ).toBe("2097848630296092846");
  });

  it("skips wrapped SOL", () => {
    const mentions = extractMentions("pair vs So11111111111111111111111111111111111111112");
    expect(mentions.solana).toEqual([]);
  });
});
