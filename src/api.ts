import type { DexBoost, DexTokenPair, TrackedToken } from "./types";
import { tokenImage } from "./format";

const DEX = import.meta.env.DEV ? "/dex" : "https://api.dexscreener.com";
const GECKO = import.meta.env.DEV ? "/gecko" : "https://api.geckoterminal.com";

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${response.status} ${url}`);
  }
  return (await response.json()) as T;
}

function pickLink(links: { type?: string | null; url: string }[] | undefined, type: string) {
  return links?.find((link) => (link.type ?? "").toLowerCase() === type)?.url;
}

function pairToToken(pair: DexTokenPair, source: TrackedToken["source"]): TrackedToken {
  const socials = pair.info?.socials ?? [];
  return {
    id: `${pair.chainId}:${pair.baseToken.address}`,
    chainId: pair.chainId,
    tokenAddress: pair.baseToken.address,
    name: pair.baseToken.name,
    symbol: pair.baseToken.symbol,
    imageUrl: pair.info?.imageUrl,
    priceUsd: pair.priceUsd ? Number(pair.priceUsd) : undefined,
    marketCap: pair.marketCap ?? pair.fdv,
    volume24h: pair.volume?.h24,
    change1h: pair.priceChange?.h1,
    change24h: pair.priceChange?.h24,
    liquidity: pair.liquidity?.usd,
    boostAmount: pair.boosts?.active,
    twitterUrl: pickLink(socials, "twitter"),
    telegramUrl: pickLink(socials, "telegram"),
    websiteUrl: pair.info?.websites?.[0]?.url,
    dexUrl: pair.url,
    pairCreatedAt: pair.pairCreatedAt,
    source,
  };
}

function bestPairs(pairs: DexTokenPair[]): DexTokenPair[] {
  const byToken = new Map<string, DexTokenPair>();
  for (const pair of pairs) {
    const key = `${pair.chainId}:${pair.baseToken.address.toLowerCase()}`;
    const current = byToken.get(key);
    const liq = pair.liquidity?.usd ?? 0;
    if (!current || liq > (current.liquidity?.usd ?? 0)) {
      byToken.set(key, pair);
    }
  }
  return [...byToken.values()];
}

export async function fetchBoosts(kind: "latest" | "top"): Promise<DexBoost[]> {
  return getJson<DexBoost[]>(`${DEX}/token-boosts/${kind}/v1`);
}

export async function fetchProfiles(): Promise<DexBoost[]> {
  return getJson<DexBoost[]>(`${DEX}/token-profiles/latest/v1`);
}

export async function fetchTokenPairs(chainId: string, addresses: string[]): Promise<DexTokenPair[]> {
  if (addresses.length === 0) return [];
  const chunkSize = 25;
  const chunks: string[][] = [];
  for (let i = 0; i < addresses.length; i += chunkSize) {
    chunks.push(addresses.slice(i, i + chunkSize));
  }
  const results = await Promise.all(
    chunks.map((chunk) =>
      getJson<DexTokenPair[]>(`${DEX}/tokens/v1/${chainId}/${chunk.join(",")}`).catch(() => []),
    ),
  );
  return results.flat();
}

export async function searchTokens(query: string): Promise<TrackedToken[]> {
  const data = await getJson<{ pairs?: DexTokenPair[] }>(
    `${DEX}/latest/dex/search?q=${encodeURIComponent(query)}`,
  );
  return bestPairs(data.pairs ?? []).map((pair) => pairToToken(pair, "search"));
}

function mergeBoost(boost: DexBoost, pair?: DexTokenPair): TrackedToken {
  const links = [
    ...(boost.links ?? []),
    ...(pair?.info?.socials ?? []),
  ];
  return {
    id: `${boost.chainId}:${boost.tokenAddress}`,
    chainId: boost.chainId,
    tokenAddress: boost.tokenAddress,
    name: pair?.baseToken.name ?? shortName(boost.tokenAddress),
    symbol: pair?.baseToken.symbol ?? "???",
    description: boost.description ?? undefined,
    imageUrl: tokenImage(boost.chainId, boost.tokenAddress, pair?.info?.imageUrl ?? boost.icon ?? undefined),
    priceUsd: pair?.priceUsd ? Number(pair.priceUsd) : undefined,
    marketCap: pair?.marketCap ?? pair?.fdv,
    volume24h: pair?.volume?.h24,
    change1h: pair?.priceChange?.h1,
    change24h: pair?.priceChange?.h24,
    liquidity: pair?.liquidity?.usd,
    boostAmount: boost.totalAmount ?? boost.amount ?? pair?.boosts?.active,
    twitterUrl: pickLink(links, "twitter"),
    telegramUrl: pickLink(links, "telegram"),
    websiteUrl:
      links.find((link) => !link.type || link.type === "website")?.url ??
      pair?.info?.websites?.[0]?.url,
    dexUrl: boost.url ?? pair?.url ?? `https://dexscreener.com/${boost.chainId}/${boost.tokenAddress}`,
    pairCreatedAt: pair?.pairCreatedAt,
    source: boost.amount != null ? "boost" : "profile",
  };
}

function shortName(address: string): string {
  return address.slice(0, 6);
}

export async function hydrateBoosts(boosts: DexBoost[], source: TrackedToken["source"]): Promise<TrackedToken[]> {
  const byChain = new Map<string, DexBoost[]>();
  for (const boost of boosts) {
    const list = byChain.get(boost.chainId) ?? [];
    list.push(boost);
    byChain.set(boost.chainId, list);
  }

  const pairIndex = new Map<string, DexTokenPair>();
  await Promise.all(
    [...byChain.entries()].map(async ([chainId, items]) => {
      const addresses = [...new Set(items.map((item) => item.tokenAddress))];
      const pairs = bestPairs(await fetchTokenPairs(chainId, addresses));
      for (const pair of pairs) {
        pairIndex.set(`${pair.chainId}:${pair.baseToken.address.toLowerCase()}`, pair);
      }
    }),
  );

  return boosts.map((boost) => {
    const pair = pairIndex.get(`${boost.chainId}:${boost.tokenAddress.toLowerCase()}`);
    const token = mergeBoost(boost, pair);
    token.source = source;
    return token;
  });
}

type GeckoPool = {
  id: string;
  attributes: {
    name: string;
    address: string;
    base_token_price_usd?: string | null;
    fdv_usd?: string | null;
    market_cap_usd?: string | null;
    volume_usd?: { h24?: string };
    price_change_percentage?: { h1?: string; h24?: string };
    reserve_in_usd?: string;
    pool_created_at?: string;
  };
  relationships?: {
    base_token?: { data?: { id: string } };
  };
};

export async function fetchTrending(network = "solana"): Promise<TrackedToken[]> {
  const data = await getJson<{ data?: GeckoPool[] }>(
    `${GECKO}/api/v2/networks/${network}/trending_pools?page=1`,
  );
  const pools = data.data ?? [];
  return pools.map((pool) => {
    const tokenId = pool.relationships?.base_token?.data?.id ?? "";
    const tokenAddress = tokenId.includes("_") ? tokenId.slice(tokenId.indexOf("_") + 1) : pool.attributes.address;
    const [name, symbol] = splitPoolName(pool.attributes.name);
    return {
      id: `${network}:${tokenAddress}`,
      chainId: network,
      tokenAddress,
      name,
      symbol,
      imageUrl: tokenImage(network, tokenAddress),
      priceUsd: num(pool.attributes.base_token_price_usd),
      marketCap: num(pool.attributes.market_cap_usd) ?? num(pool.attributes.fdv_usd),
      volume24h: num(pool.attributes.volume_usd?.h24),
      change1h: num(pool.attributes.price_change_percentage?.h1),
      change24h: num(pool.attributes.price_change_percentage?.h24),
      liquidity: num(pool.attributes.reserve_in_usd),
      dexUrl: `https://dexscreener.com/${network}/${tokenAddress}`,
      pairCreatedAt: pool.attributes.pool_created_at
        ? Date.parse(pool.attributes.pool_created_at)
        : undefined,
      source: "trending",
    };
  });
}

function splitPoolName(name: string): [string, string] {
  const base = name.split(" / ")[0]?.trim() || name;
  return [base, base.replace(/\s+/g, "").slice(0, 10).toUpperCase()];
}

function num(value?: string | null): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function lookupAddresses(addresses: string[]): Promise<TrackedToken[]> {
  const tokens: TrackedToken[] = [];
  for (const address of addresses) {
    const matches = await searchTokens(address);
    if (matches[0]) tokens.push(matches[0]);
  }
  return tokens;
}
