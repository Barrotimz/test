import { useMemo, useState } from "react";
import { formatCount, formatPnl } from "../lib/format";
import { isLive, markCall, scoreTrader } from "../lib/tape";
import { useNow } from "../lib/useNow";
import { useStore } from "../store";

export function Explore({
  onOpenToken,
  onOpenProfile,
}: {
  onOpenToken: (token: string) => void;
  onOpenProfile: (traderId: string) => void;
}) {
  const { state, dispatch } = useStore();
  const now = useNow(2000);
  const [q, setQ] = useState("");

  const live = useMemo(
    () => state.posts.filter((post) => isLive(post, now)).sort((a, b) => b.rides + b.fades - (a.rides + a.fades)),
    [now, state.posts],
  );

  const tokens = useMemo(() => {
    const map = new Map<string, { likes: number; posts: number; pnl: number[] }>();
    for (const post of state.posts) {
      const cur = map.get(post.token) ?? { likes: 0, posts: 0, pnl: [] };
      cur.likes += post.likes;
      cur.posts += 1;
      const mark = markCall(post, now);
      if (mark) cur.pnl.push(mark.pnl);
      else if (post.pnl !== undefined) cur.pnl.push(post.pnl);
      map.set(post.token, cur);
    }
    return [...map.entries()]
      .map(([token, stats]) => ({
        token,
        ...stats,
        avg: stats.pnl.length ? Math.round(stats.pnl.reduce((a, b) => a + b, 0) / stats.pnl.length) : 0,
      }))
      .sort((a, b) => b.likes - a.likes);
  }, [now, state.posts]);

  const query = q.trim().toLowerCase();
  const shownTokens = tokens.filter((item) => !query || item.token.toLowerCase().includes(query.replace("$", "")));
  const people = state.traders.filter(
    (trader) => !query || trader.handle.includes(query) || trader.name.toLowerCase().includes(query),
  );

  return (
    <div className="page">
      <h1>The pit</h1>
      <p className="lede">Open calls first. Open a blotter to see the card behind the tape.</p>
      <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search $WIF or @handle" />

      <h3 style={{ margin: "22px 0 10px" }}>Live calls</h3>
      <div className="token-row">
        {live.length === 0 && <p className="muted">Tape is quiet. Open a call.</p>}
        {live
          .filter((post) => !query || post.token.toLowerCase().includes(query.replace("$", "")))
          .map((post) => {
            const mark = markCall(post, now);
            const share = post.rides + post.fades === 0 ? 50 : Math.round((post.rides / (post.rides + post.fades)) * 100);
            return (
              <button key={post.id} className="token-card call-card" type="button" onClick={() => onOpenToken(post.token)}>
                <div style={{ width: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <b>${post.token}</b>
                    <strong className={mark && mark.pnl < 0 ? "down" : "up"}>{formatPnl(mark?.pnl)}</strong>
                  </div>
                  <div className="muted">
                    @{state.traders.find((trader) => trader.id === post.authorId)?.handle} · target {formatPnl(post.call?.targetPct)}
                  </div>
                  <div className="tug" style={{ marginTop: 8 }}>
                    <span style={{ width: `${share}%` }} />
                  </div>
                  <div className="muted">
                    {formatCount(post.rides)} ride · {formatCount(post.fades)} fade
                  </div>
                </div>
              </button>
            );
          })}
      </div>

      <h3 style={{ margin: "8px 0 10px" }}>Trending receipts</h3>
      <div className="token-row">
        {shownTokens.map((item) => (
          <button key={item.token} className="token-card" type="button" onClick={() => onOpenToken(item.token)}>
            <div>
              <b>${item.token}</b>
              <div className="muted">{item.posts} slips · {formatCount(item.likes)} likes</div>
            </div>
            <strong className={item.avg < 0 ? "down" : "up"}>{item.avg > 0 ? "+" : ""}{item.avg}%</strong>
          </button>
        ))}
      </div>

      <h3 style={{ margin: "8px 0 10px" }}>Ranked traders</h3>
      <div className="token-row">
        {people.map((trader) => {
          const following = state.following.includes(trader.id);
          const card = scoreTrader(state.posts.filter((post) => post.authorId === trader.id), now);
          return (
            <div className="person-card" key={trader.id}>
              <button type="button" onClick={() => onOpenProfile(trader.id)} style={{ textAlign: "left" }}>
                <b>@{trader.handle}</b>
                <div className="muted">
                  {card.rank} · {card.hitRate}% hit · {card.streak} streak
                </div>
              </button>
              <button
                type="button"
                className={`follow ${following ? "on" : ""}`}
                onClick={() => dispatch({ type: "follow", traderId: trader.id })}
              >
                {following ? "Watching" : "Watch"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
