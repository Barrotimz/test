import type { FeedEvent, TrackedToken } from "./types";

export function defined<T extends Record<string, unknown>>(value: T): Partial<T> {
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) next[key] = item;
  }
  return next as Partial<T>;
}

const IGNORE_MERGE = new Set(["seenAt"]);

export function tokenNeedsMerge(prev: TrackedToken, incoming: TrackedToken): boolean {
  for (const [key, value] of Object.entries(incoming) as [keyof TrackedToken, TrackedToken[keyof TrackedToken]][]) {
    if (value === undefined || IGNORE_MERGE.has(key)) continue;
    if (prev[key] !== value) return true;
  }
  return false;
}

export function mergeToken(prev: TrackedToken | undefined, incoming: TrackedToken): TrackedToken {
  if (!prev) return { ...incoming, seenAt: incoming.seenAt ?? Date.now() };
  if (!tokenNeedsMerge(prev, incoming)) return prev;
  return {
    ...prev,
    ...defined(incoming),
    seenAt: prev.seenAt ?? incoming.seenAt ?? Date.now(),
    source: incoming.source === "search" ? incoming.source : prev.source === "launch" && incoming.source !== "launch" ? incoming.source : incoming.source || prev.source,
  };
}

export function mergeLists(prev: TrackedToken[], incoming: TrackedToken[], cap = 300): TrackedToken[] {
  if (incoming.length === 0) return prev;
  const map = new Map(prev.map((token) => [token.id, token]));
  let changed = incoming.length > 0 && prev.length === 0;
  for (const token of incoming) {
    const before = map.get(token.id);
    const merged = mergeToken(before, token);
    if (merged !== before) {
      changed = true;
      map.set(token.id, merged);
    }
  }
  if (!changed && map.size === prev.length) return prev;
  const merged = [...map.values()].sort(
    (a, b) => (b.pairCreatedAt ?? b.seenAt ?? 0) - (a.pairCreatedAt ?? a.seenAt ?? 0),
  );
  return merged.slice(0, cap);
}

export function eventsForNew(incoming: TrackedToken[], known: Set<string>, at = Date.now()): FeedEvent[] {
  return incoming
    .filter((token) => !known.has(token.id))
    .slice(0, 12)
    .map((token) => ({
      id: `${token.id}:${at}`,
      at,
      text: `${token.stage === "launching" ? "LAUNCH" : "NEW"} $${token.symbol} · ${token.chainId}`,
    }));
}
