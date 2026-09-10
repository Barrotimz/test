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
  volume?: { h24?: number; h6?: number; h1?: number; m5?: number };
  priceChange?: { h24?: number; h6?: number; h1?: number; m5?: number };
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  txns?: {
    m5?: { buys?: number; sells?: number };
    h1?: { buys?: number; sells?: number };
    h24?: { buys?: number; sells?: number };
  };
  info?: {
    imageUrl?: string;
    socials?: { url: string; type: string }[];
    websites?: { url: string; label?: string }[];
  };
  boosts?: { active?: number };
};

export type TokenStage = "launching" | "live" | "graduated";

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
  fdv?: number;
  volume5m?: number;
  volume1h?: number;
  volume24h?: number;
  change5m?: number;
  change1h?: number;
  change24h?: number;
  liquidity?: number;
  boostAmount?: number;
  buys5m?: number;
  sells5m?: number;
  buys1h?: number;
  sells1h?: number;
  buyers1h?: number;
  sellers1h?: number;
  txns24h?: number;
  dexId?: string;
  launchpad?: string;
  twitterUrl?: string;
  telegramUrl?: string;
  websiteUrl?: string;
  dexUrl: string;
  pairCreatedAt?: number;
  replies?: number;
  bondingPct?: number;
  livestream?: boolean;
  creator?: string;
  username?: string;
  kingOfHill?: boolean;
  nsfw?: boolean;
  tweetUrl?: string;
  tweetText?: string;
  tweetLikes?: number;
  tweetRetweets?: number;
  tweetReplies?: number;
  tweetQuotes?: number;
  tweetBookmarks?: number;
  tweetViews?: number | null;
  twitterFollowers?: number;
  twitterHandle?: string;
  twitterTweets?: number;
  socialCheckedAt?: number;
  stage?: TokenStage;
  seenAt?: number;
  source: "boost" | "profile" | "search" | "trending" | "watch" | "launch" | "newpool";
};

export type Kol = {
  handle: string;
  name: string;
  note: string;
};

export type TabId =
  | "trending"
  | "meta"
  | "hot"
  | "warm"
  | "launch"
  | "cooling"
  | "learn"
  | "radar"
  | "boosts"
  | "scanner"
  | "kols"
  | "watch";

export type FeedEvent = {
  id: string;
  at: number;
  text: string;
};
