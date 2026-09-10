import { extractMentions, firstTweetId } from "./extract";
import { pairAgeMs, twitterHandle } from "./format";
import type { TrackedToken } from "./types";

const X_URL_RE =
  /(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter|vxtwitter|fxtwitter|fixupx|twittpr)\.com\/[A-Za-z0-9_/?=&%-]+/i;

function findXUrls(text: string): string[] {
  return [...text.matchAll(new RegExp(X_URL_RE.source, "gi"))].map((match) => match[0]);
}

export function pickTwitterUrl(
  links?: { type?: string | null; url: string }[],
  ...extra: (string | undefined)[]
): string | undefined {
  const typed = links?.filter((link) => (link.type ?? "").toLowerCase() === "twitter").map((link) => link.url) ?? [];
  const blobs = [
    ...typed,
    ...(links ?? []).map((link) => link.url),
    ...extra.filter((item): item is string => Boolean(item)),
  ];
  const urls = blobs.flatMap(findXUrls);
  const status = urls.find((url) => firstTweetId(url));
  if (status) return status;
  if (typed[0]) return typed[0];
  return urls[0] ?? blobs.find((blob) => /(?:x|twitter)\.com/i.test(blob));
}

export function attachXTrail(token: TrackedToken): TrackedToken {
  const tweetId = firstTweetId(token.twitterUrl, token.tweetUrl, token.websiteUrl, token.description);
  const mentions = extractMentions(
    [token.twitterUrl, token.tweetUrl, token.websiteUrl, token.description].filter(Boolean).join("\n"),
  );
  const handle =
    token.twitterHandle ??
    twitterHandle(token.twitterUrl) ??
    twitterHandle(token.tweetUrl) ??
    mentions.handles[0];
  const twitterUrl = token.twitterUrl ?? (tweetId ? `https://x.com/i/web/status/${tweetId}` : undefined);
  return {
    ...token,
    twitterUrl,
    tweetUrl: token.tweetUrl ?? (tweetId ? `https://x.com/i/web/status/${tweetId}` : undefined),
    twitterHandle: handle,
  };
}

export function hasXTrail(token: TrackedToken): boolean {
  const attached = attachXTrail(token);
  return Boolean(
    attached.twitterUrl ||
      attached.twitterHandle ||
      attached.tweetUrl ||
      firstTweetId(attached.twitterUrl, attached.tweetUrl, attached.websiteUrl, attached.description),
  );
}

/** New coins ripping on volume — the Plumber shape, even before we attach the tweet. */
export function tapeOpportunityScore(token: TrackedToken, now = Date.now()): number {
  const age = pairAgeMs(token.pairCreatedAt, now);
  const vol = token.volume5m ?? 0;
  const vol1 = token.volume1h ?? token.volume24h ?? 0;
  const change = Math.max(token.change5m ?? 0, token.change1h ?? 0, token.change24h ?? 0);
  let score = 0;
  if (age != null && age < 2 * 60 * 60_000) score += 22;
  else if (age != null && age < 8 * 60 * 60_000) score += 10;
  if (vol >= 40_000) score += 28;
  else if (vol >= 8_000) score += 14;
  if (vol1 >= 200_000) score += 22;
  else if (vol1 >= 40_000) score += 12;
  if (change >= 80) score += 24;
  else if (change >= 25) score += 12;
  if (hasXTrail(token)) {
    score += firstTweetId(token.twitterUrl, token.tweetUrl, token.websiteUrl, token.description) ? 22 : 12;
  }
  if (token.tweetLikes && token.tweetLikes >= 20) score += 10;
  if (token.tweetLikes && token.tweetLikes >= 200) score += 10;
  return score;
}

export function isTapeOpportunity(token: TrackedToken, now = Date.now()): boolean {
  return tapeOpportunityScore(token, now) >= 28;
}

export function pickRadarTokens(tokens: TrackedToken[], now = Date.now()): TrackedToken[] {
  return tokens
    .filter((token) => hasXTrail(token) || isTapeOpportunity(token, now))
    .sort((a, b) => {
      const heat = tapeOpportunityScore(b, now) - tapeOpportunityScore(a, now);
      if (heat !== 0) return heat;
      const likes = (b.tweetLikes ?? -1) - (a.tweetLikes ?? -1);
      if (likes !== 0) return likes;
      return (b.change1h ?? b.change24h ?? 0) - (a.change1h ?? a.change24h ?? 0);
    });
}

/** Plumber-class miss: tweet was on the Dex pair website, not a token-profile. Keep hunting this CA. */
export const PLUMBER_CA = "G8dmGbWTEFeK8Xmj5YaukwNsAKXCDEQfm11d5987crmZ";

export const X_HUNT_QUERIES = [
  "x.com/status",
  "twitter.com/status",
  "x.com/i/web/status",
  "x.com/i/status",
  "fixupx.com/status",
  "vxtwitter.com/status",
];

export const BAIT_QUERIES = [
  "Plumber",
  "Electrician",
  "Carpenter",
  "Mechanic",
  "Firefighter",
  "Teacher",
  "Nurse",
  "Pilot",
  "Chef",
  "Lawyer",
  "Dentist",
  "Farmer",
  "Bartender",
  "Driver",
  "Soldier",
  "Polymarket",
  "ETF",
];

function hotRadarSymbols(tokens: TrackedToken[]): string[] {
  return [...tokens]
    .sort((a, b) => tapeOpportunityScore(b) - tapeOpportunityScore(a))
    .slice(0, 10)
    .map((token) => token.symbol)
    .filter((symbol) => symbol.length >= 3 && symbol.length <= 18);
}

function missingTweetCas(tokens: TrackedToken[]): string[] {
  return [...tokens]
    .filter((token) => !firstTweetId(token.twitterUrl, token.tweetUrl, token.websiteUrl, token.description))
    .sort((a, b) => tapeOpportunityScore(b) - tapeOpportunityScore(a))
    .slice(0, 8)
    .map((token) => token.tokenAddress);
}

function pushUnique(out: string[], seen: Set<string>, word?: string) {
  const key = word?.trim() ?? "";
  if (key.length < 3 || seen.has(key.toLowerCase())) return;
  seen.add(key.toLowerCase());
  out.push(key);
}

export function radarSearchQueries(tokens: TrackedToken[], extra: string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of [...X_HUNT_QUERIES, ...extra, ...hotRadarSymbols(tokens), ...missingTweetCas(tokens), ...BAIT_QUERIES]) {
    pushUnique(out, seen, word);
  }
  return out;
}

/** Four Dex searches: one status-url hunt, one hot ticker, one CA still missing a tweet, one bait/meta. */
export function radarQuerySlice(tokens: TrackedToken[], extra: string[] = [], tick = 0): string[] {
  const hunts = X_HUNT_QUERIES;
  const hot = hotRadarSymbols(tokens);
  const missing = missingTweetCas(tokens);
  const bait = [...extra, ...BAIT_QUERIES];
  const pick = (list: string[], offset: number) => (list.length ? list[offset % list.length] : undefined);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of [
    pick(hunts, tick),
    pick(hot, tick),
    pick(missing, tick),
    pick(bait, tick),
    ...radarSearchQueries(tokens, extra),
  ]) {
    pushUnique(out, seen, word);
    if (out.length >= 4) break;
  }
  return out;
}
