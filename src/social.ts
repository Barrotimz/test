import { extractMentions, firstTweetId } from "./extract";
import { pairAgeMs, twitterHandle } from "./format";
import type { TrackedToken } from "./types";

const X_URL_RE = /https?:\/\/(?:www\.)?(?:x|twitter|vxtwitter|fxtwitter|fixupx)\.com\/[A-Za-z0-9_/?=&%-]+/i;

export function pickTwitterUrl(
  links?: { type?: string | null; url: string }[],
  ...extra: (string | undefined)[]
): string | undefined {
  const typed = links?.find((link) => (link.type ?? "").toLowerCase() === "twitter")?.url;
  if (typed) return typed;
  const loose = links?.find((link) => /(?:x|twitter)\.com/i.test(link.url))?.url;
  if (loose) return loose;
  const blob = extra.filter(Boolean).join("\n");
  return blob.match(X_URL_RE)?.[0];
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
  if (hasXTrail(token)) score += 16;
  if (token.tweetLikes && token.tweetLikes >= 20) score += 10;
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

export function radarSearchQueries(tokens: TrackedToken[], extra: string[] = []): string[] {
  const hot = [...tokens]
    .sort((a, b) => tapeOpportunityScore(b) - tapeOpportunityScore(a))
    .slice(0, 10)
    .map((token) => token.symbol)
    .filter((symbol) => symbol.length >= 3 && symbol.length <= 18);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of [...extra, ...hot, ...BAIT_QUERIES]) {
    const key = word.trim();
    if (key.length < 3 || seen.has(key.toLowerCase())) continue;
    seen.add(key.toLowerCase());
    out.push(key);
  }
  return out;
}
