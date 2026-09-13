import { useMemo, useState } from "react";
import { formatPnl, kindLabel } from "../lib/format";
import { useStore } from "../store";
import type { Chain, PostKind, Tab } from "../types";

const KINDS: PostKind[] = ["win", "loss", "call", "story"];
const CHAINS: Chain[] = ["sol", "eth", "base", "bsc"];

export function Create({ onDone }: { onDone: (tab: Tab) => void }) {
  const { dispatch } = useStore();
  const [kind, setKind] = useState<PostKind>("win");
  const [token, setToken] = useState("PEPE");
  const [chain, setChain] = useState<Chain>("sol");
  const [pnl, setPnl] = useState("120");
  const [caption, setCaption] = useState("");
  const [theme, setTheme] = useState(120);
  const [asStory, setAsStory] = useState(false);

  const parsedPnl = useMemo(() => {
    if (kind === "call" || kind === "story") return undefined;
    const value = Number(pnl);
    if (Number.isNaN(value)) return undefined;
    return kind === "loss" ? -Math.abs(value) : Math.abs(value);
  }, [kind, pnl]);

  const canPost = token.trim().length > 0 && caption.trim().length > 0;

  function publish() {
    if (!canPost) return;
    dispatch({
      type: "createPost",
      kind,
      token,
      chain,
      pnl: parsedPnl,
      caption,
      theme,
    });
    if (asStory) {
      dispatch({
        type: "createStory",
        caption,
        token,
        kind,
        pnl: parsedPnl,
        theme,
      });
    }
    onDone("home");
  }

  return (
    <div className="create">
      <h1>Post a reel</h1>
      <p className="lede">Wins, rugs, calls — keep it a story, not a signal.</p>

      <div className="kinds">
        {KINDS.map((item) => (
          <button key={item} type="button" className={kind === item ? "on" : ""} onClick={() => setKind(item)}>
            {kindLabel(item)}
          </button>
        ))}
      </div>

      <div className="row2">
        <div className="field">
          <label htmlFor="token">Token</label>
          <input
            id="token"
            value={token}
            onChange={(event) => setToken(event.target.value.toUpperCase())}
            placeholder="WIF"
          />
        </div>
        <div className="field">
          <label htmlFor="chain">Chain</label>
          <select id="chain" value={chain} onChange={(event) => setChain(event.target.value as Chain)}>
            {CHAINS.map((item) => (
              <option key={item} value={item}>
                {item.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {(kind === "win" || kind === "loss") && (
        <div className="field">
          <label htmlFor="pnl">PnL %</label>
          <input id="pnl" inputMode="decimal" value={pnl} onChange={(event) => setPnl(event.target.value)} />
        </div>
      )}

      <div className="field">
        <label htmlFor="caption">Caption</label>
        <textarea
          id="caption"
          rows={3}
          maxLength={180}
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          placeholder="What happened? Keep it human."
        />
      </div>

      <div className="field">
        <label htmlFor="theme">Mood color</label>
        <input
          id="theme"
          type="range"
          min={0}
          max={360}
          value={theme}
          onChange={(event) => setTheme(Number(event.target.value))}
        />
      </div>

      <label className="author" style={{ marginBottom: 12 }} htmlFor="as-story">
        <input
          id="as-story"
          type="checkbox"
          checked={asStory}
          onChange={(event) => setAsStory(event.target.checked)}
          style={{ width: 18, padding: 0 }}
        />
        Also drop this as a 24h story
      </label>

      <div className="preview" style={{ ["--h" as string]: String(theme) }}>
        <div className={`reel-visual ${kind}`} style={{ position: "absolute", inset: 0 }}>
          <div className="orb a" />
        </div>
        <div className="pnl-hero" style={{ inset: "20% 12px auto" }}>
          <span className="kind">{kindLabel(kind)}</span>
          <h2 className={parsedPnl !== undefined && parsedPnl < 0 ? "down" : "up"} style={{ fontSize: 64 }}>
            {formatPnl(parsedPnl) ?? `$${token || "TICKER"}`}
          </h2>
          <div className="token">${token || "TICKER"}</div>
        </div>
      </div>

      <button className="publish" type="button" disabled={!canPost} onClick={publish}>
        {asStory ? "Post reel + story" : "Post reel"}
      </button>
      <p className="disclaimer">
        Entertainment only. Not financial advice, not a brokerage, and not a place to dump contract addresses as
        guaranteed plays.
      </p>
    </div>
  );
}
