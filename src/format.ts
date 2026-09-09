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

export function ageLabel(timestamp?: number): string {
  if (!timestamp) return "";
  const ms = timestamp > 1e12 ? timestamp : timestamp * 1000;
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
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
