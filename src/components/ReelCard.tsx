import { useState } from "react";
import { chainLabel, formatCount, formatPnl, kindLabel } from "../lib/format";
import { traderById, useStore } from "../store";
import type { Post } from "../types";
import { Avatar } from "./Avatar";
import { IconBookmark, IconChat, IconHeart, IconShare } from "./Icons";

type Props = {
  post: Post;
  onOpenComments: (postId: string) => void;
  onOpenProfile: (traderId: string) => void;
  onOpenToken: (token: string) => void;
};

export function ReelCard({ post, onOpenComments, onOpenProfile, onOpenToken }: Props) {
  const { state, dispatch } = useStore();
  const author = traderById(state, post.authorId);
  const liked = state.liked.includes(post.id);
  const saved = state.bookmarked.includes(post.id);
  const following = post.authorId === "you" || state.following.includes(post.authorId);
  const [burst, setBurst] = useState(false);
  const pnl = formatPnl(post.pnl);

  function like(fromDouble = false) {
    if (fromDouble && liked) return;
    dispatch({ type: "like", postId: post.id });
    if (fromDouble || !liked) {
      setBurst(true);
      window.setTimeout(() => setBurst(false), 700);
    }
  }

  async function share() {
    const text = `$${post.token} on Pumptok — ${post.caption}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
    dispatch({ type: "share", postId: post.id });
  }

  return (
    <article className="reel" style={{ ["--h" as string]: String(post.theme) }}>
      <div className={`reel-visual ${post.kind}`}>
        <div className="orb a" />
        <div className="orb b" />
        <svg className="chart" viewBox="0 0 100 40" preserveAspectRatio="none">
          <polyline
            fill="none"
            stroke={post.kind === "loss" ? "#ff6b6b" : "#d6ff3f"}
            strokeWidth="1.4"
            points={post.kind === "loss" ? "0,8 18,12 32,10 48,22 64,18 78,32 100,36" : "0,32 16,28 30,30 46,18 62,16 78,8 100,6"}
          />
        </svg>
      </div>

      <div className="pnl-hero">
        <span className="kind">
          {kindLabel(post.kind)} · {chainLabel(post.chain)}
        </span>
        <h2 className={post.pnl !== undefined && post.pnl < 0 ? "down" : "up"}>{pnl ?? `$${post.token}`}</h2>
        <div className="token">${post.token}</div>
      </div>

      <div className="tap-layer" onDoubleClick={() => like(true)} />

      <div className="reel-ui">
        <div className="meta">
          <div className="author">
            <button type="button" onClick={() => onOpenProfile(author.id)} aria-label={`Open ${author.handle}`}>
              <Avatar name={author.name} hue={author.hue} />
            </button>
            <button type="button" onClick={() => onOpenProfile(author.id)}>
              <strong>@{author.handle}</strong>
            </button>
            {author.id !== "you" && (
              <button
                type="button"
                className={`follow ${following ? "on" : ""}`}
                onClick={() => dispatch({ type: "follow", traderId: author.id })}
              >
                {following ? "Following" : "Follow"}
              </button>
            )}
          </div>
          <p className="caption">
            {post.caption}{" "}
            <button type="button" onClick={() => onOpenToken(post.token)}>
              ${post.token}
            </button>
          </p>
          <div className="sound">
            <span className="disc" />
            {post.sound}
          </div>
        </div>
      </div>

      <div className="actions">
        <button type="button" onClick={() => like()} aria-label="Like">
          <span className={`icon ${liked ? "on" : ""}`}>
            <IconHeart filled={liked} />
          </span>
          <div className="count">{formatCount(post.likes)}</div>
        </button>
        <button type="button" onClick={() => onOpenComments(post.id)} aria-label="Comments">
          <span className="icon">
            <IconChat />
          </span>
          <div className="count">{formatCount(post.comments)}</div>
        </button>
        <button type="button" onClick={() => dispatch({ type: "bookmark", postId: post.id })} aria-label="Save">
          <span className={`icon ${saved ? "saved" : ""}`}>
            <IconBookmark filled={saved} />
          </span>
          <div className="count">{formatCount(post.bookmarks)}</div>
        </button>
        <button type="button" onClick={() => void share()} aria-label="Share">
          <span className="icon">
            <IconShare />
          </span>
          <div className="count">{formatCount(post.shares)}</div>
        </button>
        <button type="button" onClick={() => onOpenProfile(author.id)} aria-label="Author">
          <Avatar name={author.name} hue={author.hue} />
        </button>
      </div>

      <div className={`heart-pop ${burst ? "show" : ""}`}>♥</div>
    </article>
  );
}
