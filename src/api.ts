import { geckoNetworkId, normalizeChain, normalizeTokenAddress, tokenId } from "./chains";
import { launchpadFromDex } from "./launchpads";
import { firstTweetId } from "./extract";
import { tokenImage, twitterHandle } from "./format";
import { defined } from "./merge";
import { attachXTrail, hasXTrail, pickTwitterUrl } from "./social";
import type { DexBoost, DexTokenPair, TrackedToken } from "./types";

const DEX = import.meta.env.DEV ? "/dex" : "https://api.dexscreener.com";
const GECKO = import.meta.env.DEV ? "/gecko" : "https://api.geckoterminal.com";
const PUMP = import.meta.env.DEV ? "/pump" : "https://frontend-api-v3.pump.fun";
const BAGS = import.meta.env.DEV ? "/bags" : "https://public-api-v2.bags.fm";

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return (await response.json()) as T;
}

function pickLink(links: { type?: string | null; url: string }[] | undefined, type: string) {
  return links?.find((link) => (link.type ?? "").toLowerCase() === type)?.url;
}

function txnSum(side?: { buys?: number; sells?: number }): number | undefined {
  if (!side) return undefined;
  return (side.buys ?? 0) + (side.sells ?? 0);
}

export function pairToToken(pair: DexTokenPair, source: TrackedToken["source"]): TrackedToken {
  const socials = pair.info?.socials ?? [];
  const chainId = normalizeChain(pair.chainId);
  const tokenAddress = normalizeTokenAddress(chainId, pair.baseToken.address);
  return attachXTrail({
    id: tokenId(chainId, tokenAddress),
    chainId,
    tokenAddress,
    name: pair.baseToken.name,
    symbol: pair.baseToken.symbol,
    imageUrl: pair.info?.imageUrl,
    priceUsd: pair.priceUsd ? Number(pair.priceUsd) : undefined,
    marketCap: pair.marketCap ?? pair.fdv,
    fdv: pair.fdv,
    volume5m: pair.volume?.m5,
    volume1h: pair.volume?.h1,
    volume24h: pair.volume?.h24,
    change5m: pair.priceChange?.m5,
    change1h: pair.priceChange?.h1,
    change24h: pair.priceChange?.h24,
    liquidity: pair.liquidity?.usd,
    boostAmount: pair.boosts?.active,
    buys5m: pair.txns?.m5?.buys,
    sells5m: pair.txns?.m5?.sells,
    buys1h: pair.txns?.h1?.buys,
    sells1h: pair.txns?.h1?.sells,
    txns24h: txnSum(pair.txns?.h24),
    dexId: pair.dexId,
    twitterUrl: pickTwitterUrl(socials, ...(pair.info?.websites ?? []).map((site) => site.url)),
    telegramUrl: pickLink(socials, "telegram"),
    websiteUrl: pair.info?.websites?.[0]?.url,
    dexUrl: pair.url,
    pairCreatedAt: pair.pairCreatedAt,
    stage: "live",
    seenAt: Date.now(),
    source,
  });
}

function bestPairs(pairs: DexTokenPair[]): DexTokenPair[] {
  const byToken = new Map<string, DexTokenPair>();
  for (const pair of pairs) {
    const key = `${normalizeChain(pair.chainId)}:${pair.baseToken.address.toLowerCase()}`;
    const current = byToken.get(key);
    const liq = pair.liquidity?.usd ?? 0;
    if (!current || liq > (current.liquidity?.usd ?? 0)) byToken.set(key, pair);
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

function roundMoney(value?: number): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  if (Math.abs(value) >= 100) return Math.round(value);
  if (Math.abs(value) >= 1) return Math.round(value * 10) / 10;
  return value;
}

function roundPct(value?: number): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return Math.round(value * 10) / 10;
}

export function quotePatchFromPair(pair: DexTokenPair): Partial<TrackedToken> {
  return defined({
    priceUsd: pair.priceUsd ? Number(pair.priceUsd) : undefined,
    marketCap: roundMoney(pair.marketCap ?? pair.fdv),
    fdv: roundMoney(pair.fdv),
    volume5m: roundMoney(pair.volume?.m5),
    volume1h: roundMoney(pair.volume?.h1),
    volume24h: roundMoney(pair.volume?.h24),
    change5m: roundPct(pair.priceChange?.m5),
    change1h: roundPct(pair.priceChange?.h1),
    change24h: roundPct(pair.priceChange?.h24),
    liquidity: roundMoney(pair.liquidity?.usd),
    buys5m: pair.txns?.m5?.buys,
    sells5m: pair.txns?.m5?.sells,
    buys1h: pair.txns?.h1?.buys,
    sells1h: pair.txns?.h1?.sells,
  });
}

export function quotePatchChanged(prev: TrackedToken, patch: Partial<TrackedToken>): boolean {
  for (const [key, value] of Object.entries(patch) as [keyof TrackedToken, TrackedToken[keyof TrackedToken]][]) {
    if (value === undefined) continue;
    if (prev[key] !== value) return true;
  }
  return false;
}

export function selectQuoteTargets(
  bag: TrackedToken[],
  visibleIds: string[],
  openId?: string | null,
  extraIds: string[] = [],
  cap = 80,
): TrackedToken[] {
  const byId = new Map(bag.map((token) => [token.id, token]));
  const seen = new Set<string>();
  const out: TrackedToken[] = [];
  for (const id of [...visibleIds, openId ?? "", ...extraIds]) {
    if (!id || seen.has(id)) continue;
    const token = byId.get(id);
    if (!token) continue;
    seen.add(id);
    out.push(token);
    if (out.length >= cap) break;
  }
  return out;
}

/** Dex pair quotes for cards on screen — mcap/price/volume only, no socials or learn. */
export async function refreshQuotes(
  tokens: TrackedToken[],
): Promise<{ id: string; patch: Partial<TrackedToken> }[]> {
  if (tokens.length === 0) return [];
  const byChain = new Map<string, TrackedToken[]>();
  for (const token of tokens) {
    const list = byChain.get(token.chainId) ?? [];
    list.push(token);
    byChain.set(token.chainId, list);
  }
  const rows: { id: string; patch: Partial<TrackedToken> }[] = [];
  await Promise.all(
    [...byChain.entries()].map(async ([chainId, items]) => {
      const unique = [...new Map(items.map((item) => [item.tokenAddress.toLowerCase(), item])).values()];
      const pairs = bestPairs(await fetchTokenPairs(chainId, unique.map((item) => item.tokenAddress)));
      const index = new Map(
        pairs.map((pair) => [`${normalizeChain(pair.chainId)}:${pair.baseToken.address.toLowerCase()}`, pair]),
      );
      for (const item of items) {
        const pair = index.get(`${normalizeChain(item.chainId)}:${item.tokenAddress.toLowerCase()}`);
        if (!pair) continue;
        rows.push({ id: item.id, patch: quotePatchFromPair(pair) });
      }
    }),
  );
  return rows;
}

export async function searchTokens(query: string): Promise<TrackedToken[]> {
  const data = await getJson<{ pairs?: DexTokenPair[] }>(
    `${DEX}/latest/dex/search?q=${encodeURIComponent(query)}`,
  );
  return bestPairs(data.pairs ?? []).map((pair) => pairToToken(pair, "search"));
}

function shortName(address: string): string {
  return address.slice(0, 6);
}

function mergeBoost(boost: DexBoost, pair?: DexTokenPair): TrackedToken {
  const links = [...(boost.links ?? []), ...(pair?.info?.socials ?? [])];
  const fromPair = pair ? pairToToken(pair, boost.amount != null ? "boost" : "profile") : undefined;
  const chainId = normalizeChain(boost.chainId);
  const tokenAddress = normalizeTokenAddress(chainId, boost.tokenAddress);
  const twitter = pickTwitterUrl(
    links,
    boost.description ?? undefined,
    ...(pair?.info?.websites ?? []).map((site) => site.url),
  ) ?? fromPair?.twitterUrl;
  const tweetId = firstTweetId(twitter, boost.description ?? undefined, fromPair?.description, fromPair?.websiteUrl);
  return {
    ...fromPair,
    id: tokenId(chainId, tokenAddress),
    chainId,
    tokenAddress,
    name: fromPair?.name ?? shortName(boost.tokenAddress),
    symbol: fromPair?.symbol ?? "???",
    description: boost.description ?? fromPair?.description,
    imageUrl: tokenImage(chainId, tokenAddress, fromPair?.imageUrl ?? boost.icon ?? undefined),
    boostAmount: boost.totalAmount ?? boost.amount ?? fromPair?.boostAmount,
    twitterUrl: twitter,
    telegramUrl: pickLink(links, "telegram") ?? fromPair?.telegramUrl,
    websiteUrl:
      links.find((link) => !link.type || link.type === "website")?.url ?? fromPair?.websiteUrl,
    dexUrl: boost.url ?? fromPair?.dexUrl ?? `https://dexscreener.com/${chainId}/${tokenAddress}`,
    pairCreatedAt: fromPair?.pairCreatedAt,
    tweetUrl: tweetId ? `https://x.com/i/web/status/${tweetId}` : fromPair?.tweetUrl,
    twitterHandle: twitterHandle(twitter) ?? fromPair?.twitterHandle,
    stage: "live",
    seenAt: Date.now(),
    source: boost.amount != null ? "boost" : "profile",
  };
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
        pairIndex.set(`${normalizeChain(pair.chainId)}:${pair.baseToken.address.toLowerCase()}`, pair);
      }
    }),
  );

  return boosts.map((boost) => {
    const pair = pairIndex.get(`${normalizeChain(boost.chainId)}:${boost.tokenAddress.toLowerCase()}`);
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
    volume_usd?: { m5?: string; h1?: string; h24?: string };
    price_change_percentage?: { m5?: string; h1?: string; h24?: string };
    reserve_in_usd?: string;
    pool_created_at?: string;
    transactions?: {
      m5?: { buys?: number; sells?: number };
      h1?: { buys?: number; sells?: number; buyers?: number; sellers?: number };
      h24?: { buys?: number; sells?: number };
    };
  };
  relationships?: {
    base_token?: { data?: { id: string } };
    dex?: { data?: { id: string } };
    network?: { data?: { id: string } };
  };
};

type GeckoIncluded = {
  id: string;
  type: string;
  attributes?: {
    address?: string;
    name?: string;
    symbol?: string;
    image_url?: string;
  };
};

export function geckoBaseMint(
  pool: GeckoPool,
  network: string,
  included?: Map<string, GeckoIncluded>,
): string | undefined {
  const relId = pool.relationships?.base_token?.data?.id ?? "";
  const meta = relId ? included?.get(relId) : undefined;
  if (meta?.attributes?.address) return meta.attributes.address;
  const net = geckoNetworkId(pool.id, pool.relationships?.network?.data?.id ?? network);
  const prefix = `${net}_`;
  if (relId.startsWith(prefix)) {
    const mint = relId.slice(prefix.length);
    if (mint && mint !== pool.attributes.address) return mint;
  }
  return undefined;
}

function geckoToToken(
  pool: GeckoPool,
  network: string,
  source: TrackedToken["source"],
  included?: Map<string, GeckoIncluded>,
): TrackedToken | undefined {
  const raw = geckoBaseMint(pool, network, included);
  if (!raw) return undefined;
  const chainId = normalizeChain(network === "eth" ? "ethereum" : network);
  const tokenAddress = normalizeTokenAddress(chainId, raw);
  const meta = included?.get(pool.relationships?.base_token?.data?.id ?? "");
  const [fallbackName, fallbackSymbol] = splitPoolName(pool.attributes.name);
  const name = meta?.attributes?.name || fallbackName;
  const symbol = (meta?.attributes?.symbol || fallbackSymbol).replace(/^\$/, "");
  const created = pool.attributes.pool_created_at ? Date.parse(pool.attributes.pool_created_at) : undefined;
  const ageMs = created ? Date.now() - created : undefined;
  return {
    id: tokenId(chainId, tokenAddress),
    chainId,
    tokenAddress,
    name,
    symbol,
    imageUrl: tokenImage(chainId, tokenAddress, meta?.attributes?.image_url),
    priceUsd: num(pool.attributes.base_token_price_usd),
    marketCap: num(pool.attributes.market_cap_usd) ?? num(pool.attributes.fdv_usd),
    fdv: num(pool.attributes.fdv_usd),
    volume5m: num(pool.attributes.volume_usd?.m5),
    volume1h: num(pool.attributes.volume_usd?.h1),
    volume24h: num(pool.attributes.volume_usd?.h24),
    change5m: num(pool.attributes.price_change_percentage?.m5),
    change1h: num(pool.attributes.price_change_percentage?.h1),
    change24h: num(pool.attributes.price_change_percentage?.h24),
    liquidity: num(pool.attributes.reserve_in_usd),
    buys5m: pool.attributes.transactions?.m5?.buys,
    sells5m: pool.attributes.transactions?.m5?.sells,
    buys1h: pool.attributes.transactions?.h1?.buys,
    sells1h: pool.attributes.transactions?.h1?.sells,
    buyers1h: pool.attributes.transactions?.h1?.buyers,
    sellers1h: pool.attributes.transactions?.h1?.sellers,
    txns24h: txnSum(pool.attributes.transactions?.h24),
    dexId: pool.relationships?.dex?.data?.id,
    launchpad: launchpadFromDex(pool.relationships?.dex?.data?.id, chainId),
    dexUrl: `https://dexscreener.com/${chainId}/${tokenAddress}`,
    pairCreatedAt: created,
    stage: ageMs != null && ageMs < 30 * 60_000 ? "launching" : "live",
    seenAt: Date.now(),
    source,
  };
}

function mapGeckoPayload(
  data: { data?: GeckoPool[]; included?: GeckoIncluded[] } | undefined,
  fallbackNetwork: string | undefined,
  source: TrackedToken["source"],
): TrackedToken[] {
  const included = new Map((data?.included ?? []).map((item) => [item.id, item]));
  return (data?.data ?? [])
    .map((pool) => {
      const network = geckoNetworkId(pool.id, pool.relationships?.network?.data?.id ?? fallbackNetwork);
      return geckoToToken(pool, network, source, included);
    })
    .filter((token): token is TrackedToken => Boolean(token));
}

export async function fetchGeckoPools(network: string, kind: "new_pools" | "trending_pools"): Promise<TrackedToken[]> {
  try {
    const data = await getJson<{ data?: GeckoPool[]; included?: GeckoIncluded[] }>(
      `${GECKO}/api/v2/networks/${network}/${kind}?page=1&include=base_token`,
    );
    return mapGeckoPayload(data, network, kind === "new_pools" ? "newpool" : "trending");
  } catch {
    return [];
  }
}

export async function fetchGeckoGlobal(
  kind: "new_pools" | "trending_pools",
  page = 1,
): Promise<TrackedToken[]> {
  try {
    const data = await getJson<{ data?: GeckoPool[]; included?: GeckoIncluded[] }>(
      `${GECKO}/api/v2/networks/${kind}?page=${page}&include=base_token,network`,
    );
    return mapGeckoPayload(data, undefined, kind === "new_pools" ? "newpool" : "trending");
  } catch {
    return [];
  }
}

export async function fetchTrending(network = "solana"): Promise<TrackedToken[]> {
  return fetchGeckoPools(network, "trending_pools");
}

type PumpCoin = {
  mint: string;
  name: string;
  symbol: string;
  description?: string;
  image_uri?: string;
  created_timestamp?: number;
  complete?: boolean;
  twitter?: string;
  telegram?: string;
  website?: string;
  usd_market_cap?: number;
  market_cap_usd?: number;
  ath_market_cap?: number;
  reply_count?: number;
  is_currently_live?: boolean;
  num_participants?: number;
  livestream_title?: string;
  real_sol_reserves?: number;
  username?: string;
  creator?: string;
  nsfw?: boolean;
  king_of_the_hill_timestamp?: number | null;
};

export function bondingPct(realSolReserves?: number): number | undefined {
  if (realSolReserves == null) return undefined;
  return Math.min(100, Math.round((realSolReserves / 1e9 / 85) * 1000) / 10);
}

function pumpSocial(raw?: string, kind: "twitter" | "telegram" | "web" = "web"): string | undefined {
  if (!raw) return undefined;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (kind === "twitter") return `https://x.com/${raw.replace(/^@/, "")}`;
  if (kind === "telegram") return `https://t.me/${raw.replace(/^@/, "")}`;
  return raw;
}

function pumpToToken(coin: PumpCoin): TrackedToken {
  const twitter = pumpSocial(coin.twitter, "twitter");
  const tweetId = firstTweetId(twitter, coin.description, coin.website);
  return attachXTrail({
    id: tokenId("solana", coin.mint),
    chainId: "solana",
    tokenAddress: coin.mint,
    name: coin.name,
    symbol: coin.symbol.replace(/^\$/, ""),
    description: coin.description || undefined,
    imageUrl: coin.image_uri,
    marketCap: coin.usd_market_cap ?? coin.market_cap_usd,
    athMarketCap: coin.ath_market_cap,
    twitterUrl: twitter,
    telegramUrl: pumpSocial(coin.telegram, "telegram"),
    websiteUrl: pumpSocial(coin.website),
    dexUrl: `https://pump.fun/${coin.mint}`,
    launchpad: "pump.fun",
    pairCreatedAt: coin.created_timestamp,
    replies: coin.reply_count,
    bondingPct: coin.complete ? 100 : bondingPct(coin.real_sol_reserves),
    livestream: coin.is_currently_live,
    livestreamTitle: coin.livestream_title || undefined,
    viewers: coin.is_currently_live ? coin.num_participants ?? 0 : coin.num_participants,
    creator: coin.creator,
    username: coin.username,
    nsfw: coin.nsfw,
    kingOfHill: Boolean(coin.king_of_the_hill_timestamp),
    tweetUrl: tweetId ? `https://x.com/i/web/status/${tweetId}` : undefined,
    twitterHandle: twitterHandle(twitter),
    stage: coin.complete ? "graduated" : "launching",
    seenAt: Date.now(),
    source: "launch",
  });
}

export async function fetchPumpByMcap(limit = 16): Promise<TrackedToken[]> {
  const coins = await getJson<PumpCoin[]>(
    `${PUMP}/coins?offset=0&limit=${limit}&sort=market_cap&order=DESC&includeNsfw=false`,
  );
  return coins.map(pumpToToken);
}

export async function fetchPumpNewest(limit = 40): Promise<TrackedToken[]> {
  const coins = await getJson<PumpCoin[]>(
    `${PUMP}/coins?offset=0&limit=${limit}&sort=created_timestamp&order=DESC&includeNsfw=false`,
  );
  return coins.map(pumpToToken);
}

export function viewerPatchFromLive(token: TrackedToken): Partial<TrackedToken> {
  return defined({
    livestream: token.livestream,
    livestreamTitle: token.livestreamTitle,
    viewers: token.viewers,
  });
}

export async function fetchPumpLive(limit = 48): Promise<TrackedToken[]> {
  const coins = await getJson<PumpCoin[]>(
    `${PUMP}/coins/currently-live?offset=0&limit=${limit}&includeNsfw=false`,
  );
  return coins.map(pumpToToken);
}

type BagsLaunch = {
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
  tokenMint?: string;
  status?: string;
  twitter?: string | null;
  website?: string | null;
};

export async function fetchBagsLaunches(): Promise<TrackedToken[]> {
  try {
    const data = await getJson<{ response?: BagsLaunch[] }>(`${BAGS}/api/v1/token-launch/feed`);
    return (data.response ?? []).slice(0, 40).flatMap((item) => {
      if (!item.tokenMint) return [];
      const twitter = pumpSocial(item.twitter ?? undefined, "twitter");
      const tweetId = firstTweetId(twitter, item.description, item.website ?? undefined);
      const pre = /pre|launch/i.test(item.status ?? "");
      return [
        attachXTrail({
          id: tokenId("solana", item.tokenMint),
          chainId: "solana",
          tokenAddress: item.tokenMint,
          name: item.name || item.symbol || shortName(item.tokenMint),
          symbol: (item.symbol || item.name || "BAGS").replace(/^\$/, ""),
          description: item.description || undefined,
          imageUrl: item.image,
          twitterUrl: twitter,
          websiteUrl: pumpSocial(item.website ?? undefined),
          dexUrl: `https://bags.fm/${item.tokenMint}`,
          tweetUrl: tweetId ? `https://x.com/i/web/status/${tweetId}` : undefined,
          twitterHandle: twitterHandle(twitter),
          launchpad: "Bags",
          stage: pre ? "launching" : "live",
          seenAt: Date.now(),
          source: "launch",
        }),
      ];
    });
  } catch {
    return [];
  }
}

export async function fetchPumpHottest(limit = 24): Promise<TrackedToken[]> {
  const coins = await getJson<PumpCoin[]>(
    `${PUMP}/coins?offset=0&limit=${limit}&sort=last_trade_timestamp&order=DESC&includeNsfw=false`,
  );
  return coins.filter((coin) => !coin.complete).map(pumpToToken);
}

function splitPoolName(name: string): [string, string] {
  const base = name.split(" / ")[0]?.trim() || name;
  return [base, base.replace(/\s+/g, "").slice(0, 12).toUpperCase()];
}

function num(value?: string | null): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function searchMany(queries: string[]): Promise<TrackedToken[]> {
  const rows = await Promise.allSettled(queries.slice(0, 4).map((query) => searchTokens(query)));
  const map = new Map<string, TrackedToken>();
  for (const row of rows) {
    if (row.status !== "fulfilled") continue;
    for (const token of row.value) map.set(token.id, token);
  }
  return [...map.values()];
}

export async function fillSocialsFromDex(tokens: TrackedToken[], limit = 80): Promise<TrackedToken[]> {
  const missingX = tokens.filter((token) => !hasXTrail(token));
  const missingTweet = tokens.filter(
    (token) =>
      hasXTrail(token) && !firstTweetId(token.twitterUrl, token.tweetUrl, token.websiteUrl, token.description),
  );
  const rank = (token: TrackedToken) => (token.volume5m ?? token.volume1h ?? 0) + (token.change1h ?? token.change5m ?? 0);
  const need = [...missingX.sort((a, b) => rank(b) - rank(a)), ...missingTweet.sort((a, b) => rank(b) - rank(a))].slice(
    0,
    limit,
  );
  if (need.length === 0) return [];
  const byChain = new Map<string, TrackedToken[]>();
  for (const token of need) {
    const list = byChain.get(token.chainId) ?? [];
    list.push(token);
    byChain.set(token.chainId, list);
  }
  const found: TrackedToken[] = [];
  await Promise.all(
    [...byChain.entries()].map(async ([chainId, items]) => {
      const pairs = bestPairs(await fetchTokenPairs(chainId, items.map((item) => item.tokenAddress)));
      const index = new Map(
        pairs.map((pair) => [`${normalizeChain(pair.chainId)}:${pair.baseToken.address.toLowerCase()}`, pair]),
      );
      for (const item of items) {
        const pair = index.get(`${normalizeChain(item.chainId)}:${item.tokenAddress.toLowerCase()}`);
        if (!pair) continue;
        const hydrated = pairToToken(pair, item.source);
        if (!hasXTrail(hydrated)) continue;
        found.push({
          ...item,
          ...hydrated,
          id: item.id,
          source: item.source,
        });
      }
    }),
  );
  return found;
}

export async function lookupAddresses(addresses: string[]): Promise<TrackedToken[]> {
  const rows = await Promise.allSettled(addresses.slice(0, 8).map((address) => searchTokens(address)));
  const tokens: TrackedToken[] = [];
  for (const row of rows) {
    if (row.status === "fulfilled" && row.value[0]) tokens.push(row.value[0]);
  }
  return tokens;
}
