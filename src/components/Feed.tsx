import { useMemo, useRef } from "react";
import { traderById, useStore } from "../store";
import type { HomeLane, Post } from "../types";
import { Avatar } from "./Avatar";
import { ReelCard } from "./ReelCard";

type Props = {
  lane: HomeLane;
  onLane: (lane: HomeLane) => void;
  tokenFilter?: string | null;
  posts?: Post[];
  onOpenComments: (postId: string) => void;
  onOpenProfile: (traderId: string) => void;
  onOpenToken: (token: string) => void;
  onOpenStory: (authorId: string) => void;
};

export function Feed({
  lane,
  onLane,
  tokenFilter,
  posts,
  onOpenComments,
  onOpenProfile,
  onOpenToken,
  onOpenStory,
}: Props) {
  const { state } = useStore();
  const scroller = useRef<HTMLDivElement>(null);

  const list = useMemo(() => {
    const source = posts ?? state.posts;
    const filtered = tokenFilter ? source.filter((post) => post.token === tokenFilter) : source;
    if (lane === "following") {
      return filtered.filter((post) => post.authorId === "you" || state.following.includes(post.authorId));
    }
    return filtered;
  }, [lane, posts, state.following, state.posts, tokenFilter]);

  const storyAuthors = useMemo(() => {
    const ids = [...new Set(state.stories.map((story) => story.authorId))];
    return ["you", ...ids.filter((id) => id !== "you")];
  }, [state.stories]);

  return (
    <div className="stage">
      <div className="top-lane">
        <button type="button" className={lane === "following" ? "on" : ""} onClick={() => onLane("following")}>
          Following
        </button>
        <button type="button" className={lane === "foryou" && !tokenFilter ? "on" : ""} onClick={() => onLane("foryou")}>
          For You
        </button>
        {tokenFilter && <button type="button" className="on">${tokenFilter}</button>}
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
              <p>No reels here yet.</p>
              <p>Follow traders or post your first bag story.</p>
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
