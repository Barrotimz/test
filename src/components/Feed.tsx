import { useMemo, useRef } from "react";
import { isGrave, isLive } from "../lib/tape";
import { useNow } from "../lib/useNow";
import { traderById, useStore } from "../store";
import type { HomeLane, Post } from "../types";
import { Avatar } from "./Avatar";
import { ReelCard } from "./ReelCard";

type Props = {
  lane: HomeLane;
  onLane: (lane: HomeLane) => void;
  tokenFilter?: string | null;
  onClearToken?: () => void;
  posts?: Post[];
  onOpenComments: (postId: string) => void;
  onOpenProfile: (traderId: string) => void;
  onOpenToken: (token: string) => void;
  onOpenStory: (authorId: string) => void;
};

const LANES: { id: HomeLane; label: string }[] = [
  { id: "live", label: "Live" },
  { id: "tape", label: "Tape" },
  { id: "following", label: "Watch" },
  { id: "graveyard", label: "R.I.P." },
];

export function Feed({
  lane,
  onLane,
  tokenFilter,
  onClearToken,
  posts,
  onOpenComments,
  onOpenProfile,
  onOpenToken,
  onOpenStory,
}: Props) {
  const { state } = useStore();
  const now = useNow(2000);
  const scroller = useRef<HTMLDivElement>(null);

  const list = useMemo(() => {
    const source = posts ?? state.posts;
    const filtered = tokenFilter ? source.filter((post) => post.token === tokenFilter) : source;
    if (lane === "following") {
      return filtered.filter((post) => post.authorId === "you" || state.following.includes(post.authorId));
    }
    if (lane === "live") return filtered.filter((post) => isLive(post, now));
    if (lane === "graveyard") return filtered.filter((post) => isGrave(post, now));
    return filtered;
  }, [lane, now, posts, state.following, state.posts, tokenFilter]);

  const storyAuthors = useMemo(() => {
    const ids = [...new Set(state.stories.map((story) => story.authorId))];
    return ["you", ...ids.filter((id) => id !== "you" && state.following.includes(id))];
  }, [state.following, state.stories]);

  return (
    <div className="stage">
      <div className="top-lane">
        {LANES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={lane === item.id ? "on" : ""}
            onClick={() => onLane(item.id)}
          >
            {item.label}
          </button>
        ))}
        {tokenFilter && (
          <button type="button" className="on" onClick={onClearToken}>
            ${tokenFilter} ×
          </button>
        )}
      </div>

      <div className={lane === "following" ? "follow-col" : undefined} style={{ height: "100%" }}>
        {lane === "following" && (
          <div className="stories">
            {storyAuthors.map((id) => {
              const trader = traderById(state, id);
              const seen = state.seenStories.includes(id);
              const has = state.stories.some((story) => story.authorId === id);
              if (!has) return null;
              return (
                <button key={id} className="story-dot" type="button" onClick={() => onOpenStory(id)}>
                  <Avatar name={trader.name} hue={trader.hue} ring={seen ? "seen" : "live"} />
                  <span>{id === "you" ? "You" : trader.handle}</span>
                </button>
              );
            })}
          </div>
        )}

        {list.length === 0 ? (
          <div className="empty">
            <div>
              <p>{lane === "live" ? "No live calls right now." : "No receipts here yet."}</p>
              <p>Drop a call or watch someone on the tape.</p>
            </div>
          </div>
        ) : (
          <div className="feed" ref={scroller}>
            {list.map((post) => (
              <ReelCard
                key={post.id}
                post={post}
                onOpenComments={onOpenComments}
                onOpenProfile={onOpenProfile}
                onOpenToken={onOpenToken}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
