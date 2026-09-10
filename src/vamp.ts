import { compactCount } from "./format";
import type { TrackedToken } from "./types";

/** How the coin's attached X post relates to the account that wrote it. */
export type TweetOrigin = "none" | "own" | "outside";

export type VampTier = "none" | "small" | "notable" | "major";

export type VampRead = {
  origin: TweetOrigin;
  tier: VampTier;
  handle?: string;
  followers: number;
  /** Outside post from an account big enough that the coin is riding its reach. */
  vamped: boolean;
  label?: string;
  reason?: string;
};

const MIN_MATCH = 3;
const SMALL = 10_000;
const NOTABLE = 100_000;
const MAJOR = 1_000_000;

const FRESH_MS = 15 * 60_000;
const RECENT_MS = 2 * 60 * 60_000;

export function normalizeHandle(value?: string): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * A coin's own promo account almost always echoes its ticker or name (@plumbercoin for
 * $PLUMBER). An account that shares nothing with either is somebody else's audience, which
 * is the setup worth catching — $Plumber came off a @polymarket post, not its own.
 */
export function isOwnAccount(handle?: string, symbol?: string, name?: string): boolean {
  const account = normalizeHandle(handle);
  if (account.length < MIN_MATCH) return false;
  for (const candidate of [symbol, name]) {
    const target = normalizeHandle(candidate);
    if (target.length < MIN_MATCH) continue;
    if (account.includes(target) || target.includes(account)) return true;
  }
  return false;
}

export function vampTier(followers: number): VampTier {
  if (followers >= MAJOR) return "major";
  if (followers >= NOTABLE) return "notable";
  if (followers >= SMALL) return "small";
  return "none";
}

export function readVamp(token: TrackedToken): VampRead {
  const handle = token.twitterHandle;
  const followers = token.twitterFollowers ?? 0;
  if (!handle || token.tweetLikes == null) {
    return { origin: "none", tier: "none", followers, vamped: false };
  }
  const own = isOwnAccount(handle, token.symbol, token.name);
  const tier = vampTier(followers);
  if (own) {
    return { origin: "own", tier, handle, followers, vamped: false };
  }
  const vamped = tier !== "none";
  return {
    origin: "outside",
    tier,
    handle,
    followers,
    vamped,
    label: vamped ? `VAMP @${handle} ${compactCount(followers)}` : undefined,
    reason: vamped
      ? `Riding @${handle}'s ${compactCount(followers)} followers, not its own account`
      : undefined,
  };
}

/** Age of the attached post. J7's whole edge is being early to the post, so we surface it. */
export function tweetAgeMs(token: TrackedToken, now = Date.now()): number | undefined {
  if (token.tweetAt == null) return undefined;
  return Math.max(0, now - token.tweetAt);
}

export function tweetFreshLabel(token: TrackedToken, now = Date.now()): string | undefined {
  const age = tweetAgeMs(token, now);
  if (age == null) return undefined;
  if (age < 60_000) return "POST <1m";
  if (age < FRESH_MS) return `POST ${Math.round(age / 60_000)}m`;
  if (age < RECENT_MS) return `POST ${Math.round(age / 60_000)}m`;
  const hours = age / 3_600_000;
  if (hours < 48) return `POST ${Math.round(hours)}h`;
  return `POST ${Math.round(hours / 24)}d`;
}

export function isFreshPost(token: TrackedToken, now = Date.now()): boolean {
  const age = tweetAgeMs(token, now);
  return age != null && age <= FRESH_MS;
}

/**
 * Ranking weight for the tweet-first read: a big outside account counts for far more than
 * the coin shilling itself, and a post that just went up counts for more than a stale one.
 */
export function vampScore(token: TrackedToken, now = Date.now()): number {
  const read = readVamp(token);
  let score = 0;
  if (read.tier === "major") score += 60;
  else if (read.tier === "notable") score += 38;
  else if (read.tier === "small") score += 18;
  if (read.origin === "outside") score += 20;
  else if (read.origin === "own") score = Math.round(score * 0.35);

  const age = tweetAgeMs(token, now);
  if (age != null) {
    if (age <= 5 * 60_000) score += 30;
    else if (age <= FRESH_MS) score += 20;
    else if (age <= RECENT_MS) score += 8;
    else if (age > 48 * 3_600_000) score -= 10;
  }
  return Math.max(0, score);
}

export function pickVamped(tokens: TrackedToken[], now = Date.now()): TrackedToken[] {
  return tokens
    .filter((token) => readVamp(token).vamped)
    .sort((a, b) => vampScore(b, now) - vampScore(a, now));
}
