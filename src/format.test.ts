import { describe, expect, it } from "vitest";
import { coinAgeBucket, coinAgeLabel, toMillis } from "./format";

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
