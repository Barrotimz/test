import { describe, expect, it } from "vitest";
import { pumpCreateToToken } from "./pumpStream";

describe("pumpCreateToToken", () => {
  it("maps a PumpPortal create into a Fresh-tab launch card", () => {
    const token = pumpCreateToToken(
      {
        mint: "G8dmGbWTEFeK8Xmj5YaukwNsAKXCDEQfm11d5987crmZ",
        name: "Plumber",
        symbol: "Plumber",
        txType: "create",
        traderPublicKey: "dev111",
      },
      1_780_000_000_000,
    );
    expect(token?.id).toBe("solana:G8dmGbWTEFeK8Xmj5YaukwNsAKXCDEQfm11d5987crmZ");
    expect(token?.launchpad).toBe("pump.fun");
    expect(token?.stage).toBe("launching");
    expect(token?.source).toBe("launch");
    expect(token?.pairCreatedAt).toBe(1_780_000_000_000);
  });

  it("ignores non-create trade ticks and mint-less greetings", () => {
    expect(pumpCreateToToken({ txType: "buy", mint: "abc" })).toBeUndefined();
    expect(pumpCreateToToken({ message: "subscribed" } as never)).toBeUndefined();
  });
});
