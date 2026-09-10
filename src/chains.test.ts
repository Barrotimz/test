import { describe, expect, it } from "vitest";
import { geckoNetworkId, normalizeChain, normalizeTokenAddress, tokenId } from "./chains";

describe("geckoNetworkId", () => {
  it("prefers the relationship id", () => {
    expect(geckoNetworkId("solana_abc", "bsc")).toBe("bsc");
  });

  it("reads multi-part gecko prefixes", () => {
    expect(geckoNetworkId("polygon_pos_0xabc")).toBe("polygon_pos");
    expect(normalizeChain(geckoNetworkId("polygon_pos_0xabc"))).toBe("polygon");
    expect(geckoNetworkId("robinhood_0x1674d09f")).toBe("robinhood");
    expect(geckoNetworkId("sui-network_0x1")).toBe("sui-network");
  });
});

describe("token identity", () => {
  it("lowercases EVM addresses and leaves Solana mints alone", () => {
    expect(normalizeTokenAddress("bsc", "0xABCDef0123456789ABCDef0123456789ABCDef01")).toBe(
      "0xabcdef0123456789abcdef0123456789abcdef01",
    );
    expect(tokenId("eth", "0xAbC")).toBe("ethereum:0xabc");
    expect(normalizeTokenAddress("solana", "G8dmGbWTEFeK8Xmj5YaukwNsAKXCDEQfm11d5987crmZ")).toBe(
      "G8dmGbWTEFeK8Xmj5YaukwNsAKXCDEQfm11d5987crmZ",
    );
  });
});
