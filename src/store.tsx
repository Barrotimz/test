import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";
import { initialState } from "./data/seed";
import { uid } from "./lib/format";
import type {
  AppState,
  Chain,
  Comment,
  Notice,
  Post,
  PostKind,
  Receipt,
  Side,
  StoryItem,
  Trader,
} from "./types";

const KEY = "blotter.v1";

type Action =
  | { type: "onboard"; handle: string; name: string; hue: number }
  | { type: "like"; postId: string }
  | { type: "bookmark"; postId: string }
  | { type: "follow"; traderId: string }
  | { type: "share"; postId: string }
  | { type: "side"; postId: string; side: Side }
  | { type: "comment"; postId: string; text: string }
  | {
      type: "createPost";
      kind: PostKind;
      token: string;
      chain: Chain;
      pnl?: number;
      caption: string;
      theme: number;
      receipt?: Receipt;
      call?: { targetPct: number; windowMs: number };
    }
  | { type: "createStory"; caption: string; token?: string; kind: PostKind; pnl?: number; theme: number }
  | { type: "seeStories"; authorId: string }
  | { type: "readNotices" }
  | { type: "flash"; text: string }
  | { type: "updateYou"; patch: Partial<Pick<Trader, "name" | "bio" | "handle" | "hue">> };

function persist(state: AppState) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed.you || !Array.isArray(parsed.posts) || !parsed.sided) return initialState();
    return {
      ...initialState(),
      ...parsed,
      you: { ...initialState().you, ...parsed.you, you: true },
      sided: parsed.sided ?? {},
      shareTick: parsed.shareTick ?? 0,
    };
  } catch {
    return initialState();
  }
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "onboard": {
      const handle = action.handle.replace(/^@/, "").toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 18) || "you";
      return {
        ...state,
        onboarded: true,
        you: { ...state.you, handle, name: action.name.trim() || handle, hue: action.hue },
      };
    }
    case "like": {
      const liked = toggle(state.liked, action.postId);
      const on = liked.includes(action.postId);
      return {
        ...state,
        liked,
        posts: state.posts.map((post) =>
          post.id === action.postId ? { ...post, likes: Math.max(0, post.likes + (on ? 1 : -1)) } : post,
        ),
      };
    }
    case "bookmark": {
      const bookmarked = toggle(state.bookmarked, action.postId);
      const on = bookmarked.includes(action.postId);
      return {
        ...state,
        bookmarked,
        posts: state.posts.map((post) =>
          post.id === action.postId ? { ...post, bookmarks: Math.max(0, post.bookmarks + (on ? 1 : -1)) } : post,
        ),
      };
    }
    case "follow": {
      if (action.traderId === "you") return state;
      const following = toggle(state.following, action.traderId);
      const on = following.includes(action.traderId);
      return {
        ...state,
        following,
        you: { ...state.you, following: Math.max(0, state.you.following + (on ? 1 : -1)) },
        traders: state.traders.map((trader) =>
          trader.id === action.traderId
            ? { ...trader, followers: Math.max(0, trader.followers + (on ? 1 : -1)) }
            : trader,
        ),
      };
    }
    case "share":
      return {
        ...state,
        posts: state.posts.map((post) =>
          post.id === action.postId ? { ...post, shares: post.shares + 1 } : post,
        ),
        notices: [
          {
            id: uid("n"),
            text: "Slip copied. Flash it in the group chat.",
            createdAt: Date.now(),
            read: false,
          },
          ...state.notices,
        ],
        shareTick: state.shareTick + 1,
      };
    case "side": {
      const post = state.posts.find((item) => item.id === action.postId);
      if (!post || post.authorId === "you" || post.kind !== "call") return state;
      const prev = state.sided[action.postId];
      const sided = { ...state.sided };
      let rides = post.rides;
      let fades = post.fades;
      if (prev === action.side) {
        delete sided[action.postId];
        if (action.side === "ride") rides = Math.max(0, rides - 1);
        else fades = Math.max(0, fades - 1);
      } else {
        if (prev === "ride") rides = Math.max(0, rides - 1);
        if (prev === "fade") fades = Math.max(0, fades - 1);
        sided[action.postId] = action.side;
        if (action.side === "ride") rides += 1;
        else fades += 1;
      }
      return {
        ...state,
        sided,
        posts: state.posts.map((item) => (item.id === action.postId ? { ...item, rides, fades } : item)),
      };
    }
    case "comment": {
      const text = action.text.trim();
      if (!text) return state;
      const comment: Comment = {
        id: uid("c"),
        postId: action.postId,
        authorId: "you",
        text,
        createdAt: Date.now(),
      };
      return {
        ...state,
        comments: [...state.comments, comment],
        posts: state.posts.map((post) =>
          post.id === action.postId ? { ...post, comments: post.comments + 1 } : post,
        ),
      };
    }
    case "createPost": {
      const token = action.token.replace(/^\$/, "").toUpperCase().slice(0, 12);
      if (!token || !action.caption.trim()) return state;
      const createdAt = Date.now();
      const post: Post = {
        id: uid("p"),
        authorId: "you",
        kind: action.kind,
        token,
        chain: action.chain,
        pnl: action.pnl,
        caption: action.caption.trim().slice(0, 180),
        likes: 0,
        comments: 0,
        bookmarks: 0,
        shares: 0,
        rides: 0,
        fades: 0,
        createdAt,
        theme: action.theme,
        sound: "original sound — you",
        receipt: action.receipt,
        call:
          action.kind === "call" && action.call
            ? {
                targetPct: action.call.targetPct,
                expiresAt: createdAt + action.call.windowMs,
                seed: Math.floor(Math.random() * 20) + 1,
              }
            : undefined,
      };
      const notice: Notice = {
        id: uid("n"),
        text:
          action.kind === "call"
            ? `Your $${token} call is live. People can ride or fade it.`
            : `Your $${token} receipt is on the tape.`,
        createdAt,
        read: false,
      };
      return { ...state, posts: [post, ...state.posts], notices: [notice, ...state.notices] };
    }
    case "createStory": {
      const story: StoryItem = {
        id: uid("s"),
        authorId: "you",
        token: action.token?.replace(/^\$/, "").toUpperCase().slice(0, 12),
        caption: action.caption.trim().slice(0, 120),
        createdAt: Date.now(),
        theme: action.theme,
        kind: action.kind,
        pnl: action.pnl,
      };
      return {
        ...state,
        stories: [story, ...state.stories],
        seenStories: state.seenStories.filter((id) => id !== "you"),
      };
    }
    case "seeStories":
      return state.seenStories.includes(action.authorId)
        ? state
        : { ...state, seenStories: [...state.seenStories, action.authorId] };
    case "readNotices":
      return { ...state, notices: state.notices.map((notice) => ({ ...notice, read: true })) };
    case "flash":
      return {
        ...state,
        shareTick: state.shareTick + 1,
        notices: [
          { id: uid("n"), text: action.text, createdAt: Date.now(), read: false },
          ...state.notices,
        ],
      };
    case "updateYou":
      return { ...state, you: { ...state.you, ...action.patch } };
    default:
      return state;
  }
}

const StoreContext = createContext<{ state: AppState; dispatch: Dispatch<Action> } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);

  useEffect(() => {
    persist(state);
  }, [state]);

  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("Store missing");
  return ctx;
}

export function traderById(state: AppState, id: string): Trader {
  if (id === "you") return state.you;
  return state.traders.find((trader) => trader.id === id) ?? state.you;
}

export function commentsFor(state: AppState, postId: string): Comment[] {
  return state.comments.filter((comment) => comment.postId === postId).sort((a, b) => a.createdAt - b.createdAt);
}

export function storiesByAuthor(state: AppState) {
  const groups = new Map<string, StoryItem[]>();
  for (const story of [...state.stories].sort((a, b) => a.createdAt - b.createdAt)) {
    const list = groups.get(story.authorId) ?? [];
    list.push(story);
    groups.set(story.authorId, list);
  }
  return groups;
}
