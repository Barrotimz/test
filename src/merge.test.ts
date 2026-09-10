import { describe, expect, it } from "vitest";
import { bondingPct } from "./api";
import { eventsForNew, mergeLists } from "./merge";
import type { TrackedToken } from "./types";

const token = (id: string, extra: Partial<TrackedToken> = {}): TrackedToken => ({
  id,
  chainId: "solana",
  tokenAddress: id,
  name: id,
  symbol: id,
  dexUrl: "https://pump.fun",
  source: "launch",
  ...extra,
});

describe("mergeLists", () => {
  it("keeps prior tokens when a later poll is empty", () => {
    const first = mergeLists([], [token("a")]);
    const second = mergeLists(first, []);
    expect(second.map((item) => item.id)).toEqual(["a"]);
  });

  it("emits feed events only for first sightings", () => {
    const known = new Set(["a"]);
    const events = eventsForNew([token("a"), token("b", { symbol: "NEW", stage: "launching" })], known);
    expect(events).toHaveLength(1);
    expect(events[0].text).toContain("$NEW");
  });
});

describe("bondingPct", () => {
  it("maps 85 SOL reserves to 100%", () => {
    expect(bondingPct(85e9)).toBe(100);
    expect(bondingPct(42.5e9)).toBe(50);
  });
});
