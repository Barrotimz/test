export type Chain = "sol" | "eth" | "base" | "bsc";
export type PostKind = "win" | "loss" | "call" | "story";
export type Tab = "home" | "explore" | "create" | "inbox" | "profile";
export type HomeLane = "foryou" | "following";

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
  createdAt: number;
  theme: number;
  sound: string;
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
  onboarded: boolean;
};
