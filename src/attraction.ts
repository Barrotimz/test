import { firstTweetId } from "./extract";
import { twitterHandle } from "./format";
import { parseTwitterJoined } from "./read";
import type { TrackedToken } from "./types";

const FX = import.meta.env.DEV ? "/fx" : "https://api.fxtwitter.com";

export type AttractionLevel = "quiet" | "warming" | "hot" | "viral";

export type TweetAttraction = {
  id: string;
  url: string;
  text: string;
  handle: string;
  name: string;
  followers: number;
  postedAt?: number;
  authorJoinedAt?: number;
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  bookmarks: number;
  views: number | null;
  score: number;
  level: AttractionLevel;
};

type FxTweet = {
  code?: number;
  tweet?: {
    id?: string;
    url?: string;
    text?: string;
    likes?: number;
    retweets?: number;
    replies?: number;
    quotes?: number;
    bookmarks?: number;
    views?: number | null;
    created_timestamp?: number;
    author?: { screen_name?: string; name?: string; followers?: number; joined?: string };
  };
};

export function scoreTweetAttraction(metrics: {
  likes?: number | null;
  retweets?: number | null;
  replies?: number | null;
  quotes?: number | null;
  bookmarks?: number | null;
  views?: number | null;
  followers?: number | null;
}): { score: number; level: AttractionLevel } {
  const likes = metrics.likes ?? 0;
  const retweets = metrics.retweets ?? 0;
  const replies = metrics.replies ?? 0;
  const quotes = metrics.quotes ?? 0;
  const bookmarks = metrics.bookmarks ?? 0;
  const views = metrics.views ?? 0;
  const followers = metrics.followers ?? 0;

  const score = Math.round(
    likes +
      retweets * 3 +
      quotes * 4 +
      replies * 0.4 +
      bookmarks * 1.5 +
      views * 0.015 +
      Math.min(followers, 2_000_000) / 400,
  );

  const level: AttractionLevel =
    likes >= 5_000 || retweets >= 1_000 || views >= 200_000 || score >= 20_000
      ? "viral"
      : likes >= 400 || retweets >= 80 || views >= 25_000 || score >= 2_500
        ? "hot"
        : likes >= 40 || retweets >= 12 || followers >= 25_000 || score >= 400
          ? "warming"
          : "quiet";

  return { score, level };
}

export function scoreTokenHype(token: TrackedToken): { score: number; level: AttractionLevel } {
  let score = 0;
  const vol = token.volume24h ?? 0;
  const mcap = token.marketCap ?? 0;
  const change = Math.abs(token.change1h ?? token.change24h ?? 0);
  const boost = token.boostAmount ?? 0;

  if (vol >= 5_000_000) score += 40;
  else if (vol >= 500_000) score += 26;
  else if (vol >= 80_000) score += 14;
  else if (vol >= 15_000) score += 6;

  if (change >= 50) score += 24;
  else if (change >= 20) score += 14;
  else if (change >= 8) score += 6;

  if (boost >= 200) score += 18;
  else if (boost >= 30) score += 10;

  if (mcap > 0 && vol / mcap >= 2) score += 16;
  else if (mcap > 0 && vol / mcap >= 0.6) score += 8;

  const likes = token.tweetLikes ?? 0;
  if (likes >= 5_000) score += 28;
  else if (likes >= 400) score += 16;
  else if (likes >= 40) score += 8;

  if ((token.twitterFollowers ?? 0) >= 50_000) score += 10;
  else if ((token.twitterFollowers ?? 0) >= 10_000) score += 5;

  const level: AttractionLevel =
    score >= 55 ? "viral" : score >= 32 ? "hot" : score >= 14 ? "warming" : "quiet";
  return { score: Math.min(100, score), level };
}

type FxUser = {
  code?: number;
  user?: {
    screen_name?: string;
    name?: string;
    followers?: number;
    tweets?: number;
    description?: string;
    joined?: string;
  };
};

export async function fetchTwitterUser(handle: string): Promise<{
  handle: string;
  name: string;
  followers: number;
  tweets: number;
  description: string;
  joinedAt?: number;
}> {
  const response = await fetch(`${FX}/${encodeURIComponent(handle)}`);
  if (!response.ok) throw new Error(`@${handle} returned ${response.status}`);
  const data = (await response.json()) as FxUser;
  if (!data.user?.screen_name) throw new Error(`No profile for @${handle}`);
  return {
    handle: data.user.screen_name,
    name: data.user.name ?? "",
    followers: data.user.followers ?? 0,
    tweets: data.user.tweets ?? 0,
    description: data.user.description ?? "",
    joinedAt: parseTwitterJoined(data.user.joined),
  };
}

export function socialPatchFromTweet(tweet: TweetAttraction): Partial<TrackedToken> {
  return {
    twitterUrl: tweet.url,
    tweetUrl: tweet.url,
    tweetText: tweet.text,
    tweetLikes: tweet.likes,
    tweetRetweets: tweet.retweets,
    tweetReplies: tweet.replies,
    tweetQuotes: tweet.quotes,
    tweetBookmarks: tweet.bookmarks,
    tweetViews: tweet.views,
    twitterFollowers: tweet.followers,
    twitterHandle: tweet.handle,
    tweetAt: tweet.postedAt,
    twitterJoinedAt: tweet.authorJoinedAt,
    socialCheckedAt: Date.now(),
  };
}

export async function enrichTokenSocial(token: TrackedToken): Promise<Partial<TrackedToken>> {
  const tweetId = firstTweetId(token.twitterUrl, token.tweetUrl, token.websiteUrl, token.description);
  if (tweetId) {
    return socialPatchFromTweet(await fetchTweetAttraction(tweetId));
  }
  const handle = twitterHandle(token.twitterUrl) ?? token.twitterHandle;
  if (!handle) return { socialCheckedAt: Date.now() };
  const user = await fetchTwitterUser(handle);
  return {
    twitterHandle: user.handle,
    twitterFollowers: user.followers,
    twitterTweets: user.tweets,
    twitterJoinedAt: user.joinedAt,
    socialCheckedAt: Date.now(),
  };
}

export function hasTweetPost(token: TrackedToken): boolean {
  return Boolean(firstTweetId(token.twitterUrl, token.tweetUrl, token.websiteUrl, token.description));
}

export function needsSocialEnrichment(token: TrackedToken, now = Date.now()): boolean {
  const posted = hasTweetPost(token);
  const handle = twitterHandle(token.twitterUrl) ?? token.twitterHandle;
  if (!posted && !handle) return false;
  if (!token.socialCheckedAt) return true;
  const age = now - token.socialCheckedAt;
  if (posted && token.tweetLikes == null) return age > 12_000;
  if (posted) return age > 90_000;
  if (token.twitterFollowers == null) return age > 12_000;
  return false;
}

export function socialPriority(token: TrackedToken): number {
  if (hasTweetPost(token) && token.tweetLikes == null) return 0;
  if (hasTweetPost(token)) return 1;
  return 2;
}

export async function fetchTweetAttraction(id: string): Promise<TweetAttraction> {
  const response = await fetch(`${FX}/status/${id}`);
  if (!response.ok) throw new Error(`Tweet ${id} returned ${response.status}`);
  const data = (await response.json()) as FxTweet;
  const tweet = data.tweet;
  if (!tweet?.id) throw new Error(`No tweet data for ${id}`);
  const ranked = scoreTweetAttraction({
    likes: tweet.likes,
    retweets: tweet.retweets,
    replies: tweet.replies,
    quotes: tweet.quotes,
    bookmarks: tweet.bookmarks,
    views: tweet.views,
    followers: tweet.author?.followers,
  });
  return {
    id: tweet.id,
    url: tweet.url ?? `https://x.com/i/web/status/${tweet.id}`,
    text: tweet.text ?? "",
    handle: tweet.author?.screen_name ?? "unknown",
    name: tweet.author?.name ?? "",
    followers: tweet.author?.followers ?? 0,
    postedAt: tweet.created_timestamp != null ? tweet.created_timestamp * 1000 : undefined,
    authorJoinedAt: parseTwitterJoined(tweet.author?.joined),
    likes: tweet.likes ?? 0,
    retweets: tweet.retweets ?? 0,
    replies: tweet.replies ?? 0,
    quotes: tweet.quotes ?? 0,
    bookmarks: tweet.bookmarks ?? 0,
    views: tweet.views ?? null,
    score: ranked.score,
    level: ranked.level,
  };
}

export async function fetchTweetAttractions(ids: string[]): Promise<TweetAttraction[]> {
  const unique = [...new Set(ids)].slice(0, 5);
  const rows = await Promise.allSettled(unique.map((id) => fetchTweetAttraction(id)));
  return rows.flatMap((row) => (row.status === "fulfilled" ? [row.value] : []));
}
