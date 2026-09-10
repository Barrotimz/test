import { pairAgeMs } from "./format";
import type { TrackedToken } from "./types";

const META_WINDOW_MS = 36 * 60 * 60 * 1000;

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
  words: string[];
  why: string;
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
    words: [
      "tesla",
      "lambo",
      "ferrari",
      "porsche",
      "truck",
      "motorcycle",
      "cybertruck",
    ],
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

function isFreshEnough(timestamp: number | undefined, now: number): boolean {
  if (timestamp == null) return true;
  const age = pairAgeMs(timestamp, now);
  return age == null || age <= META_WINDOW_MS;
}

export function isMetaSeed(token: TrackedToken, now = Date.now()): boolean {
  const mcap = token.marketCap ?? 0;
  const change = Math.max(token.change5m ?? 0, token.change1h ?? 0, token.change24h ?? 0);
  if (!isFreshEnough(token.pairCreatedAt, now) && mcap < 1_000_000) return false;
  if (mcap >= 1_000_000) return true;
  if (mcap >= 250_000 && change >= 20) return true;
  if (change >= 120 && mcap >= 40_000) return true;
  return false;
}

function lessonIsSeed(lesson: MetaLesson, now: number): boolean {
  if (now - lesson.at > META_WINDOW_MS) return false;
  return lesson.tier === "millions" || (lesson.peakMcap ?? 0) >= 250_000;
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

export function detectTodayMetas(
  tokens: TrackedToken[],
  lessons: MetaLesson[] = [],
  now = Date.now(),
): TodayMeta[] {
  type Seed = { id: string; symbol: string; name?: string; mcap: number };
  const seeds: Seed[] = [];
  const seen = new Set<string>();

  const push = (seed: Seed) => {
    const key = seed.symbol.toUpperCase();
    if (seen.has(key)) {
      const existing = seeds.find((row) => row.symbol.toUpperCase() === key);
      if (existing && seed.mcap > existing.mcap) existing.mcap = seed.mcap;
      return;
    }
    seen.add(key);
    seeds.push(seed);
  };

  for (const token of tokens) {
    if (!isMetaSeed(token, now)) continue;
    push({
      id: token.id,
      symbol: token.symbol,
      name: token.name,
      mcap: token.marketCap ?? 0,
    });
  }
  for (const lesson of lessons) {
    if (!lessonIsSeed(lesson, now)) continue;
    push({
      id: lesson.id,
      symbol: lesson.symbol,
      mcap: lesson.peakMcap ?? 0,
    });
  }

  const grouped = new Map<string, TodayMeta>();
  for (const seed of seeds.sort((a, b) => b.mcap - a.mcap)) {
    const family = familyForToken(seed);
    const themeId = family?.id ?? `word:${primaryWord(seed)}`;
    const words = family?.words ?? [primaryWord(seed)];
    const current = grouped.get(themeId);
    if (current && (current.seedMcap ?? 0) >= seed.mcap) continue;
    grouped.set(themeId, {
      id: themeId,
      label: family?.label ?? `$${seed.symbol} copycats`,
      themeId,
      seedSymbol: seed.symbol,
      seedId: seed.id,
      seedMcap: seed.mcap || undefined,
      words,
      why:
        seed.mcap >= 1_000_000
          ? `$${seed.symbol} ran to millions — same-category coins (like DESKTOP after LAPTOP) are the next print`
          : `$${seed.symbol} is the rip to copy — watch the same category`,
    });
  }
  return [...grouped.values()].sort((a, b) => (b.seedMcap ?? 0) - (a.seedMcap ?? 0));
}

export function pickMetaCoins(tokens: TrackedToken[], metas: TodayMeta[]): TrackedToken[] {
  if (!metas.length) return [];
  const seedIds = new Set(metas.map((meta) => meta.seedId));
  return [...tokens]
    .filter((token) => metas.some((meta) => tokenFitsMeta(token, meta)))
    .sort((a, b) => {
      const seedDelta = Number(seedIds.has(b.id)) - Number(seedIds.has(a.id));
      if (seedDelta !== 0) return seedDelta;
      return (b.marketCap ?? 0) - (a.marketCap ?? 0);
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
  for (const meta of metas) {
    const seed = meta.seedSymbol.toLowerCase();
    const related = meta.words
      .filter((word) => word.length >= 4 && word !== seed && !seed.includes(word))
      .sort((a, b) => relatedSearchScore(b, seed) - relatedSearchScore(a, seed));
    for (const word of related.slice(0, 6)) {
      if (used.has(word)) continue;
      used.add(word);
      queries.push(word);
    }
    if (!used.has(seed) && seed.length >= 3) {
      used.add(seed);
      queries.push(seed);
    }
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
