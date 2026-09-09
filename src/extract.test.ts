import { describe, expect, it } from "vitest";
import { extractMentions } from "./extract";

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
  });

  it("skips wrapped SOL", () => {
    const mentions = extractMentions("pair vs So11111111111111111111111111111111111111112");
    expect(mentions.solana).toEqual([]);
  });
});
