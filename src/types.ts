export type Chain = "sol" | "eth" | "base" | "bsc";
export type PostKind = "win" | "loss" | "call" | "story";
export type Tab = "home" | "explore" | "create" | "inbox" | "profile";
export type HomeLane = "live" | "tape" | "following" | "graveyard";
export type Side = "ride" | "fade";
export type Rank = "Shrimp" | "Crab" | "Ape" | "Wizard" | "Deity";

export type Trader = {
  id: string;
  handle: string;
  name: string;
  bio: string;
  hue: number;
  followers: number;
  following: number;
  verified?: boolean;
  you?: boolean;
};

export type Receipt = {
  entryMc: string;
  size: string;
  hold: string;
  stillIn?: boolean;
};

export type CallSpec = {
  targetPct: number;
  expiresAt: number;
  seed: number;
};

export type Post = {
  id: string;
  authorId: string;
  kind: PostKind;
  token: string;
  chain: Chain;
  pnl?: number;
  caption: string;
  likes: number;
  comments: number;
  bookmarks: number;
  shares: number;
  rides: number;
  fades: number;
  createdAt: number;
  theme: number;
  sound: string;
  receipt?: Receipt;
  call?: CallSpec;
};

export type StoryItem = {
  id: string;
  authorId: string;
  token?: string;
  caption: string;
  createdAt: number;
  theme: number;
  kind: PostKind;
  pnl?: number;
};

export type Comment = {
  id: string;
  postId: string;
  authorId: string;
  text: string;
  createdAt: number;
};

export type Notice = {
  id: string;
  text: string;
  createdAt: number;
  read: boolean;
};

export type AppState = {
  you: Trader;
  traders: Trader[];
  posts: Post[];
  stories: StoryItem[];
  comments: Comment[];
  notices: Notice[];
  liked: string[];
  bookmarked: string[];
  following: string[];
  seenStories: string[];
  sided: Record<string, Side>;
  shareTick: number;
  onboarded: boolean;
};
