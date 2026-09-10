import { extractMentions, firstTweetId } from "./extract";
import { twitterHandle } from "./format";
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

export function pickRadarTokens(tokens: TrackedToken[]): TrackedToken[] {
  return tokens.filter((token) => hasXTrail(token)).sort((a, b) => {
    const likes = (b.tweetLikes ?? -1) - (a.tweetLikes ?? -1);
    if (likes !== 0) return likes;
    const change = (b.change1h ?? b.change24h ?? 0) - (a.change1h ?? a.change24h ?? 0);
    if (change !== 0) return change;
    return (b.volume1h ?? b.volume24h ?? 0) - (a.volume1h ?? a.volume24h ?? 0);
  });
}
