import { useState } from "react";
import { chainLabel, formatCount, formatPnl, kindLabel } from "../lib/format";
import { displayPnl, formatRemain, isLive, markCall } from "../lib/tape";
import { useNow } from "../lib/useNow";
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
  const now = useNow(1000);
  const author = traderById(state, post.authorId);
  const liked = state.liked.includes(post.id);
  const saved = state.bookmarked.includes(post.id);
  const following = post.authorId === "you" || state.following.includes(post.authorId);
  const [burst, setBurst] = useState(false);
  const mark = markCall(post, now);
  const live = isLive(post, now);
  const pnlValue = displayPnl(post, now);
  const pnl = formatPnl(pnlValue);
  const side = state.sided[post.id];
  const rideShare = post.rides + post.fades === 0 ? 50 : Math.round((post.rides / (post.rides + post.fades)) * 100);

  function like(fromDouble = false) {
    if (fromDouble && liked) return;
    dispatch({ type: "like", postId: post.id });
    if (fromDouble || !liked) {
      setBurst(true);
      window.setTimeout(() => setBurst(false), 700);
    }
  }

  function share() {
    const text = `$${post.token} slip on Blotter — ${post.caption}`;
    void navigator.clipboard?.writeText(text).catch(() => undefined);
    dispatch({ type: "share", postId: post.id });
  }

  const stamp = live
    ? "LIVE CALL"
    : mark?.settled && mark.hit
      ? "CALL HIT"
      : mark?.settled && mark.hit === false
        ? "CALL MISS"
        : kindLabel(post.kind);

  return (
    <article className={`reel ${live ? "is-live" : ""} ${post.kind === "loss" ? "is-grave" : ""}`} style={{ ["--h" as string]: String(post.theme) }}>
      <div className={`reel-visual ${post.kind}`}>
        <div className="orb a" />
        <div className="orb b" />
        <svg className="chart" viewBox="0 0 100 40" preserveAspectRatio="none">
          <polyline
            fill="none"
            stroke={pnlValue !== undefined && pnlValue < 0 ? "#ff6b6b" : "#d6ff3f"}
            strokeWidth="1.4"
            points={pnlValue !== undefined && pnlValue < 0 ? "0,8 18,12 32,10 48,22 64,18 78,32 100,36" : "0,32 16,28 30,30 46,18 62,16 78,8 100,6"}
          />
        </svg>
      </div>

      <div className="receipt">
        <div className="receipt-top">
          <span className={`stamp ${live ? "live" : mark?.hit === false ? "miss" : ""}`}>
            {live && <i className="pulse" />}
            {stamp} · {chainLabel(post.chain)}
          </span>
          <span className="slip-id">RCPT {post.id.slice(-4).toUpperCase()}</span>
        </div>
        <button type="button" className="receipt-token" onClick={() => onOpenToken(post.token)}>
          ${post.token}
        </button>
        <h2 className={pnlValue !== undefined && pnlValue < 0 ? "down" : "up"}>{pnl ?? "—"}</h2>
        {live && mark && (
          <p className="clock">
            Target {formatPnl(post.call?.targetPct)} · {formatRemain(mark.remainingMs)} left
          </p>
        )}
        {mark?.settled && (
          <p className="clock">Target was {formatPnl(post.call?.targetPct)}</p>
        )}
        {post.receipt && (
          <div className="slip-grid">
            <div>
              <small>Entry MC</small>
              <b>{post.receipt.entryMc}</b>
            </div>
            <div>
              <small>Size</small>
              <b>{post.receipt.size}</b>
            </div>
            <div>
              <small>Hold</small>
              <b>{post.receipt.hold}</b>
            </div>
            <div>
              <small>Bag</small>
              <b>{post.receipt.stillIn ? "still in" : "out"}</b>
            </div>
          </div>
        )}
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
                {following ? "Watching" : "Watch"}
              </button>
            )}
          </div>
          <p className="caption">{post.caption}</p>
          {post.kind === "call" && (
            <div className="side-box">
              <div className="tug" aria-hidden>
                <span style={{ width: `${rideShare}%` }} />
              </div>
              <div className="sides">
                <button
                  type="button"
                  className={`side ride ${side === "ride" ? "on" : ""}`}
                  onClick={() => dispatch({ type: "side", postId: post.id, side: "ride" })}
                  disabled={author.id === "you"}
                >
                  Ride {formatCount(post.rides)}
                </button>
                <button
                  type="button"
                  className={`side fade ${side === "fade" ? "on" : ""}`}
                  onClick={() => dispatch({ type: "side", postId: post.id, side: "fade" })}
                  disabled={author.id === "you"}
                >
                  Fade {formatCount(post.fades)}
                </button>
              </div>
            </div>
          )}
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
        <button type="button" onClick={share} aria-label="Share">
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
