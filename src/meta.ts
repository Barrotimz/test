import { compactUsd, pairAgeMs, pct } from "./format";
import type { TrackedToken } from "./types";

export const TODAY_MS = 24 * 60 * 60 * 1000;

export type MetaFamily = {
  id: string;
  label: string;
  words: string[];
};

export type TodayMeta = {
  id: string;
  label: string;
  themeId: string;
  seedSymbol: string;
  seedId: string;
  seedMcap?: number;
  seedChange?: number;
  seedVolume?: number;
  words: string[];
  why: string;
  headline: string;
};

export type MetaLesson = {
  id: string;
  symbol: string;
  at: number;
  peakMcap?: number;
  tier?: string;
};

export const META_FAMILIES: MetaFamily[] = [
  {
    id: "computer",
    label: "computer / desk",
    words: [
      "laptop",
      "desktop",
      "notebook",
      "macbook",
      "keyboard",
      "mouse",
      "monitor",
      "screen",
      "computer",
      "chromebook",
      "tablet",
      "ipad",
      "iphone",
      "imac",
      "windows",
      "linux",
      "cpu",
      "gpu",
      "wifi",
      "printer",
      "router",
      "webcam",
      "headphone",
      "headset",
      "charger",
      "server",
      "hacker",
      "programmer",
      "coding",
      "office",
      "desk",
      "cubicle",
      "excel",
      "powerpoint",
      "zoom",
      "trackpad",
      "touchpad",
      "dongle",
      "hdmi",
    ],
  },
  {
    id: "animals",
    label: "animals",
    words: [
      "doge",
      "shiba",
      "dog",
      "cat",
      "kitten",
      "puppy",
      "frog",
      "pepe",
      "woof",
      "meow",
      "monkey",
      "ape",
      "bear",
      "bull",
      "wolf",
      "fox",
      "tiger",
      "lion",
      "dragon",
      "duck",
      "chicken",
      "pig",
      "horse",
    ],
  },
  {
    id: "food",
    label: "food",
    words: [
      "pizza",
      "burger",
      "taco",
      "sushi",
      "ramen",
      "coffee",
      "banana",
      "apple",
      "orange",
      "grape",
      "watermelon",
      "hotdog",
      "fries",
      "cookie",
      "cake",
      "cheese",
      "milk",
    ],
  },
  {
    id: "money",
    label: "money",
    words: [
      "cash",
      "money",
      "dollar",
      "rich",
      "bank",
      "gold",
      "silver",
      "diamond",
      "whale",
      "million",
      "billion",
    ],
  },
  {
    id: "cars",
    label: "cars / speed",
    words: ["tesla", "lambo", "ferrari", "porsche", "truck", "motorcycle", "cybertruck"],
  },
];

const FAMILY_INDEX = new Map<string, MetaFamily>();
for (const family of META_FAMILIES) {
  for (const word of family.words) FAMILY_INDEX.set(word, family);
}

export function normalizeMetaText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function tokenWords(token: { symbol: string; name?: string }): string[] {
  const blob = normalizeMetaText(`${token.symbol} ${token.name ?? ""}`);
  const parts = blob.split(/\s+/).filter((part) => part.length >= 2);
  const words = new Set<string>(parts);
  const glued = blob.replace(/\s+/g, "");
  if (glued.length >= 3) words.add(glued);
  return [...words];
}

export function familyForToken(token: { symbol: string; name?: string }): MetaFamily | undefined {
  for (const word of tokenWords(token)) {
    const exact = FAMILY_INDEX.get(word);
    if (exact) return exact;
    for (const [key, family] of FAMILY_INDEX) {
      if (key.length >= 4 && (word.includes(key) || (word.length >= 4 && key.includes(word)))) {
        return family;
      }
    }
  }
  return undefined;
}

function primaryWord(token: { symbol: string; name?: string }): string {
  return tokenWords(token).sort((a, b) => b.length - a.length)[0] ?? normalizeMetaText(token.symbol);
}

function themeOf(token: { symbol: string; name?: string }): { id: string; label: string; words: string[] } {
  const family = familyForToken(token);
  if (family) return family;
  const word = primaryWord(token);
  return { id: `word:${word}`, label: `$${token.symbol} names`, words: [word] };
}

/** How hard this coin is ripping on today's tape. Stale million-caps score 0. */
export function todayMoveScore(token: TrackedToken, now = Date.now()): number {
  const change24 = token.change24h ?? 0;
  const change1 = token.change1h ?? 0;
  const change5 = token.change5m ?? 0;
  const vol = token.volume24h ?? 0;
  const vol1 = token.volume1h ?? 0;
  const mcap = token.marketCap ?? 0;
  const age = pairAgeMs(token.pairCreatedAt, now);
  const onTrend = token.source === "trending" || token.source === "boost";
  const movedToday =
    change24 >= 18 || change1 >= 12 || change5 >= 8 || vol >= 80_000 || vol1 >= 20_000 || onTrend;

  if (!movedToday) return 0;
  if (age != null && age > TODAY_MS && change24 < 18 && change1 < 12 && !onTrend) return 0;

  let score = 0;
  if (onTrend) score += 36;
  if (age != null && age <= TODAY_MS) score += 16;
  score += Math.min(90, Math.max(0, change24));
  score += Math.min(36, Math.max(0, change1));
  if (vol > 0) score += Math.min(40, Math.log10(vol) * 8);
  if (mcap >= 1_000_000 && movedToday) score += 24;
  else if (mcap >= 250_000 && movedToday) score += 12;
  return score;
}

export function tokenFitsMeta(token: { symbol: string; name?: string }, meta: TodayMeta): boolean {
  const words = tokenWords(token);
  const hay = ` ${words.join(" ")} `;
  const primary = primaryWord(token);
  return meta.words.some((word) => {
    if (word.length < 4) return words.includes(word);
    if (words.includes(word) || hay.includes(` ${word} `) || hay.replace(/\s+/g, "").includes(word)) {
      return true;
    }
    return primary.length >= 5 && word.includes(primary);
  });
}

function buildMeta(
  seed: TrackedToken,
  theme: { id: string; label: string; words: string[] },
): TodayMeta {
  const change = seed.change24h ?? seed.change1h;
  const move = change != null ? pct(change) : "";
  const cap = seed.marketCap ? compactUsd(seed.marketCap) : "";
  const bits = [`$${seed.symbol}`, cap, move && move !== "—" ? `${move} today` : ""]
    .filter(Boolean)
    .join(" · ");
  return {
    id: theme.id,
    label: theme.label,
    themeId: theme.id,
    seedSymbol: seed.symbol,
    seedId: seed.id,
    seedMcap: seed.marketCap,
    seedChange: change,
    seedVolume: seed.volume24h,
    words: theme.words,
    why: `This is today's tape, not yesterday's. ${bits} is the rip — same-category coins belong next to it.`,
    headline: `Today's meta is ${bits} — ${theme.label}`,
  };
}

export function detectTodayMetas(
  tokens: TrackedToken[],
  lessons: MetaLesson[] = [],
  now = Date.now(),
): TodayMeta[] {
  const live: TrackedToken[] = [...tokens];
  for (const lesson of lessons) {
    if (now - lesson.at > TODAY_MS) continue;
    if (live.some((row) => row.id === lesson.id || row.symbol.toUpperCase() === lesson.symbol.toUpperCase())) {
      continue;
    }
    live.push({
      id: lesson.id,
      chainId: "unknown",
      tokenAddress: lesson.id,
      name: lesson.symbol,
      symbol: lesson.symbol,
      dexUrl: "",
      source: "trending",
      marketCap: lesson.peakMcap,
      change24h: 80,
      pairCreatedAt: lesson.at,
    });
  }

  const movers = live
    .map((token) => ({ token, heat: todayMoveScore(token, now) }))
    .filter((row) => row.heat >= 22)
    .sort((a, b) => b.heat - a.heat)
    .slice(0, 30);

  if (!movers.length) return [];

  const lead = movers[0].token;
  const leadTheme = themeOf(lead);
  const seen = new Set<string>([leadTheme.id]);
  const metas: TodayMeta[] = [buildMeta(lead, leadTheme)];

  for (const { token } of movers.slice(1)) {
    const theme = themeOf(token);
    if (seen.has(theme.id)) continue;
    seen.add(theme.id);
    metas.push(buildMeta(token, theme));
    if (metas.length >= 5) break;
  }
  return metas;
}

export function pickMetaCoins(tokens: TrackedToken[], metas: TodayMeta[]): TrackedToken[] {
  if (!metas.length) return [];
  const seedIds = new Set(metas.map((meta) => meta.seedId));
  const seedSyms = new Set(metas.map((meta) => meta.seedSymbol.toUpperCase()));
  return [...tokens]
    .filter((token) => metas.some((meta) => tokenFitsMeta(token, meta)))
    .sort((a, b) => {
      const aSeed = seedIds.has(a.id) || seedSyms.has(a.symbol.toUpperCase()) ? 1 : 0;
      const bSeed = seedIds.has(b.id) || seedSyms.has(b.symbol.toUpperCase()) ? 1 : 0;
      if (aSeed !== bSeed) return bSeed - aSeed;
      return todayMoveScore(b) - todayMoveScore(a) || (b.marketCap ?? 0) - (a.marketCap ?? 0);
    });
}

function relatedSearchScore(word: string, seed: string): number {
  let score = 4 - Math.min(4, Math.abs(word.length - seed.length));
  if (word.length >= 3 && seed.length >= 3 && word.slice(-3) === seed.slice(-3)) score += 8;
  if (word.length >= 3 && seed.length >= 3 && word.slice(0, 3) === seed.slice(0, 3)) score += 6;
  return score;
}

export function metaSearchQueries(metas: TodayMeta[]): string[] {
  const queries: string[] = [];
  const used = new Set<string>();
  const push = (word: string) => {
    const key = word.toLowerCase();
    if (key.length < 3 || used.has(key)) return;
    used.add(key);
    queries.push(word);
  };
  for (const meta of metas) {
    push(meta.seedSymbol);
    const seed = meta.seedSymbol.toLowerCase();
    const related = meta.words
      .filter((word) => word.length >= 4 && word !== seed && !seed.includes(word))
      .sort((a, b) => relatedSearchScore(b, seed) - relatedSearchScore(a, seed));
    for (const word of related.slice(0, 5)) push(word);
  }
  return queries;
}

export function matchingRipMeta(
  token: { symbol: string; name?: string; id?: string },
  lessons: MetaLesson[],
  now = Date.now(),
): TodayMeta | undefined {
  const metas = detectTodayMetas([], lessons, now);
  return metas.find(
    (meta) =>
      tokenFitsMeta(token, meta) && meta.seedSymbol.toUpperCase() !== token.symbol.toUpperCase(),
  );
}

export function metaForToken(token: TrackedToken, metas: TodayMeta[]): TodayMeta | undefined {
  return metas.find((meta) => tokenFitsMeta(token, meta));
}
