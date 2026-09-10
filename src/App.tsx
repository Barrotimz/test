import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  fetchBoosts,
  fetchProfiles,
  fetchTrending,
  hydrateBoosts,
  lookupAddresses,
  searchTokens,
} from "./api";
import { fetchTweetAttractions, scoreTokenHype, type TweetAttraction } from "./attraction";
import { checkTokenRug, type RugReport } from "./rug";
import { extractMentions } from "./extract";
import {
  ageLabel,
  compactCount,
  compactUsd,
  liveSearchUrl,
  pct,
  shortAddress,
  tokenSearchQuery,
  twitterHandle,
} from "./format";
import { DEFAULT_KOLS } from "./kols";
import type { Kol, TabId, TrackedToken } from "./types";

const WATCH_KEY = "xmeme-watchlist";
const KOL_KEY = "xmeme-kols";
const TABS: { id: TabId; label: string }[] = [
  { id: "radar", label: "Twitter radar" },
  { id: "boosts", label: "Boosted" },
  { id: "trending", label: "Trending" },
  { id: "kols", label: "KOL watch" },
  { id: "scanner", label: "CA scanner" },
  { id: "watch", label: "Watchlist" },
];

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [tab, setTab] = useState<TabId>("radar");
  const [query, setQuery] = useState("");
  const [radar, setRadar] = useState<TrackedToken[]>([]);
  const [boosts, setBoosts] = useState<TrackedToken[]>([]);
  const [trending, setTrending] = useState<TrackedToken[]>([]);
  const [searchHits, setSearchHits] = useState<TrackedToken[]>([]);
  const [watch, setWatch] = useState<TrackedToken[]>(() => loadJson(WATCH_KEY, []));
  const [kols, setKols] = useState<Kol[]>(() => loadJson(KOL_KEY, DEFAULT_KOLS));
  const [kolHandle, setKolHandle] = useState("");
  const [kolNote, setKolNote] = useState("");
  const [scanText, setScanText] = useState("");
  const [scanned, setScanned] = useState<TrackedToken[]>([]);
  const [status, setStatus] = useState<"ok" | "busy" | "err">("busy");
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chain, setChain] = useState("solana");
  const [rugs, setRugs] = useState<Record<string, RugReport>>({});
  const [rugBusy, setRugBusy] = useState<Record<string, boolean>>({});
  const [rugError, setRugError] = useState<Record<string, string>>({});
  const [tweets, setTweets] = useState<TweetAttraction[]>([]);
  const [tweetBusy, setTweetBusy] = useState(false);

  const refresh = useCallback(async () => {
    setStatus("busy");
    setError(null);
    try {
      const [latestBoosts, topBoosts, profiles, trend] = await Promise.all([
        fetchBoosts("latest"),
        fetchBoosts("top"),
        fetchProfiles(),
        fetchTrending(chain),
      ]);
      const withTwitter = [...latestBoosts, ...profiles].filter((item) =>
        item.links?.some((link) => (link.type ?? "").toLowerCase() === "twitter"),
      );
      const [radarTokens, boostTokens] = await Promise.all([
        hydrateBoosts(withTwitter.slice(0, 40), "profile"),
        hydrateBoosts(topBoosts.slice(0, 40), "boost"),
      ]);
      setRadar(dedupe(radarTokens));
      setBoosts(dedupe(boostTokens));
      setTrending(trend);
      setUpdatedAt(Date.now());
      setStatus("ok");
    } catch (err) {
      setStatus("err");
      setError(err instanceof Error ? err.message : "Failed to load market data");
    }
  }, [chain]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 45_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    localStorage.setItem(WATCH_KEY, JSON.stringify(watch));
  }, [watch]);

  useEffect(() => {
    localStorage.setItem(KOL_KEY, JSON.stringify(kols));
  }, [kols]);

  const mentions = useMemo(() => extractMentions(scanText), [scanText]);

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) {
      setSearchHits([]);
      return;
    }
    setStatus("busy");
    try {
      setSearchHits(await searchTokens(query.trim()));
      setTab("radar");
      setStatus("ok");
    } catch (err) {
      setStatus("err");
      setError(err instanceof Error ? err.message : "Search failed");
    }
  }

  function toggleWatch(token: TrackedToken) {
    setWatch((current) => {
      const exists = current.some((item) => item.id === token.id);
      return exists ? current.filter((item) => item.id !== token.id) : [token, ...current];
    });
  }

  async function runRugCheck(token: TrackedToken) {
    setRugBusy((current) => ({ ...current, [token.id]: true }));
    setRugError((current) => {
      const next = { ...current };
      delete next[token.id];
      return next;
    });
    try {
      const report = await checkTokenRug(token);
      setRugs((current) => ({ ...current, [token.id]: report }));
    } catch (err) {
      setRugError((current) => ({
        ...current,
        [token.id]: err instanceof Error ? err.message : "Rug check failed",
      }));
    } finally {
      setRugBusy((current) => ({ ...current, [token.id]: false }));
    }
  }

  async function scanContracts() {
    setStatus("busy");
    setTweetBusy(true);
    try {
      const pulled = mentions.tweetIds.length
        ? await fetchTweetAttractions(mentions.tweetIds)
        : [];
      setTweets(pulled);
      const combined = extractMentions(
        [scanText, ...pulled.map((tweet) => tweet.text)].join("\n"),
      );
      const addresses = [...combined.solana, ...combined.evm];
      if (addresses.length === 0) {
        setScanned([]);
        setStatus("ok");
        return;
      }
      const tokens = await lookupAddresses(addresses.slice(0, 8));
      setScanned(tokens);
      setStatus("ok");
      await Promise.all(tokens.map((token) => runRugCheck(token)));
    } catch (err) {
      setStatus("err");
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setTweetBusy(false);
    }
  }

  const watchedIds = new Set(watch.map((item) => item.id));
  const visible = pickTokens(tab, {
    radar,
    boosts,
    trending,
    watch,
    searchHits,
    scanned,
    query,
  });

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo">XR</div>
          <div>
            <h1>XMeme Radar</h1>
            <p>Twitter / X memecoin monitor — rug checks plus tweet attraction (likes, RTs, views).</p>
          </div>
        </div>
        <form className="search-wrap" onSubmit={onSearch}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search ticker, name, or contract address"
          />
          <div className="meta-row">
            <span className={`status ${status}`} />
            <span>{status === "busy" ? "Refreshing…" : error ?? (updatedAt ? `Updated ${ageLabel(updatedAt)} ago` : "Idle")}</span>
            <button type="button" className="ghost" onClick={() => void refresh()}>
              Refresh
            </button>
            {query.trim() && (
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setQuery("");
                  setSearchHits([]);
                }}
              >
                Clear search
              </button>
            )}
            <select value={chain} onChange={(event) => setChain(event.target.value)}>
              <option value="solana">Solana</option>
              <option value="base">Base</option>
              <option value="bsc">BSC</option>
              <option value="ethereum">Ethereum</option>
            </select>
          </div>
        </form>
      </header>

      <div className="banner">
        <h2>What this tracks</h2>
        <p>
          Paste an x.com status link in the CA scanner to score tweet attraction (likes, retweets,
          quotes, views, follower reach). Token cards also show a market <b>hype</b> badge from
          volume, pumps, and Dex boosts. Rug check is still on every card. Heuristics only — not
          financial advice.
        </p>
      </div>

      <nav className="tabs">
        {TABS.map((item) => (
          <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
            {item.label}
            {item.id === "watch" ? ` (${watch.length})` : ""}
          </button>
        ))}
      </nav>

      <div className="grid">
        <section>
          {tab === "scanner" && (
            <div className="banner">
              <h2>Paste a tweet or Telegram dump</h2>
              <textarea
                value={scanText}
                onChange={(event) => setScanText(event.target.value)}
                placeholder="https://x.com/someone/status/123  plus a CA or $TICKER"
              />
              <div className="meta-row">
                <button type="button" className="primary" onClick={() => void scanContracts()}>
                  {tweetBusy ? "Scoring tweet…" : "Lookup + attraction"}
                </button>
                <span>
                  {mentions.tickers.length} tickers · {mentions.solana.length + mentions.evm.length} CAs ·{" "}
                  {mentions.handles.length} handles · {mentions.tweetIds.length} tweet links
                </span>
              </div>
              {tweets.map((tweet) => (
                <TweetCard key={tweet.id} tweet={tweet} />
              ))}
              <div className="chips">
                {mentions.tickers.map((ticker) => (
                  <a key={ticker} className="chip" href={liveSearchUrl(`$${ticker}`)} target="_blank" rel="noreferrer">
                    ${ticker}
                  </a>
                ))}
                {mentions.handles.map((handle) => (
                  <a key={handle} className="chip" href={`https://x.com/${handle}`} target="_blank" rel="noreferrer">
                    @{handle}
                  </a>
                ))}
                {[...mentions.solana, ...mentions.evm].map((address) => (
                  <a key={address} className="chip" href={liveSearchUrl(address)} target="_blank" rel="noreferrer">
                    {shortAddress(address)}
                  </a>
                ))}
              </div>
            </div>
          )}

          {tab === "kols" && (
            <div className="banner">
              <h2>Accounts to watch on X</h2>
              <p>Add handles. Each row opens the profile and a live feed filtered to that account.</p>
              <div className="kol-form">
                <input
                  value={kolHandle}
                  onChange={(event) => setKolHandle(event.target.value.replace(/^@/, ""))}
                  placeholder="handle"
                />
                <input
                  value={kolNote}
                  onChange={(event) => setKolNote(event.target.value)}
                  placeholder="why you track them"
                />
                <button
                  type="button"
                  className="primary"
                  onClick={() => {
                    if (!kolHandle.trim()) return;
                    setKols((current) => [
                      { handle: kolHandle.trim(), name: kolHandle.trim(), note: kolNote.trim() },
                      ...current.filter((kol) => kol.handle.toLowerCase() !== kolHandle.trim().toLowerCase()),
                    ]);
                    setKolHandle("");
                    setKolNote("");
                  }}
                >
                  Add
                </button>
              </div>
              {kols.map((kol) => (
                <div className="kol" key={kol.handle}>
                  <div>
                    <div className="sym">@{kol.handle}</div>
                    <div className="sub">{kol.note || kol.name}</div>
                  </div>
                  <div className="actions">
                    <a className="mini x" href={`https://x.com/${kol.handle}`} target="_blank" rel="noreferrer">
                      Profile
                    </a>
                    <a className="mini x" href={liveSearchUrl(`from:${kol.handle}`)} target="_blank" rel="noreferrer">
                      Live posts
                    </a>
                    <button
                      className="mini"
                      onClick={() => setKols((current) => current.filter((item) => item.handle !== kol.handle))}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {visible.length === 0 && tab !== "kols" ? (
            <p className="empty">
              {status === "busy" ? "Loading tokens…" : "Nothing here yet. Try a search or another tab."}
            </p>
          ) : (
            <div className="cards">
              {visible.map((token) => (
                <TokenCard
                  key={`${tab}-${token.id}`}
                  token={token}
                  watched={watchedIds.has(token.id)}
                  onWatch={() => toggleWatch(token)}
                  rug={rugs[token.id]}
                  rugBusy={Boolean(rugBusy[token.id])}
                  rugError={rugError[token.id]}
                  onRugCheck={() => void runRugCheck(token)}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="side">
          <h2>Live X shortcuts</h2>
          <p>Open Twitter/X search in a new tab. These queries catch ticker and contract chatter.</p>
          <div className="actions">
            <a className="mini x" href={liveSearchUrl("$SOL memecoin")} target="_blank" rel="noreferrer">
              $SOL memecoin
            </a>
            <a className="mini x" href={liveSearchUrl("pump.fun CA")} target="_blank" rel="noreferrer">
              pump.fun CA
            </a>
            <a className="mini x" href={liveSearchUrl("\"ca:\" solana")} target="_blank" rel="noreferrer">
              “ca:” solana
            </a>
          </div>
          <h2 style={{ marginTop: 22 }}>Tweet attraction</h2>
          {tweets.length === 0 ? (
            <p>Paste an x.com/status link in CA scanner to see likes, RTs, and reach.</p>
          ) : (
            tweets.map((tweet) => (
              <div className="kol" key={`side-${tweet.id}`}>
                <div>
                  <div className="sym">@{tweet.handle}</div>
                  <div className="sub">
                    {compactCount(tweet.likes)} likes · {compactCount(tweet.retweets)} RTs
                  </div>
                </div>
                <span className={`badge ${tweet.level}`}>{tweet.level}</span>
              </div>
            ))
          )}
          <h2 style={{ marginTop: 22 }}>Last rug checks</h2>
          {Object.keys(rugs).length === 0 ? (
            <p>Run Rug check on a card. Solana uses RugCheck + GoPlus; EVM uses GoPlus.</p>
          ) : (
            visible
              .filter((token) => rugs[token.id])
              .slice(0, 6)
              .map((token) => (
                <div className="kol" key={`rug-${token.id}`}>
                  <div>
                    <div className="sym">${token.symbol}</div>
                    <div className="sub">{rugs[token.id].sources.join(" · ")}</div>
                  </div>
                  <span className={`badge ${rugs[token.id].level}`}>{rugs[token.id].level}</span>
                </div>
              ))
          )}
          <h2 style={{ marginTop: 22 }}>Watchlist</h2>
          {watch.length === 0 ? (
            <p>Star tokens from the radar to keep their X + chart links here.</p>
          ) : (
            watch.slice(0, 8).map((token) => (
              <div className="kol" key={token.id}>
                <div>
                  <div className="sym">${token.symbol}</div>
                  <div className="sub">{compactUsd(token.marketCap)} mcap</div>
                </div>
                <a className="mini x" href={xUrl(token)} target="_blank" rel="noreferrer">
                  X
                </a>
              </div>
            ))
          )}
        </aside>
      </div>

      <p className="notice">
        Public DexScreener, GeckoTerminal, RugCheck, GoPlus, and tweet-embed metrics. Attraction
        and “safe” badges are heuristics, not a guarantee. Not financial advice.
      </p>
    </div>
  );
}

function pickTokens(
  tab: TabId,
  bags: {
    radar: TrackedToken[];
    boosts: TrackedToken[];
    trending: TrackedToken[];
    watch: TrackedToken[];
    searchHits: TrackedToken[];
    scanned: TrackedToken[];
    query: string;
  },
): TrackedToken[] {
  if (tab === "scanner") return bags.scanned;
  if (tab === "kols") return [];
  if (tab === "watch") return bags.watch;
  if (tab === "boosts") return bags.boosts;
  if (tab === "trending") return bags.trending;
  if (bags.query.trim() && bags.searchHits.length) return bags.searchHits;
  return bags.radar;
}

function xUrl(token: TrackedToken): string {
  return token.twitterUrl || liveSearchUrl(tokenSearchQuery(token.symbol, token.tokenAddress));
}

function TokenCard({
  token,
  watched,
  onWatch,
  rug,
  rugBusy,
  rugError,
  onRugCheck,
}: {
  token: TrackedToken;
  watched: boolean;
  onWatch: () => void;
  rug?: RugReport;
  rugBusy: boolean;
  rugError?: string;
  onRugCheck: () => void;
}) {
  const [imgOk, setImgOk] = useState(true);
  const handle = twitterHandle(token.twitterUrl);
  const change = token.change1h ?? token.change24h;
  const hype = scoreTokenHype(token);
  return (
    <article className="card">
      <div className="card-head">
        {imgOk && token.imageUrl ? (
          <img className="avatar" src={token.imageUrl} alt="" onError={() => setImgOk(false)} />
        ) : (
          <div className="avatar fallback">{token.symbol.slice(0, 2)}</div>
        )}
        <div className="grow">
          <div className="sym">${token.symbol}</div>
          <div className="sub">
            {token.name} · {token.chainId} · {shortAddress(token.tokenAddress)}
          </div>
        </div>
        <span className={`badge ${hype.level}`} title="Market hype from volume, pump, and boosts">
          {hype.level}
        </span>
        {rug && <span className={`badge ${rug.level}`}>{rug.level}</span>}
      </div>
      {token.description && <div className="desc">{token.description}</div>}
      <div className="metrics">
        <div>
          <span>Mcap</span>
          {compactUsd(token.marketCap)}
        </div>
        <div>
          <span>Vol 24h</span>
          {compactUsd(token.volume24h)}
        </div>
        <div>
          <span>1h</span>
          <b className={change && change < 0 ? "neg" : "pos"}>{pct(change)}</b>
        </div>
      </div>
      {rug && (
        <ul className="flags">
          {rug.flags.slice(0, 6).map((flag) => (
            <li key={flag.id} className={flag.level}>
              <b>{flag.label}</b>
              <span>{flag.detail}</span>
            </li>
          ))}
        </ul>
      )}
      {rugError && <p className="empty">{rugError}</p>}
      <div className="actions">
        <a className="mini x" href={xUrl(token)} target="_blank" rel="noreferrer">
          {handle ? `@${handle}` : "X search"}
        </a>
        <a
          className="mini x"
          href={liveSearchUrl(tokenSearchQuery(token.symbol, token.tokenAddress))}
          target="_blank"
          rel="noreferrer"
        >
          Live mentions
        </a>
        <a className="mini" href={token.dexUrl} target="_blank" rel="noreferrer">
          Chart
        </a>
        <button className="mini" onClick={onWatch}>
          {watched ? "Unwatch" : "Watch"}
        </button>
        <button className="mini rug" onClick={onRugCheck} disabled={rugBusy}>
          {rugBusy ? "Checking…" : rug ? "Re-check" : "Rug check"}
        </button>
      </div>
    </article>
  );
}

function TweetCard({ tweet }: { tweet: TweetAttraction }) {
  return (
    <article className="tweet-card">
      <div className="card-head">
        <div className="grow">
          <div className="sym">@{tweet.handle}</div>
          <div className="sub">
            {tweet.name} · {compactCount(tweet.followers)} followers
          </div>
        </div>
        <span className={`badge ${tweet.level}`}>{tweet.level} attraction</span>
      </div>
      {tweet.text && <p className="desc">{tweet.text}</p>}
      <div className="metrics">
        <div>
          <span>Likes</span>
          {compactCount(tweet.likes)}
        </div>
        <div>
          <span>RTs</span>
          {compactCount(tweet.retweets)}
        </div>
        <div>
          <span>Quotes</span>
          {compactCount(tweet.quotes)}
        </div>
        <div>
          <span>Replies</span>
          {compactCount(tweet.replies)}
        </div>
        <div>
          <span>Views</span>
          {compactCount(tweet.views)}
        </div>
        <div>
          <span>Score</span>
          {compactCount(tweet.score)}
        </div>
      </div>
      <div className="actions">
        <a className="mini x" href={tweet.url} target="_blank" rel="noreferrer">
          Open tweet
        </a>
      </div>
    </article>
  );
}

function dedupe(tokens: TrackedToken[]): TrackedToken[] {
  const map = new Map<string, TrackedToken>();
  for (const token of tokens) {
    if (!map.has(token.id)) map.set(token.id, token);
  }
  return [...map.values()];
}
