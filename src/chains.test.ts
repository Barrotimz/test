import { describe, expect, it } from "vitest";
import { geckoNetworkId, normalizeChain } from "./chains";

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
