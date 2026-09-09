import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  fetchBoosts,
  fetchProfiles,
  fetchTrending,
  hydrateBoosts,
  lookupAddresses,
  searchTokens,
} from "./api";
import { extractMentions } from "./extract";
import {
  ageLabel,
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

  async function scanContracts() {
    const addresses = [...mentions.solana, ...mentions.evm];
    if (addresses.length === 0) {
      setScanned([]);
      return;
    }
    setStatus("busy");
    try {
      setScanned(await lookupAddresses(addresses.slice(0, 8)));
      setStatus("ok");
    } catch (err) {
      setStatus("err");
      setError(err instanceof Error ? err.message : "Lookup failed");
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
            <p>Twitter / X memecoin monitor — DexScreener socials, boosts, and live X search.</p>
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
          This repo did not have a Twitter memecoin monitor, so this dashboard wires one up from
          public market APIs. It will not stream raw X firehoses without an X API key — paid tools
          like X-Relay, TweetStream, Xanguard, and Core X Tracker do that. Here you get token
          Twitter links the moment they hit DexScreener, plus one-click live X search for $ticker
          and CA mentions.
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
                placeholder="just bought $FROG ca: 5CwpF2UsgWvNKeDQaKZPjQCd6jM4K32yNVRVCuh1pump @somekol"
              />
              <div className="meta-row">
                <button type="button" className="primary" onClick={() => void scanContracts()}>
                  Lookup contracts
                </button>
                <span>
                  {mentions.tickers.length} tickers · {mentions.solana.length + mentions.evm.length} CAs ·{" "}
                  {mentions.handles.length} handles
                </span>
              </div>
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
        Public DexScreener + GeckoTerminal data only. Not financial advice. Boosts and trending lists
        are attention signals, not quality signals.
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
}: {
  token: TrackedToken;
  watched: boolean;
  onWatch: () => void;
}) {
  const [imgOk, setImgOk] = useState(true);
  const handle = twitterHandle(token.twitterUrl);
  const change = token.change1h ?? token.change24h;
  return (
    <article className="card">
      <div className="card-head">
        {imgOk && token.imageUrl ? (
          <img className="avatar" src={token.imageUrl} alt="" onError={() => setImgOk(false)} />
        ) : (
          <div className="avatar fallback">{token.symbol.slice(0, 2)}</div>
        )}
        <div>
          <div className="sym">${token.symbol}</div>
          <div className="sub">
            {token.name} · {token.chainId} · {shortAddress(token.tokenAddress)}
          </div>
        </div>
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
