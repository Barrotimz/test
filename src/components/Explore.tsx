import { useMemo, useState } from "react";
import { formatCount } from "../lib/format";
import { useStore } from "../store";

export function Explore({
  onOpenToken,
  onOpenProfile,
}: {
  onOpenToken: (token: string) => void;
  onOpenProfile: (traderId: string) => void;
}) {
  const { state, dispatch } = useStore();
  const [q, setQ] = useState("");

  const tokens = useMemo(() => {
    const map = new Map<string, { likes: number; posts: number; pnl: number[] }>();
    for (const post of state.posts) {
      const cur = map.get(post.token) ?? { likes: 0, posts: 0, pnl: [] };
      cur.likes += post.likes;
      cur.posts += 1;
      if (post.pnl !== undefined) cur.pnl.push(post.pnl);
      map.set(post.token, cur);
    }
    return [...map.entries()]
      .map(([token, stats]) => ({
        token,
        ...stats,
        avg: stats.pnl.length ? Math.round(stats.pnl.reduce((a, b) => a + b, 0) / stats.pnl.length) : 0,
      }))
      .sort((a, b) => b.likes - a.likes);
  }, [state.posts]);

  const query = q.trim().toLowerCase();
  const shownTokens = tokens.filter((item) => !query || item.token.toLowerCase().includes(query.replace("$", "")));
  const people = state.traders.filter(
    (trader) => !query || trader.handle.includes(query) || trader.name.toLowerCase().includes(query),
  );

  return (
    <div className="page">
      <h1>Explore</h1>
      <p className="lede">Trending tickers and the traders flexing them.</p>
      <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search $WIF or @handle" />

      <h3 style={{ margin: "22px 0 10px" }}>Trending coins</h3>
      <div className="token-row">
        {shownTokens.map((item) => (
          <button key={item.token} className="token-card" type="button" onClick={() => onOpenToken(item.token)}>
            <div>
              <b>${item.token}</b>
              <div className="muted">{item.posts} reels · {formatCount(item.likes)} likes</div>
            </div>
            <strong className={item.avg < 0 ? "down" : "up"}>{item.avg > 0 ? "+" : ""}{item.avg}%</strong>
          </button>
        ))}
      </div>

      <h3 style={{ margin: "8px 0 10px" }}>Traders</h3>
      <div className="token-row">
        {people.map((trader) => {
          const following = state.following.includes(trader.id);
          return (
            <div className="person-card" key={trader.id}>
              <button type="button" onClick={() => onOpenProfile(trader.id)} style={{ textAlign: "left" }}>
                <b>@{trader.handle}</b>
                <div className="muted">{formatCount(trader.followers)} followers</div>
              </button>
              <button
                type="button"
                className={`follow ${following ? "on" : ""}`}
                onClick={() => dispatch({ type: "follow", traderId: trader.id })}
              >
                {following ? "Following" : "Follow"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
