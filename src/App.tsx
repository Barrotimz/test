import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  fetchBagsLaunches,
  fetchBoosts,
  fetchGeckoGlobal,
  fetchGeckoPools,
  fetchProfiles,
  fetchPumpByMcap,
  fetchPumpHottest,
  fetchPumpNewest,
  hydrateBoosts,
  lookupAddresses,
  searchTokens,
} from "./api";
import { CHAINS, GECKO_NETWORKS, chainLabel, normalizeChain } from "./chains";
import { LAUNCHPADS } from "./launchpads";
import { eventsForNew, mergeLists } from "./merge";
import {
  enrichTokenSocial,
  fetchTweetAttractions,
  hasTweetPost,
  needsSocialEnrichment,
  scoreTokenHype,
  socialPriority,
  type TweetAttraction,
} from "./attraction";
import { checkTokenRug, type RugReport } from "./rug";
import { extractMentions, firstTweetId } from "./extract";
import {
  ageLabel,
  coinAgeBucket,
  coinAgeLabel,
  caSearchUrl,
  compactCount,
  compactPrice,
  compactUsd,
  liveSearchUrl,
  padreTradeUrl,
  pct,
  shortAddress,
  toMillis,
  tokenSearchQuery,
  tweetInteractions,
  twitterHandle,
} from "./format";
import { DEFAULT_KOLS } from "./kols";
import {
  brainInsights,
  emptyBrain,
  learnFromTokens,
  pickPossibleRunners,
  scoreAgainstBrain,
  type RunnerBrain,
} from "./learn";
import type { FeedEvent, Kol, TabId, TrackedToken } from "./types";

const WATCH_KEY = "xmeme-watchlist";
const KOL_KEY = "xmeme-kols";
const LEARN_KEY = "xmeme-runner-brain";
const TABS: { id: TabId; label: string }[] = [
  { id: "launch", label: "Launching" },
  { id: "learn", label: "Learned rips" },
  { id: "radar", label: "Twitter radar" },
  { id: "boosts", label: "Boosted" },
  { id: "trending", label: "Trending" },
  { id: "scanner", label: "CA scanner" },
  { id: "kols", label: "KOL watch" },
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
  const [tab, setTab] = useState<TabId>("launch");
  const [query, setQuery] = useState("");
  const [launching, setLaunching] = useState<TrackedToken[]>([]);
  const [radar, setRadar] = useState<TrackedToken[]>([]);
  const [boosts, setBoosts] = useState<TrackedToken[]>([]);
  const [trending, setTrending] = useState<TrackedToken[]>([]);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [enabledChains, setEnabledChains] = useState<string[]>(() => CHAINS.map((chain) => chain.id));
  const [openId, setOpenId] = useState<string | null>(null);
  const [seen, setSeen] = useState(0);
  const geckoCursor = useRef(0);
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
  const [rugs, setRugs] = useState<Record<string, RugReport>>({});
  const [rugBusy, setRugBusy] = useState<Record<string, boolean>>({});
  const [rugError, setRugError] = useState<Record<string, string>>({});
  const [tweets, setTweets] = useState<TweetAttraction[]>([]);
  const [tweetBusy, setTweetBusy] = useState(false);
  const [sortMode, setSortMode] = useState<"newest" | "hype" | "likes" | "learn">("newest");
  const [ageFilter, setAgeFilter] = useState<"all" | "fresh" | "bonding">("all");
  const [socialFilter, setSocialFilter] = useState<"all" | "twitter" | "likes">("all");
  const [padFilter, setPadFilter] = useState<string>("all");
  const [brain, setBrain] = useState<RunnerBrain>(() => loadJson(LEARN_KEY, emptyBrain()));

  const knownIds = useRef(new Set<string>());
  const cycle = useRef(0);
  const socialBusy = useRef(new Set<string>());
  const bagsRef = useRef({ launching, radar, boosts, trending, watch });
  bagsRef.current = { launching, radar, boosts, trending, watch };
  const brainRef = useRef(brain);
  brainRef.current = brain;

  const patchToken = useCallback((id: string, extra: Partial<TrackedToken>) => {
    const apply = (prev: TrackedToken[]) =>
      prev.map((token) => (token.id === id ? { ...token, ...extra } : token));
    setLaunching(apply);
    setRadar(apply);
    setBoosts(apply);
    setTrending(apply);
    setWatch(apply);
    setScanned(apply);
    setSearchHits(apply);
  }, []);

  const pullTweetStats = useCallback(
    async (tokens: TrackedToken[]) => {
      const targets = tokens
        .filter((token) => needsSocialEnrichment(token) && !socialBusy.current.has(token.id))
        .sort((a, b) => socialPriority(a) - socialPriority(b))
        .slice(0, 8);
      await Promise.all(
        targets.map(async (token) => {
          socialBusy.current.add(token.id);
          try {
            patchToken(token.id, await enrichTokenSocial(token));
          } catch {
            patchToken(token.id, { socialCheckedAt: Date.now() });
          } finally {
            socialBusy.current.delete(token.id);
          }
        }),
      );
    },
    [patchToken],
  );

  const ingest = useCallback((incoming: TrackedToken[], setter: (fn: (prev: TrackedToken[]) => TrackedToken[]) => void) => {
    if (incoming.length === 0) return;
    const fresh = eventsForNew(incoming, knownIds.current);
    for (const token of incoming) knownIds.current.add(token.id);
    if (fresh.length) {
      setEvents((prev) => [...fresh, ...prev].slice(0, 24));
      setSeen((count) => count + fresh.length);
    }
    setter((prev) => mergeLists(prev, incoming));
    const learned = learnFromTokens(brainRef.current, incoming);
    if (learned.fresh.length) {
      brainRef.current = learned.brain;
      setBrain(learned.brain);
      setEvents((prev) =>
        [
          ...learned.fresh.map((lesson) => ({
            id: `learn:${lesson.id}:${lesson.at}`,
            at: lesson.at,
            text: `LEARNED $${lesson.symbol} · ${lesson.why[0] ?? "rip"}`,
          })),
          ...prev,
        ].slice(0, 24),
      );
    }
    void pullTweetStats(incoming);
  }, [pullTweetStats]);

  const refresh = useCallback(async () => {
    setError(null);
    if (knownIds.current.size === 0) setStatus("busy");
    const tick = cycle.current++;
    const net = GECKO_NETWORKS[geckoCursor.current % GECKO_NETWORKS.length];
    geckoCursor.current += 1;
    try {
      const jobs: Promise<void>[] = [
        fetchPumpNewest(48)
          .then((rows) => ingest(rows, setLaunching))
          .catch(() => undefined),
        fetchBagsLaunches()
          .then((rows) => ingest(rows, setLaunching))
          .catch(() => undefined),
        fetchGeckoPools(tick % 2 === 0 ? "bsc" : "robinhood", "new_pools").then((rows) => {
          ingest(rows, setLaunching);
          ingest(rows, setTrending);
        }),
        fetchGeckoGlobal("new_pools", tick % 2 === 0 ? 1 : 2).then((rows) => {
          ingest(rows, setLaunching);
          ingest(rows, setTrending);
          const needDepth = rows.length === 0 || tick % 2 === 1;
          if (needDepth && net) {
            return fetchGeckoPools(net, "new_pools").then((depth) => {
              ingest(depth, setLaunching);
              ingest(depth, setTrending);
            });
          }
        }),
      ];
      if (tick % 2 === 0) {
        jobs.push(fetchPumpHottest(24).then((rows) => ingest(rows, setLaunching)).catch(() => undefined));
      }
      if (tick % 4 === 1) {
        jobs.push(fetchGeckoGlobal("trending_pools").then((rows) => ingest(rows, setTrending)));
      }
      if (tick % 5 === 0) {
        jobs.push(
          fetchPumpByMcap(20)
            .then((rows) => ingest(rows, setTrending))
            .catch(() => undefined),
        );
        jobs.push(
          searchTokens("PONS")
            .then((rows) => ingest(rows, setTrending))
            .catch(() => undefined),
        );
      }
      if (tick % 2 === 1) {
        jobs.push(
          (async () => {
            const [latestBoosts, topBoosts, profiles] = await Promise.all([
              fetchBoosts("latest"),
              fetchBoosts("top"),
              fetchProfiles(),
            ]);
            const socialish = [...latestBoosts, ...profiles].filter((item) => {
              const links = item.links ?? [];
              return (
                links.some((link) => (link.type ?? "").toLowerCase() === "twitter") ||
                Boolean(firstTweetId(item.description ?? "", ...links.map((link) => link.url)))
              );
            });
            const [radarTokens, boostTokens] = await Promise.all([
              hydrateBoosts(socialish.slice(0, 48), "profile"),
              hydrateBoosts(topBoosts.slice(0, 36), "boost"),
            ]);
            ingest(radarTokens, setRadar);
            ingest(boostTokens, setBoosts);
          })(),
        );
      }
      await Promise.allSettled(jobs);
      setUpdatedAt(Date.now());
      setStatus("ok");
    } catch (err) {
      setStatus(knownIds.current.size ? "ok" : "err");
      setError(err instanceof Error ? err.message : "Scan hiccup");
    }
  }, [ingest]);

  useEffect(() => {
    let alive = true;
    const loop = async () => {
      while (alive) {
        await refresh();
        await new Promise((resolve) => setTimeout(resolve, 4000));
      }
    };
    void loop();
    return () => {
      alive = false;
    };
  }, [refresh]);

  useEffect(() => {
    let alive = true;
    const loop = async () => {
      while (alive) {
        const bag = Object.values(bagsRef.current).flat();
        const need = bag
          .filter((token) => needsSocialEnrichment(token) && !socialBusy.current.has(token.id))
          .sort((a, b) => socialPriority(a) - socialPriority(b))
          .slice(0, 8);
        await pullTweetStats(need);
        await new Promise((resolve) => setTimeout(resolve, 3500));
      }
    };
    void loop();
    return () => {
      alive = false;
    };
  }, [pullTweetStats]);

  useEffect(() => {
    localStorage.setItem(WATCH_KEY, JSON.stringify(watch));
  }, [watch]);

  useEffect(() => {
    localStorage.setItem(KOL_KEY, JSON.stringify(kols));
  }, [kols]);

  useEffect(() => {
    localStorage.setItem(LEARN_KEY, JSON.stringify(brain));
  }, [brain]);

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
  const visible = sortTokens(
    pickTokens(tab, {
      launch: launching,
      radar,
      boosts,
      trending,
      watch,
      searchHits,
      scanned,
      query,
      brain,
    }).filter((token) => {
      if (enabledChains.length > 0 && enabledChains.length !== CHAINS.length) {
        if (!enabledChains.includes(normalizeChain(token.chainId))) return false;
      }
      if (ageFilter === "fresh" && coinAgeBucket(token.pairCreatedAt) !== "fresh") return false;
      if (ageFilter === "bonding" && token.stage !== "launching") return false;
      if (socialFilter === "twitter" && !token.twitterUrl && !token.twitterHandle) return false;
      if (socialFilter === "likes" && !(token.tweetLikes && token.tweetLikes > 0)) return false;
      if (padFilter !== "all" && (token.launchpad ?? "") !== padFilter) return false;
      const needle = query.trim().toLowerCase();
      if (!needle || (tab === "radar" && searchHits.length)) return true;
      const hay = `${token.symbol} ${token.name} ${token.tokenAddress} ${token.chainId} ${token.launchpad ?? ""} ${token.twitterHandle ?? ""}`.toLowerCase();
      return hay.includes(needle);
    }),
    tab === "learn" ? "learn" : sortMode,
    brain,
  );
  const opened = visible.find((token) => token.id === openId) ?? launching.find((token) => token.id === openId);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo">XR</div>
          <div>
            <h1>XMeme Radar</h1>
            <p>Continuous sniffer for upcoming and just-launched coins on BNB, Robinhood, Solana, ETH, Base, and every other chain we can reach — plus tweet likes when a post is attached.</p>
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
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as "newest" | "hype" | "likes" | "learn")}
            >
              <option value="newest">Newest first</option>
              <option value="hype">Hottest first</option>
              <option value="likes">Most likes</option>
              <option value="learn">Looks like a runner</option>
            </select>
          </div>
        </form>
      </header>

      <div className="banner">
        <h2>What this tracks</h2>
        <p>
          Not pump.fun only. Launching pulls pump.fun and Bags bonding coins, then new pools on
          BNB (including Four.meme) and Robinhood every cycle, plus a global feed for every other
          chain. Filter by launchpad below. Tweet likes land on the card when an X post is attached.
        </p>
      </div>

      <div className="stats">
        <span className={`status ${status}`} />
        <b>{enabledChains.length}</b> chains
        <b>{seen}</b> new this session
        <b>{launching.filter((token) => token.tweetLikes != null).length}</b> with likes
        <b>{launching.length + radar.length + boosts.length + trending.length}</b> in memory
        <span>{updatedAt ? `scan ${ageLabel(updatedAt)} ago` : "starting…"}</span>
      </div>
      <div className="tape">
        {events.length === 0 ? <span className="sub">Waiting for the next launch…</span> : null}
        {events.slice(0, 8).map((event) => (
          <span key={event.id} className="chip">
            {event.text}
          </span>
        ))}
      </div>
      <div className="chips chain-chips">
        <button
          type="button"
          className="chip"
          onClick={() =>
            setEnabledChains((current) =>
              current.length === CHAINS.length ? [] : CHAINS.map((chain) => chain.id),
            )
          }
        >
          {enabledChains.length === CHAINS.length ? "All chains on" : "Select all chains"}
        </button>
        {CHAINS.map((chain) => (
          <button
            key={chain.id}
            type="button"
            className={`chip ${enabledChains.includes(chain.id) ? "on" : ""}`}
            onClick={() =>
              setEnabledChains((current) =>
                current.includes(chain.id)
                  ? current.filter((id) => id !== chain.id)
                  : [...current, chain.id],
              )
            }
          >
            {chain.label}
          </button>
        ))}
      </div>

      <div className="chips filters">
        <button
          type="button"
          className={`chip ${padFilter === "all" ? "on" : ""}`}
          onClick={() => setPadFilter("all")}
        >
          All launchpads
        </button>
        {LAUNCHPADS.map((pad) => (
          <button
            key={pad}
            type="button"
            className={`chip ${padFilter === pad ? "on" : ""}`}
            onClick={() => setPadFilter(pad)}
          >
            {pad}
          </button>
        ))}
      </div>
      <div className="chips filters">
        {[
          { id: "all", label: "All ages" },
          { id: "fresh", label: "Last hour" },
          { id: "bonding", label: "Still bonding" },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            className={`chip ${ageFilter === item.id ? "on" : ""}`}
            onClick={() => setAgeFilter(item.id as typeof ageFilter)}
          >
            {item.label}
          </button>
        ))}
        {[
          { id: "all", label: "All socials" },
          { id: "twitter", label: "Has X link" },
          { id: "likes", label: "Has likes" },
        ].map((item) => (
          <button
            key={`social-${item.id}`}
            type="button"
            className={`chip ${socialFilter === item.id ? "on" : ""}`}
            onClick={() => setSocialFilter(item.id as typeof socialFilter)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <nav className="tabs">
        {TABS.map((item) => (
          <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>
            {item.label}
            {item.id === "watch"
            ? ` (${watch.length})`
            : item.id === "launch"
              ? ` (${launching.length})`
              : item.id === "radar"
                ? ` (${radar.length})`
                : item.id === "boosts"
                  ? ` (${boosts.length})`
                  : item.id === "trending"
                    ? ` (${trending.length})`
                    : item.id === "learn"
                      ? ` (${brain.studied})`
                      : ""}
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

          {tab === "learn" && (
            <div className="banner">
              <h2>Why coins like PONS ran to millions</h2>
              {brainInsights(brain).map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p>
                Cards below are <b>possible runners</b> — live launches that match what those
                million-dollar rips did (reach, pad/chain, early age, buy flow). Not a guarantee.
              </p>
              {brain.lessons.slice(0, 6).map((lesson) => (
                <div className="kol" key={lesson.id}>
                  <div>
                    <div className="sym">${lesson.symbol}</div>
                    <div className="sub">{lesson.why.slice(0, 3).join(" · ")}</div>
                  </div>
                  <span className={`badge ${lesson.tier === "millions" ? "runner" : "setup"}`}>
                    {lesson.peakMcap ? compactUsd(lesson.peakMcap) : `+${Math.round(lesson.peakChange)}%`}
                  </span>
                </div>
              ))}
              <h2 style={{ marginTop: 16 }}>Possible runners</h2>
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
              {tab === "learn"
                ? "No setups match the learned rips yet. Keep the sniffer running."
                : status === "busy"
                  ? "Loading tokens…"
                  : "Nothing here yet. Try a search or another tab."}
            </p>
          ) : (
            <div className="cards">
              {visible.map((token) => (
                <TokenCard
                  key={`${tab}-${token.id}`}
                  token={token}
                  watched={watchedIds.has(token.id)}
                  onWatch={() => toggleWatch(token)}
                  onOpen={() => setOpenId(token.id)}
                  rug={rugs[token.id]}
                  rugBusy={Boolean(rugBusy[token.id])}
                  rugError={rugError[token.id]}
                  onRugCheck={() => void runRugCheck(token)}
                  call={scoreAgainstBrain(token, brain)}
                />
              ))}
            </div>
          )}
        </section>

        <aside className="side">
          {opened && (
            <>
              <h2>${opened.symbol} details</h2>
              <p>
                {opened.name} · {chainLabel(opened.chainId)}
                {opened.launchpad ? ` · ${opened.launchpad}` : ""} · {opened.stage ?? "live"} ·{" "}
                {coinAgeLabel(opened.pairCreatedAt)}
              </p>
              <div className="metrics">
                <div>
                  <span>Price</span>
                  {compactPrice(opened.priceUsd)}
                </div>
                <div>
                  <span>Mcap</span>
                  {compactUsd(opened.marketCap)}
                </div>
                <div>
                  <span>FDV</span>
                  {compactUsd(opened.fdv)}
                </div>
                <div>
                  <span>Liq</span>
                  {compactUsd(opened.liquidity)}
                </div>
                <div>
                  <span>5m vol</span>
                  {compactUsd(opened.volume5m)}
                </div>
                <div>
                  <span>1h vol</span>
                  {compactUsd(opened.volume1h)}
                </div>
                <div>
                  <span>24h vol</span>
                  {compactUsd(opened.volume24h)}
                </div>
                <div>
                  <span>5m</span>
                  <b className={(opened.change5m ?? 0) < 0 ? "neg" : "pos"}>{pct(opened.change5m)}</b>
                </div>
                <div>
                  <span>1h</span>
                  <b className={(opened.change1h ?? 0) < 0 ? "neg" : "pos"}>{pct(opened.change1h)}</b>
                </div>
                <div>
                  <span>Buys 1h</span>
                  {compactCount(opened.buys1h)}
                </div>
                <div>
                  <span>Sells 1h</span>
                  {compactCount(opened.sells1h)}
                </div>
                <div>
                  <span>Buyers</span>
                  {compactCount(opened.buyers1h)}
                </div>
                <div>
                  <span>Likes</span>
                  {compactCount(opened.tweetLikes)}
                </div>
                <div>
                  <span>RTs</span>
                  {compactCount(opened.tweetRetweets)}
                </div>
                <div>
                  <span>Quotes</span>
                  {compactCount(opened.tweetQuotes)}
                </div>
                <div>
                  <span>Tweet replies</span>
                  {compactCount(opened.tweetReplies)}
                </div>
                <div>
                  <span>Views</span>
                  {compactCount(opened.tweetViews)}
                </div>
                <div>
                  <span>Followers</span>
                  {compactCount(opened.twitterFollowers)}
                </div>
                <div>
                  <span>Pump replies</span>
                  {compactCount(opened.replies)}
                </div>
                <div>
                  <span>Curve</span>
                  {opened.bondingPct != null ? `${opened.bondingPct}%` : "—"}
                </div>
              </div>
              <TweetPulse token={opened} />
              {opened.tweetText && <p className="desc">{opened.tweetText}</p>}
              <p className="sub">
                {opened.username ? `@${opened.username}` : ""}
                {opened.creator ? ` · ${shortAddress(opened.creator)}` : ""}
                {opened.dexId ? ` · ${opened.dexId}` : ""}
                {opened.kingOfHill ? " · king of the hill" : ""}
              </p>
              <div className="actions">
                <TradeButtons token={opened} />
                <button className="mini" onClick={() => setOpenId(null)}>
                  Close
                </button>
              </div>
            </>
          )}
          <h2>Live X shortcuts</h2>
          <p>Open Twitter/X search in a new tab. These queries catch ticker and contract chatter.</p>
          <div className="actions">
            {opened && (
              <>
                <a
                  className="mini x"
                  href={liveSearchUrl(tokenSearchQuery(opened.symbol, opened.tokenAddress))}
                  target="_blank"
                  rel="noreferrer"
                >
                  ${opened.symbol} on X
                </a>
                <a className="mini x" href={caSearchUrl(opened.tokenAddress)} target="_blank" rel="noreferrer">
                  This CA on X
                </a>
                <a
                  className="mini padre"
                  href={padreTradeUrl(opened.chainId, opened.tokenAddress)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Padre
                </a>
              </>
            )}
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
          {opened?.tweetLikes != null ? (
            <div className="kol">
              <div>
                <div className="sym">@{opened.twitterHandle ?? "tweet"}</div>
                <div className="sub">
                  {compactCount(opened.tweetLikes)} likes · {compactCount(opened.tweetRetweets)} RTs ·{" "}
                  {compactCount(opened.tweetViews)} views
                </div>
              </div>
              {opened.tweetUrl && (
                <a className="mini x" href={opened.tweetUrl} target="_blank" rel="noreferrer">
                  Open
                </a>
              )}
            </div>
          ) : null}
          {tweets.length === 0 && opened?.tweetLikes == null ? (
            <p>Launch cards auto-pull likes from attached X posts. You can also paste a status link in CA scanner.</p>
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
          <h2 style={{ marginTop: 22 }}>What we learned</h2>
          {brainInsights(brain).map((line) => (
            <p key={line}>{line}</p>
          ))}
          {opened && (
            <p className="sub">
              ${opened.symbol} looks {scoreAgainstBrain(opened, brain).level}:{" "}
              {scoreAgainstBrain(opened, brain).reasons[0]}
            </p>
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
                <a
                  className="mini padre"
                  href={padreTradeUrl(token.chainId, token.tokenAddress)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Padre
                </a>
              </div>
            ))
          )}
        </aside>
      </div>

      <p className="notice">
        Continuous public scans of pump.fun, Bags, DexScreener, GeckoTerminal, RugCheck, GoPlus, and
        fxtwitter. Rips are studied and used to score later coins. Heuristics only. Not financial advice.
      </p>
    </div>
  );
}

function pickTokens(
  tab: TabId,
  bags: {
    launch: TrackedToken[];
    radar: TrackedToken[];
    boosts: TrackedToken[];
    trending: TrackedToken[];
    watch: TrackedToken[];
    searchHits: TrackedToken[];
    scanned: TrackedToken[];
    query: string;
    brain: RunnerBrain;
  },
): TrackedToken[] {
  if (tab === "scanner") return bags.scanned;
  if (tab === "kols") return [];
  if (tab === "learn") {
    return pickPossibleRunners([...bags.launch, ...bags.radar, ...bags.trending, ...bags.boosts], bags.brain);
  }
  if (tab === "watch") return bags.watch;
  if (tab === "boosts") return bags.boosts;
  if (tab === "trending") return bags.trending;
  if (tab === "launch") return bags.launch;
  if (bags.query.trim() && bags.searchHits.length) return bags.searchHits;
  return bags.radar;
}

function sortTokens(
  tokens: TrackedToken[],
  mode: "newest" | "hype" | "likes" | "learn",
  brain: RunnerBrain = emptyBrain(),
): TrackedToken[] {
  const copy = [...tokens];
  if (mode === "newest") {
    copy.sort((a, b) => (toMillis(b.pairCreatedAt) ?? 0) - (toMillis(a.pairCreatedAt) ?? 0));
  } else if (mode === "likes") {
    copy.sort((a, b) => (b.tweetLikes ?? -1) - (a.tweetLikes ?? -1) || (tweetInteractions(b) ?? -1) - (tweetInteractions(a) ?? -1));
  } else if (mode === "learn") {
    copy.sort((a, b) => scoreAgainstBrain(b, brain).score - scoreAgainstBrain(a, brain).score);
  } else {
    copy.sort((a, b) => scoreTokenHype(b).score - scoreTokenHype(a).score);
  }
  return copy;
}

function TradeButtons({ token }: { token: TrackedToken }) {
  return (
    <>
      <button
        className="mini"
        onClick={() => void navigator.clipboard.writeText(token.tokenAddress)}
      >
        Copy CA
      </button>
      <a
        className="mini padre"
        href={padreTradeUrl(token.chainId, token.tokenAddress)}
        target="_blank"
        rel="noreferrer"
      >
        Padre
      </a>
    </>
  );
}

function xUrl(token: TrackedToken): string {
  return token.tweetUrl || token.twitterUrl || liveSearchUrl(tokenSearchQuery(token.symbol, token.tokenAddress));
}

function TweetPulse({ token }: { token: TrackedToken }) {
  const handle = token.twitterHandle ?? twitterHandle(token.twitterUrl);
  const interactions = tweetInteractions(token);
  const posted = hasTweetPost(token) || token.tweetLikes != null;
  if (!posted && !handle && !token.twitterUrl) {
    return <div className="tweet-pulse empty">No X post attached yet</div>;
  }
  if (posted && token.tweetLikes == null && !token.socialCheckedAt) {
    return (
      <div className="tweet-pulse pending">
        Pulling likes and interactions from X{handle ? ` · @${handle}` : ""}…
      </div>
    );
  }
  if (!posted) {
    return (
      <div className="tweet-pulse profile">
        <b>X profile</b>
        <span>
          {handle ? `@${handle}` : "linked"} · {compactCount(token.twitterFollowers)} followers · no post link
        </span>
      </div>
    );
  }
  return (
    <div className="tweet-pulse">
      <div className="tweet-pulse-head">
        <b>X post</b>
        <span>{handle ? `@${handle}` : "attached"}</span>
      </div>
      <div className="tweet-pulse-stats">
        <div>
          <span>Likes</span>
          <strong>{compactCount(token.tweetLikes)}</strong>
        </div>
        <div>
          <span>Interactions</span>
          <strong>{compactCount(interactions)}</strong>
        </div>
        <div>
          <span>RTs</span>
          <strong>{compactCount(token.tweetRetweets)}</strong>
        </div>
        <div>
          <span>Replies</span>
          <strong>{compactCount(token.tweetReplies)}</strong>
        </div>
        <div>
          <span>Quotes</span>
          <strong>{compactCount(token.tweetQuotes)}</strong>
        </div>
        <div>
          <span>Views</span>
          <strong>{compactCount(token.tweetViews)}</strong>
        </div>
      </div>
    </div>
  );
}

function TokenCard({
  token,
  watched,
  onWatch,
  onOpen,
  rug,
  rugBusy,
  rugError,
  onRugCheck,
  call,
}: {
  token: TrackedToken;
  watched: boolean;
  onWatch: () => void;
  onOpen: () => void;
  rug?: RugReport;
  rugBusy: boolean;
  rugError?: string;
  onRugCheck: () => void;
  call: ReturnType<typeof scoreAgainstBrain>;
}) {
  const [imgOk, setImgOk] = useState(true);
  const handle = twitterHandle(token.twitterUrl);
  const change = token.change1h ?? token.change24h;
  const hype = scoreTokenHype(token);
  const ageBucket = coinAgeBucket(token.pairCreatedAt);
  return (
    <article className="card" onClick={onOpen}>
      <div className="card-head">
        {imgOk && token.imageUrl ? (
          <img className="avatar" src={token.imageUrl} alt="" onError={() => setImgOk(false)} />
        ) : (
          <div className="avatar fallback">{token.symbol.slice(0, 2)}</div>
        )}
        <div className="grow">
          <div className="sym">${token.symbol}</div>
          <div className="sub">
            {token.name} · {chainLabel(token.chainId)}
            {token.launchpad ? ` · ${token.launchpad}` : ""} · {shortAddress(token.tokenAddress)}
            {token.livestream ? " · LIVE" : ""}
            {token.stage === "launching" ? " · bonding" : ""}
          </div>
        </div>
        <span className={`badge ${ageBucket}`} title="Age of the main trading pair">
          {ageBucket === "fresh" ? `new ${coinAgeLabel(token.pairCreatedAt)}` : coinAgeLabel(token.pairCreatedAt)}
        </span>
        <span className={`badge ${hype.level}`} title="Market hype from volume, pump, and boosts">
          {hype.level}
        </span>
        {call.level !== "watch" && (
          <span className={`badge ${call.level}`} title={call.reasons.join(" · ")}>
            {call.level}
          </span>
        )}
        {rug && <span className={`badge ${rug.level}`}>{rug.level}</span>}
      </div>
      {token.description && <div className="desc">{token.description}</div>}
      <TweetPulse token={token} />
      <div className="metrics">
        <div>
          <span>Price</span>
          {compactPrice(token.priceUsd)}
        </div>
        <div>
          <span>Mcap</span>
          {compactUsd(token.marketCap)}
        </div>
        <div>
          <span>Liq</span>
          {compactUsd(token.liquidity)}
        </div>
        <div>
          <span>1h</span>
          <b className={change && change < 0 ? "neg" : "pos"}>{pct(change)}</b>
        </div>
        <div>
          <span>Age</span>
          <b className={ageBucket}>{coinAgeLabel(token.pairCreatedAt)}</b>
        </div>
        <div>
          <span>5m vol</span>
          {compactUsd(token.volume5m)}
        </div>
        <div>
          <span>Buys 1h</span>
          {compactCount(token.buys1h)}
        </div>
        <div>
          <span>Sells 1h</span>
          {compactCount(token.sells1h)}
        </div>
        <div>
          <span>Pump replies</span>
          {compactCount(token.replies)}
        </div>
      </div>
      {token.bondingPct != null && token.stage === "launching" && (
        <div className="curve">
          <i style={{ width: `${token.bondingPct}%` }} />
          <span>bonding {token.bondingPct}%</span>
        </div>
      )}
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
      <div className="actions" onClick={(event) => event.stopPropagation()}>
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
        <a className="mini x" href={caSearchUrl(token.tokenAddress)} target="_blank" rel="noreferrer">
          CA on X
        </a>
        <a className="mini" href={token.dexUrl} target="_blank" rel="noreferrer">
          Chart
        </a>
        {token.telegramUrl && (
          <a className="mini" href={token.telegramUrl} target="_blank" rel="noreferrer">
            TG
          </a>
        )}
        {token.websiteUrl && (
          <a className="mini" href={token.websiteUrl} target="_blank" rel="noreferrer">
            Web
          </a>
        )}
        <TradeButtons token={token} />
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

