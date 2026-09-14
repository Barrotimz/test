import { useMemo, useState } from "react";
import { formatPnl, kindLabel } from "../lib/format";
import { useStore } from "../store";
import type { Chain, HomeLane, PostKind } from "../types";

const KINDS: PostKind[] = ["call", "win", "loss", "story"];
const CHAINS: Chain[] = ["sol", "eth", "base", "bsc"];
const WINDOWS = [
  { label: "15m", ms: 15 * 60 * 1000 },
  { label: "1h", ms: 60 * 60 * 1000 },
  { label: "4h", ms: 4 * 60 * 60 * 1000 },
  { label: "24h", ms: 24 * 60 * 60 * 1000 },
];

export function Create({ onDone }: { onDone: (lane: HomeLane) => void }) {
  const { dispatch } = useStore();
  const [kind, setKind] = useState<PostKind>("call");
  const [token, setToken] = useState("WIF");
  const [chain, setChain] = useState<Chain>("sol");
  const [pnl, setPnl] = useState("120");
  const [target, setTarget] = useState("40");
  const [windowMs, setWindowMs] = useState(WINDOWS[1].ms);
  const [entryMc, setEntryMc] = useState("$8M");
  const [size, setSize] = useState("10 SOL");
  const [hold, setHold] = useState("3h");
  const [stillIn, setStillIn] = useState(true);
  const [caption, setCaption] = useState("");
  const [theme, setTheme] = useState(32);
  const [asStory, setAsStory] = useState(false);

  const parsedPnl = useMemo(() => {
    if (kind === "call" || kind === "story") return undefined;
    const value = Number(pnl);
    if (Number.isNaN(value)) return undefined;
    return kind === "loss" ? -Math.abs(value) : Math.abs(value);
  }, [kind, pnl]);

  const targetPct = Number(target);
  const canPost = token.trim().length > 0 && caption.trim().length > 0 && (kind !== "call" || !Number.isNaN(targetPct));

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
      receipt: {
        entryMc: entryMc.trim() || "n/a",
        size: size.trim() || "n/a",
        hold: kind === "call" ? "live" : hold.trim() || "n/a",
        stillIn,
      },
      call: kind === "call" ? { targetPct, windowMs } : undefined,
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
    onDone(kind === "call" ? "live" : "tape");
  }

  return (
    <div className="create">
      <h1>Drop a receipt</h1>
      <p className="lede">A live call gets a clock. Everyone else can ride it or fade it.</p>

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

      {kind === "call" && (
        <div className="row2">
          <div className="field">
            <label htmlFor="target">Target %</label>
            <input id="target" inputMode="decimal" value={target} onChange={(event) => setTarget(event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="window">Clock</label>
            <select id="window" value={windowMs} onChange={(event) => setWindowMs(Number(event.target.value))}>
              {WINDOWS.map((item) => (
                <option key={item.label} value={item.ms}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {(kind === "win" || kind === "loss") && (
        <div className="field">
          <label htmlFor="pnl">PnL %</label>
          <input id="pnl" inputMode="decimal" value={pnl} onChange={(event) => setPnl(event.target.value)} />
        </div>
      )}

      <div className="row2">
        <div className="field">
          <label htmlFor="mc">Entry MC</label>
          <input id="mc" value={entryMc} onChange={(event) => setEntryMc(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="size">Size</label>
          <input id="size" value={size} onChange={(event) => setSize(event.target.value)} />
        </div>
      </div>

      {kind !== "call" && (
        <div className="field">
          <label htmlFor="hold">Hold time</label>
          <input id="hold" value={hold} onChange={(event) => setHold(event.target.value)} />
        </div>
      )}

      <div className="field">
        <label htmlFor="caption">What happened</label>
        <textarea
          id="caption"
          rows={3}
          maxLength={180}
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          placeholder="The story, not the signal."
        />
      </div>

      <label className="author" style={{ marginBottom: 12 }} htmlFor="still-in">
        <input
          id="still-in"
          type="checkbox"
          checked={stillIn}
          onChange={(event) => setStillIn(event.target.checked)}
          style={{ width: 18, padding: 0 }}
        />
        Still in the bag
      </label>

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
        Also flash this as a 24h story
      </label>

      <div className="preview" style={{ ["--h" as string]: String(theme) }}>
        <div className={`reel-visual ${kind}`} style={{ position: "absolute", inset: 0 }}>
          <div className="orb a" />
        </div>
        <div className="pnl-hero" style={{ inset: "20% 12px auto" }}>
          <span className="kind">{kind === "call" ? "LIVE CALL" : kindLabel(kind)}</span>
          <h2 className={parsedPnl !== undefined && parsedPnl < 0 ? "down" : "up"} style={{ fontSize: 64 }}>
            {kind === "call" ? formatPnl(targetPct) ?? "+0%" : formatPnl(parsedPnl) ?? `$${token || "TICKER"}`}
          </h2>
          <div className="token">${token || "TICKER"}</div>
        </div>
      </div>

      <button className="publish" type="button" disabled={!canPost} onClick={publish}>
        {kind === "call" ? "Open the call" : asStory ? "Post receipt + story" : "Post receipt"}
      </button>
      <p className="disclaimer">
        Entertainment only. Ride and fade are social takes, not trades. Not financial advice.
      </p>
    </div>
  );
}
