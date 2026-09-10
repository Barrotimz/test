import { describe, expect, it } from "vitest";
import { launchpadFromDex } from "./launchpads";

describe("launchpadFromDex", () => {
  it("maps known pads including Four.meme, Bags, Moonshot, and Bonk", () => {
    expect(launchpadFromDex("four-meme", "bsc")).toBe("Four.meme");
    expect(launchpadFromDex("bags", "solana")).toBe("Bags");
    expect(launchpadFromDex("moonshot", "solana")).toBe("Moonshot");
    expect(launchpadFromDex("letsbonk", "solana")).toBe("Bonk");
    expect(launchpadFromDex("raydium-launchlab", "solana")).toBe("Bonk");
    expect(launchpadFromDex("pump-fun", "solana")).toBe("pump.fun");
  });

  it("labels Robinhood pools even without a dex id", () => {
    expect(launchpadFromDex(undefined, "robinhood")).toBe("Robinhood");
  });
});
