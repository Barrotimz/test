import { useMemo, useState } from "react";
import { formatCount, formatPnl } from "../lib/format";
import { traderById, useStore } from "../store";
import type { Post } from "../types";
import { Avatar } from "./Avatar";

export function Profile({
  traderId,
  onOpenPost,
}: {
  traderId: string;
  onOpenPost: (posts: Post[], startId: string) => void;
}) {
  const { state, dispatch } = useStore();
  const trader = traderById(state, traderId);
  const posts = state.posts.filter((post) => post.authorId === traderId);
  const following = traderId !== "you" && state.following.includes(traderId);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(trader.name);
  const [bio, setBio] = useState(trader.bio);
  const saved = useMemo(
    () => state.posts.filter((post) => state.bookmarked.includes(post.id)),
    [state.bookmarked, state.posts],
  );
  const [shelf, setShelf] = useState<"reels" | "saved">("reels");
  const shown = traderId === "you" && shelf === "saved" ? saved : posts;

  function save() {
    dispatch({ type: "updateYou", patch: { name: name.trim() || trader.handle, bio: bio.trim() } });
    setEditing(false);
  }

  return (
    <div className="page">
      <div className="profile-head">
        <Avatar name={trader.name} hue={trader.hue} size="lg" />
        <div>
          <h1 style={{ marginBottom: 0 }}>@{trader.handle}</h1>
          <div className="muted">{trader.name}{trader.verified ? " · verified degen" : ""}</div>
        </div>
        {editing ? (
          <div style={{ width: "100%", display: "grid", gap: 8 }}>
            <input value={name} onChange={(event) => setName(event.target.value)} />
            <textarea rows={3} value={bio} onChange={(event) => setBio(event.target.value)} />
            <button className="publish" type="button" onClick={save}>
              Save profile
            </button>
          </div>
        ) : (
          <p className="lede" style={{ marginBottom: 0 }}>{trader.bio}</p>
        )}
        <div className="stats">
          <div>
            <b>{posts.length}</b>
            <span className="muted">reels</span>
          </div>
          <div>
            <b>{formatCount(trader.followers)}</b>
            <span className="muted">followers</span>
          </div>
          <div>
            <b>{formatCount(trader.following)}</b>
            <span className="muted">following</span>
          </div>
        </div>
        {traderId === "you" ? (
          <button className="edit" type="button" onClick={() => setEditing((v) => !v)}>
            {editing ? "Cancel" : "Edit profile"}
          </button>
        ) : (
          <button
            className={`follow ${following ? "on" : ""}`}
            type="button"
            onClick={() => dispatch({ type: "follow", traderId })}
          >
            {following ? "Following" : "Follow"}
          </button>
        )}
        {traderId === "you" && (
          <div className="chips" style={{ marginTop: 8 }}>
            <button type="button" className={`chip ${shelf === "reels" ? "active" : ""}`} onClick={() => setShelf("reels")}>
              Your reels
            </button>
            <button type="button" className={`chip ${shelf === "saved" ? "active" : ""}`} onClick={() => setShelf("saved")}>
              Saved
            </button>
          </div>
        )}
      </div>

      <div className="grid">
        {shown.map((post) => (
          <button
            key={post.id}
            className="grid-card"
            type="button"
            onClick={() => onOpenPost(shown, post.id)}
            style={{
              background: `linear-gradient(160deg, hsl(${post.theme} 70% 40% / 0.7), #111)`,
            }}
          >
            <span className={post.pnl !== undefined && post.pnl < 0 ? "down" : "up"}>{formatPnl(post.pnl) ?? post.token}</span>
            <small>${post.token}</small>
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="muted" style={{ textAlign: "center" }}>Nothing here yet.</p>}
    </div>
  );
}
