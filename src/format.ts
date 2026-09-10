export function tweetInteractions(token: {
  tweetLikes?: number;
  tweetRetweets?: number;
  tweetReplies?: number;
  tweetQuotes?: number;
  tweetBookmarks?: number;
}): number | undefined {
  if (
    token.tweetLikes == null &&
    token.tweetRetweets == null &&
    token.tweetReplies == null &&
    token.tweetQuotes == null &&
    token.tweetBookmarks == null
  ) {
    return undefined;
  }
  return (
    (token.tweetLikes ?? 0) +
    (token.tweetRetweets ?? 0) +
    (token.tweetReplies ?? 0) +
    (token.tweetQuotes ?? 0) +
    (token.tweetBookmarks ?? 0)
  );
}

export function compactCount(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${Math.round(value)}`;
}

export function compactPrice(value?: number): string {
  if (value == null || Number.isNaN(value)) return "—";
  if (value >= 1) return `$${value.toFixed(3)}`;
  if (value >= 0.0001) return `$${value.toFixed(6)}`;
  return `$${value.toExponential(2)}`;
}

export function compactUsd(value?: number): string {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  if (abs >= 1) return `$${value.toFixed(2)}`;
  if (abs >= 0.0001) return `$${value.toFixed(4)}`;
  return `$${value.toExponential(1)}`;
}

export function pct(value?: number): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function shortAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function toMillis(timestamp?: number): number | undefined {
  if (timestamp == null || Number.isNaN(timestamp)) return undefined;
  return timestamp > 1e12 ? timestamp : timestamp * 1000;
}

export function pairAgeMs(timestamp?: number, now = Date.now()): number | undefined {
  const created = toMillis(timestamp);
  if (created == null) return undefined;
  return Math.max(0, now - created);
}

export type AgeBucket = "fresh" | "new" | "recent" | "aged" | "unknown";

export function coinAgeBucket(timestamp?: number, now = Date.now()): AgeBucket {
  const ms = pairAgeMs(timestamp, now);
  if (ms == null) return "unknown";
  if (ms < 60 * 60 * 1000) return "fresh";
  if (ms < 24 * 60 * 60 * 1000) return "new";
  if (ms < 7 * 24 * 60 * 60 * 1000) return "recent";
  return "aged";
}

export function coinAgeLabel(timestamp?: number, now = Date.now()): string {
  const ms = pairAgeMs(timestamp, now);
  if (ms == null) return "—";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just launched";
  if (mins < 60) return `${mins}m old`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h old`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d old`;
  if (days < 60) return `${Math.floor(days / 7)}w old`;
  const months = Math.floor(days / 30);
  if (months < 24) return `${months}mo old`;
  return `${Math.floor(days / 365)}y old`;
}

export function ageLabel(timestamp?: number): string {
  const ms = pairAgeMs(timestamp);
  if (ms == null) return "";
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function twitterHandle(url?: string): string | undefined {
  if (!url) return undefined;
  const match = url.match(/(?:x\.com|twitter\.com)\/(?:@)?([A-Za-z0-9_]+)/i);
  if (!match) return undefined;
  const handle = match[1];
  if (["i", "intent", "search", "home", "share"].includes(handle.toLowerCase())) {
    return undefined;
  }
  return handle;
}

export function liveSearchUrl(query: string): string {
  return `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;
}

const PADRE_CHAIN: Record<string, string> = {
  solana: "solana",
  ethereum: "ethereum",
  eth: "ethereum",
  bsc: "bsc",
  bnb: "bsc",
  base: "base",
};

export function padreTradeUrl(chainId: string, address: string): string {
  const key = chainId.toLowerCase();
  const slug = PADRE_CHAIN[key] ?? key;
  return `https://trade.padre.gg/trade/${slug}/${address}`;
}

export function caSearchUrl(address: string): string {
  return liveSearchUrl(`"${address}"`);
}

export function tokenSearchQuery(symbol: string, address: string): string {
  const ticker = symbol.replace(/[^A-Za-z0-9]/g, "");
  return ticker ? `$${ticker} OR ${address}` : address;
}

export function tokenImage(chainId: string, address: string, fallback?: string): string {
  if (fallback?.startsWith("http")) return fallback;
  if (fallback) {
    return `https://cdn.dexscreener.com/cms/images/${fallback}?width=128&height=128&quality=90&format=auto`;
  }
  return `https://dd.dexscreener.com/ds-data/tokens/${chainId}/${address}.png`;
}
