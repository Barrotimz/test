import { describe, expect, it } from "vitest";
import { bondingPct } from "./api";
import { eventsForNew, mergeLists, overlayLive, pushEvents, rotateSlice } from "./merge";
import type { FeedEvent, TrackedToken } from "./types";

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

  it("keeps tweet likes when a later poll has no socials yet", () => {
    const first = mergeLists([], [token("a", { tweetLikes: 420, twitterFollowers: 9000 })]);
    const second = mergeLists(first, [token("a", { marketCap: 12_000 })]);
    expect(second[0].tweetLikes).toBe(420);
    expect(second[0].twitterFollowers).toBe(9000);
    expect(second[0].marketCap).toBe(12_000);
  });

  it("returns the same list when a later poll has no new fields", () => {
    const first = mergeLists([], [token("a", { marketCap: 12_000, change1h: 8 })]);
    const second = mergeLists(first, [token("a", { marketCap: 12_000, change1h: 8, seenAt: Date.now() })]);
    expect(second).toBe(first);
  });

  it("emits feed events only for first sightings", () => {
    const known = new Set(["a"]);
    const events = eventsForNew([token("a"), token("b", { symbol: "NEW", stage: "launching" })], known);
    expect(events).toHaveLength(1);
    expect(events[0].text).toContain("$NEW");
  });

  it("emits one event per mint when a feed reprints the same token", () => {
    const events = eventsForNew([token("a"), token("a"), token("a")], new Set());
    expect(events).toHaveLength(1);
  });

  it("does not emit two tape chips for the same mint in one batch", () => {
    const events = eventsForNew([token("dup", { symbol: "DUP" }), token("dup", { symbol: "DUP" })], new Set());
    expect(events).toHaveLength(1);
  });
});

describe("pushEvents", () => {
  const event = (id: string, at = 1): FeedEvent => ({ id, at, text: id });

  it("drops repeats already on the tape", () => {
    const tape = pushEvents([event("a")], [event("a"), event("b")]);
    expect(tape.map((item) => item.id)).toEqual(["b", "a"]);
  });

  it("keeps the tape inside its cap", () => {
    const tape = pushEvents(
      Array.from({ length: 24 }, (_, i) => event(`old-${i}`)),
      [event("new")],
    );
    expect(tape).toHaveLength(24);
    expect(tape[0].id).toBe("new");
  });

  it("returns the same tape when nothing is new", () => {
    const prev = [event("a")];
    expect(pushEvents(prev, [event("a")])).toBe(prev);
  });
});

describe("overlayLive", () => {
  it("paints the merged live bag so twitter and viewers survive a gecko reprint", () => {
    const cards = [token("a", { marketCap: 9_000, source: "trending" })];
    const live = [token("a", { twitterUrl: "https://x.com/foo/status/1", viewers: 40, livestream: true, marketCap: 11_000 })];
    const painted = overlayLive(cards, live);
    expect(painted[0].twitterUrl).toContain("/status/1");
    expect(painted[0].viewers).toBe(40);
    expect(painted[0].marketCap).toBe(11_000);
  });
});

describe("rotateSlice", () => {
  it("pages through a list and wraps", () => {
    expect(rotateSlice(["a", "b", "c", "d"], 0, 2)).toEqual(["a", "b"]);
    expect(rotateSlice(["a", "b", "c", "d"], 2, 2)).toEqual(["c", "d"]);
    expect(rotateSlice(["a", "b", "c", "d"], 3, 2)).toEqual(["d", "a"]);
  });
});

describe("bondingPct", () => {
  it("maps 85 SOL reserves to 100%", () => {
    expect(bondingPct(85e9)).toBe(100);
    expect(bondingPct(42.5e9)).toBe(50);
  });
});
