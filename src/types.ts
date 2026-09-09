export type SocialLink = {
  type?: string | null;
  label?: string | null;
  url: string;
};

export type DexBoost = {
  url: string;
  chainId: string;
  tokenAddress: string;
  description?: string | null;
  icon?: string | null;
  header?: string | null;
  links?: SocialLink[] | null;
  amount?: number;
  totalAmount?: number;
};

export type DexTokenPair = {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd?: string;
  volume?: { h24?: number; h6?: number; h1?: number };
  priceChange?: { h24?: number; h6?: number; h1?: number; m5?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    socials?: { url: string; type: string }[];
    websites?: { url: string; label?: string }[];
  };
  boosts?: { active?: number };
};

export type TrackedToken = {
  id: string;
  chainId: string;
  tokenAddress: string;
  name: string;
  symbol: string;
  description?: string;
  imageUrl?: string;
  priceUsd?: number;
  marketCap?: number;
  volume24h?: number;
  change1h?: number;
  change24h?: number;
  liquidity?: number;
  boostAmount?: number;
  twitterUrl?: string;
  telegramUrl?: string;
  websiteUrl?: string;
  dexUrl: string;
  pairCreatedAt?: number;
  source: "boost" | "profile" | "search" | "trending" | "watch";
};

export type Kol = {
  handle: string;
  name: string;
  note: string;
};

export type TabId = "radar" | "boosts" | "trending" | "kols" | "scanner" | "watch";
