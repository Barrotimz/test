import { compactUsd, pairAgeMs, tweetInteractions } from "./format";
import { matchingRipMeta } from "./meta";
import type { TrackedToken } from "./types";

export type RunnerLesson = {
  id: string;
  symbol: string;
  chainId: string;
  launchpad?: string;
  at: number;
  why: string[];
  peakChange: number;
  peakMcap?: number;
  likes?: number;
  interactions?: number;
  followers?: number;
  ageMin?: number;
  bondingPct?: number;
  buys1h?: number;
  livestream?: boolean;
  tier?: "rip" | "millions";
};

export type RunnerBrain = {
  lessons: RunnerLesson[];
  studied: number;
};

export type RunnerCall = {
  score: number;
  level: "watch" | "setup" | "runner";
  reasons: string[];
};

export function emptyBrain(): RunnerBrain {
  return { lessons: [], studied: 0 };
}

export function runnerWhy(token: TrackedToken): string[] {
  const why: string[] = [];
  const likes = token.tweetLikes ?? 0;
  const interactions = tweetInteractions(token) ?? 0;
  const change = Math.max(token.change5m ?? 0, token.change1h ?? 0, token.change24h ?? 0);
  const ageMs = pairAgeMs(token.pairCreatedAt);
  const buys = token.buys1h ?? 0;
  const sells = token.sells1h ?? 0;

  if (likes >= 400) why.push(`${likes} likes on the attached X post`);
  else if (likes >= 40) why.push(`${likes} likes — post was already moving`);
  if (interactions >= 80) why.push(`${interactions} total X interactions`);
  if ((token.twitterFollowers ?? 0) >= 25_000) {
    why.push(`${token.twitterFollowers} followers on the poster`);
  }
  if (ageMs != null && ageMs < 60 * 60_000) why.push("ripped while the pair was still under 1 hour old");
  else if (ageMs != null && ageMs < 6 * 60 * 60_000) why.push("moved in the first 6 hours");
  if ((token.bondingPct ?? 0) >= 70) why.push(`bonding curve at ${token.bondingPct}%`);
  if (token.livestream) why.push("had a live stream on");
  if (token.kingOfHill) why.push("hit king of the hill");
  if ((token.boostAmount ?? 0) >= 30) why.push("paid DexScreener boosts");
  if (buys > 0 && buys >= sells * 1.6) why.push(`buy pressure ${buys} buys vs ${sells} sells in 1h`);
  if (token.launchpad) why.push(`launched on ${token.launchpad}`);
  if (token.chainId === "robinhood") why.push("Robinhood listing — same venue as PONS-class runners");
  if ((token.marketCap ?? 0) >= 1_000_000) {
    why.push(`ran to ${compactUsd(token.marketCap)} mcap, far above a normal launch`);
  }
  if ((token.volume24h ?? 0) >= 1_000_000) why.push(`${compactUsd(token.volume24h)} 24h volume`);
  if (change >= 80) why.push(`${change.toFixed(0)}% candle`);
  if (!why.length) why.push("price and flow expanded without a clear social tell");
  return why.slice(0, 7);
}

export function whyOutperformed(token: TrackedToken, pack: TrackedToken[]): string[] {
  if (pack.length < 3) return [];
  const extra: string[] = [];
  const mcap = token.marketCap ?? 0;
  const packMcap = median(pack.map((row) => row.marketCap).filter((n): n is number => n != null && n > 0));
  const packLikes = median(pack.map((row) => row.tweetLikes).filter((n): n is number => n != null && n > 0));
  const packVol = median(pack.map((row) => row.volume24h).filter((n): n is number => n != null && n > 0));
  if (mcap >= 1_000_000 && packMcap && mcap > packMcap * 20) {
    extra.push(`mcap ${compactUsd(mcap)} vs pack ~${compactUsd(packMcap)} — left the field behind`);
  }
  if ((token.tweetLikes ?? 0) > 0 && packLikes && (token.tweetLikes ?? 0) >= packLikes * 3) {
    extra.push(`likes ${token.tweetLikes} vs typical ~${Math.round(packLikes)} on the same board`);
  }
  if ((token.volume24h ?? 0) > 0 && packVol && (token.volume24h ?? 0) >= packVol * 8) {
    extra.push("volume dwarfed the rest of the tape");
  }
  if (token.twitterHandle && pack.filter((row) => row.twitterHandle).length < pack.length / 3) {
    extra.push("had a real X account while most launches did not");
  }
  return extra;
}

export function isMillionRunner(token: TrackedToken): boolean {
  return (token.marketCap ?? 0) >= 1_000_000;
}

export function isMajorRunner(token: TrackedToken): boolean {
  const change = Math.max(token.change5m ?? 0, token.change1h ?? 0, token.change24h ?? 0);
  const mcap = token.marketCap ?? 0;
  const likes = token.tweetLikes ?? 0;
  const vol = token.volume1h ?? token.volume24h ?? 0;
  if (isMillionRunner(token)) return true;
  if (change >= 80) return true;
  if (change >= 35 && mcap >= 40_000) return true;
  if (likes >= 400 && change >= 12) return true;
  if ((token.bondingPct ?? 0) >= 75 && change >= 20) return true;
  if (mcap > 0 && vol / mcap >= 1.5 && change >= 25) return true;
  return false;
}

export function snapshotLesson(token: TrackedToken, at = Date.now()): RunnerLesson | null {
  if (!isMajorRunner(token)) return null;
  const ageMs = pairAgeMs(token.pairCreatedAt, at);
  return {
    id: token.id,
    symbol: token.symbol,
    chainId: token.chainId,
    launchpad: token.launchpad,
    at,
    why: runnerWhy(token),
    peakChange: Math.max(token.change5m ?? 0, token.change1h ?? 0, token.change24h ?? 0),
    peakMcap: token.marketCap,
    likes: token.tweetLikes,
    interactions: tweetInteractions(token),
    followers: token.twitterFollowers,
    ageMin: ageMs != null ? Math.round(ageMs / 60_000) : undefined,
    bondingPct: token.bondingPct,
    buys1h: token.buys1h,
    livestream: token.livestream,
    tier: isMillionRunner(token) ? "millions" : "rip",
  };
}

export function learnFromTokens(brain: RunnerBrain, tokens: TrackedToken[], at = Date.now()): {
  brain: RunnerBrain;
  fresh: RunnerLesson[];
} {
  const next: RunnerBrain = { lessons: [...brain.lessons], studied: brain.studied };
  const fresh: RunnerLesson[] = [];
  for (const token of tokens) {
    const lesson = snapshotLesson(token, at);
    if (!lesson) continue;
    const gap = whyOutperformed(token, tokens);
    if (gap.length) lesson.why = [...gap, ...lesson.why].slice(0, 8);
    const existing = next.lessons.findIndex((row) => row.id === lesson.id);
    if (existing === -1) {
      next.lessons.unshift(lesson);
      next.studied += 1;
      fresh.push(lesson);
    } else if (
      lesson.peakChange > next.lessons[existing].peakChange + 8 ||
      (lesson.peakMcap ?? 0) > (next.lessons[existing].peakMcap ?? 0) * 1.2
    ) {
      next.lessons[existing] = lesson;
    }
  }
  next.lessons.sort((a, b) => (b.peakMcap ?? 0) - (a.peakMcap ?? 0) || b.peakChange - a.peakChange);
  next.lessons = next.lessons.slice(0, 80);
  return { brain: next, fresh };
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function counts(values: (string | undefined)[]): { key: string; n: number }[] {
  const map = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    map.set(value, (map.get(value) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([key, n]) => ({ key, n }))
    .sort((a, b) => b.n - a.n);
}

export function brainInsights(brain: RunnerBrain): string[] {
  if (brain.lessons.length === 0) {
    return ["Watching live. As soon as a coin rips, it gets studied and the next ones get scored against it."];
  }
  const likes = median(brain.lessons.map((row) => row.likes).filter((n): n is number => n != null && n > 0));
  const age = median(brain.lessons.map((row) => row.ageMin).filter((n): n is number => n != null));
  const pads = counts(brain.lessons.map((row) => row.launchpad));
  const chains = counts(brain.lessons.map((row) => row.chainId));
  const live = brain.lessons.filter((row) => row.livestream).length;
  const millions = brain.lessons.filter((row) => row.tier === "millions" || (row.peakMcap ?? 0) >= 1_000_000);
  const lines = [`Studied ${brain.studied} rip${brain.studied === 1 ? "" : "s"}.`];
  if (millions.length) {
    const names = millions.slice(0, 4).map((row) => `$${row.symbol}`).join(", ");
    const top = millions[0];
    lines.push(
      `${millions.length} ran to millions (like ${names}). Top: $${top.symbol} at ${compactUsd(top.peakMcap)}.`,
    );
    lines.push(
      "Those left the pack because of reach (real X account), venue (Robinhood / hot pad), and volume — not just a 5m candle.",
    );
  }
  if (likes != null) lines.push(`Runners usually already had ~${Math.round(likes)} likes on the post.`);
  if (age != null) lines.push(`Typical age when they popped: ~${age}m old.`);
  if (pads[0]) lines.push(`Hottest pad so far: ${pads[0].key} (${pads[0].n}).`);
  if (chains[0]) lines.push(`Hottest chain so far: ${chains[0].key} (${chains[0].n}).`);
  if (live) lines.push(`${live} of the studied rips were livestreaming.`);
  return lines;
}

export function scoreAgainstBrain(token: TrackedToken, brain: RunnerBrain): RunnerCall {
  const reasons: string[] = [];
  let score = 8;
  const likes = token.tweetLikes ?? 0;
  const interactions = tweetInteractions(token) ?? 0;
  const ageMs = pairAgeMs(token.pairCreatedAt);
  const buys = token.buys1h ?? 0;
  const sells = token.sells1h ?? 0;
  const medLikes = median(brain.lessons.map((row) => row.likes).filter((n): n is number => n != null && n > 0));
  const medAge = median(brain.lessons.map((row) => row.ageMin).filter((n): n is number => n != null));
  const topPad = counts(brain.lessons.map((row) => row.launchpad))[0]?.key;
  const topChain = counts(brain.lessons.map((row) => row.chainId))[0]?.key;

  if (likes >= (medLikes ?? 80)) {
    score += 28;
    reasons.push(medLikes ? `likes at or above studied runners (~${Math.round(medLikes)})` : "post already has real likes");
  } else if (likes >= 20) {
    score += 12;
    reasons.push("X post is warming up");
  }
  if (interactions >= 40) {
    score += 10;
    reasons.push("interactions stacking (RTs + replies + quotes)");
  }
  if (ageMs != null && ageMs < 90 * 60_000) {
    score += 14;
    reasons.push("still in the first 90 minutes");
  }
  if (medAge != null && ageMs != null && Math.abs(ageMs / 60_000 - medAge) <= 40) {
    score += 8;
    reasons.push("age matches when past rips happened");
  }
  if (topPad && token.launchpad === topPad) {
    score += 12;
    reasons.push(`same pad as recent rips (${topPad})`);
  }
  if (topChain && token.chainId === topChain) {
    score += 8;
    reasons.push(`same chain as recent rips (${topChain})`);
  }
  if ((token.bondingPct ?? 0) >= 45 && (token.bondingPct ?? 0) < 95) {
    score += 10;
    reasons.push("mid/late bonding — same window past runners used");
  }
  if (buys > 0 && buys >= sells * 1.4) {
    score += 10;
    reasons.push("buyers outnumber sellers");
  }
  if (token.livestream) {
    score += 8;
    reasons.push("live stream on");
  }
  if ((token.twitterFollowers ?? 0) >= 10_000) {
    score += 6;
    reasons.push("poster already has reach");
  }
  if (token.twitterHandle && millionsOnRobinhood(brain) && token.chainId === "robinhood") {
    score += 16;
    reasons.push("Robinhood + X handle — same shape as PONS-class millions");
  }
  if ((token.marketCap ?? 0) >= 80_000 && (token.marketCap ?? 0) < 1_000_000) {
    score += 10;
    reasons.push("already leaving micro-mcap, same first step million-runners took");
  }
  const metaHit = matchingRipMeta(token, brain.lessons);
  if (metaHit) {
    score += 18;
    reasons.push(`same meta as $${metaHit.seedSymbol} (${metaHit.label})`);
  }

  const capped = Math.min(100, score);
  const level: RunnerCall["level"] = capped >= 62 ? "runner" : capped >= 36 ? "setup" : "watch";
  if (!reasons.length) reasons.push("not enough overlap with studied rips yet");
  return { score: capped, level, reasons: reasons.slice(0, 4) };
}

function millionsOnRobinhood(brain: RunnerBrain): boolean {
  return brain.lessons.some(
    (row) => row.chainId === "robinhood" && (row.tier === "millions" || (row.peakMcap ?? 0) >= 1_000_000),
  );
}

export function pickPossibleRunners(tokens: TrackedToken[], brain: RunnerBrain, limit = 24): TrackedToken[] {
  return [...tokens]
    .map((token) => ({ token, call: scoreAgainstBrain(token, brain) }))
    .filter((row) => row.call.level === "setup" || row.call.level === "runner")
    .sort((a, b) => b.call.score - a.call.score)
    .slice(0, limit)
    .map((row) => row.token);
}
