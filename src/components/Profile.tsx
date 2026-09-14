import { useMemo, useState } from "react";
import { formatCount, formatPnl, kindLabel } from "../lib/format";
import { badgeId, blotterCard, displayPnl, isGrave, isLive } from "../lib/tape";
import { useNow } from "../lib/useNow";
import { traderById, useStore } from "../store";
import type { Post } from "../types";
import { Avatar } from "./Avatar";

type Shelf = "slips" | "live" | "rip" | "saved";

export function Profile({
  traderId,
  onOpenPost,
}: {
  traderId: string;
  onOpenPost: (posts: Post[], startId: string) => void;
}) {
  const { state, dispatch } = useStore();
  const now = useNow(2000);
  const trader = traderById(state, traderId);
  const posts = state.posts.filter((post) => post.authorId === traderId);
  const card = blotterCard(posts, now);
  const following = traderId !== "you" && state.following.includes(traderId);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(trader.name);
  const [bio, setBio] = useState(trader.bio);
  const saved = useMemo(
    () => state.posts.filter((post) => state.bookmarked.includes(post.id)),
    [state.bookmarked, state.posts],
  );
  const [shelf, setShelf] = useState<Shelf>("slips");

  const shown = useMemo(() => {
    if (shelf === "saved") return saved;
    if (shelf === "live") return posts.filter((post) => isLive(post, now));
    if (shelf === "rip") return posts.filter((post) => isGrave(post, now));
    return posts;
  }, [now, posts, saved, shelf]);

  function save() {
    dispatch({ type: "updateYou", patch: { name: name.trim() || trader.handle, bio: bio.trim() } });
    setEditing(false);
  }

  function copyCard() {
    const best = card.best ? `${formatPnl(card.bestPnl)} $${card.best.token}` : "no print yet";
    const text = `blotter/@${trader.handle} — ${card.rank} · ${card.hitRate}% hit · best ${best}`;
    void navigator.clipboard?.writeText(text).catch(() => undefined);
    dispatch({ type: "flash", text: `Blotter card for @${trader.handle} copied.` });
  }

  return (
    <div className="page profile-page">
      <article className="id-card" style={{ ["--h" as string]: String(trader.hue) }}>
        <header className="id-top">
          <span>BLOTTER</span>
          <span className="slip-id">{badgeId(trader.handle)}</span>
        </header>
        <div className="id-who">
          <Avatar name={trader.name} hue={trader.hue} size="lg" />
          <div>
            <h1>@{trader.handle}</h1>
            <p className="id-meta">
              {trader.name}
              {trader.verified ? " · pit verified" : ""}
            </p>
            <span className="rank-pill">{card.rank}</span>
          </div>
        </div>
        {editing ? (
          <div className="id-edit">
            <input value={name} onChange={(event) => setName(event.target.value)} aria-label="Display name" />
            <textarea rows={3} value={bio} onChange={(event) => setBio(event.target.value)} aria-label="Bio" />
            <button className="publish" type="button" onClick={save}>
              Save blotter
            </button>
          </div>
        ) : (
          <p className="id-bio">{trader.bio}</p>
        )}
        <div className="id-stats">
          <div>
            <b>{card.hitRate}%</b>
            <span>hit rate</span>
          </div>
          <div>
            <b>{card.streak}</b>
            <span>streak</span>
          </div>
          <div>
            <b>{formatCount(trader.followers)}</b>
            <span>watchers</span>
          </div>
          <div>
            <b>{formatCount(card.rides)}</b>
            <span>rides got</span>
          </div>
        </div>
        <div className="id-sub">
          {card.slips} slips · {card.live} live · {card.graves} in R.I.P.
        </div>
        <div className="id-actions">
          {traderId === "you" ? (
            <button className="edit" type="button" onClick={() => setEditing((v) => !v)}>
              {editing ? "Cancel" : "Edit card"}
            </button>
          ) : (
            <button
              className={`follow ${following ? "on" : ""}`}
              type="button"
              onClick={() => dispatch({ type: "follow", traderId })}
            >
              {following ? "Watching" : "Watch blotter"}
            </button>
          )}
          <button className="edit" type="button" onClick={copyCard}>
            Copy card
          </button>
        </div>
      </article>

      {card.best && (
        <button
          className="best-print"
          type="button"
          onClick={() => onOpenPost(posts, card.best!.id)}
        >
          <small>Best print</small>
          <strong className={card.bestPnl !== undefined && card.bestPnl < 0 ? "down" : "up"}>
            {formatPnl(card.bestPnl)} <em>${card.best.token}</em>
          </strong>
          <span>{card.best.receipt?.size ?? "size n/a"} · {card.best.receipt?.entryMc ?? "mc n/a"}</span>
        </button>
      )}

      <div className="chips">
        <button type="button" className={`chip ${shelf === "slips" ? "active" : ""}`} onClick={() => setShelf("slips")}>
          Slips
        </button>
        <button type="button" className={`chip ${shelf === "live" ? "active" : ""}`} onClick={() => setShelf("live")}>
          Live
        </button>
        <button type="button" className={`chip ${shelf === "rip" ? "active" : ""}`} onClick={() => setShelf("rip")}>
          R.I.P.
        </button>
        {traderId === "you" && (
          <button type="button" className={`chip ${shelf === "saved" ? "active" : ""}`} onClick={() => setShelf("saved")}>
            Saved
          </button>
        )}
      </div>

      <div className="grid blotter-grid">
        {shown.map((post) => {
          const pnl = displayPnl(post, now);
          return (
            <button
              key={post.id}
              className="grid-card"
              type="button"
              onClick={() => onOpenPost(shown, post.id)}
              style={{ background: `linear-gradient(160deg, hsl(${post.theme} 70% 38% / 0.8), #111)` }}
            >
              <small>{isLive(post, now) ? "LIVE" : isGrave(post, now) ? "R.I.P." : kindLabel(post.kind)}</small>
              <span className={pnl !== undefined && pnl < 0 ? "down" : "up"}>{formatPnl(pnl) ?? post.token}</span>
              <b>${post.token}</b>
            </button>
          );
        })}
      </div>
      {shown.length === 0 && <p className="muted" style={{ textAlign: "center" }}>Nothing on this shelf.</p>}
    </div>
  );
}
