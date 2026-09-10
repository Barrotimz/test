import { memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
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
  analyzeToken,
  heatRank,
  indexAnalyses,
  listsByHeat,
  uniqueTokens,
  type TokenAnalysis,
} from "./analyze";
import { detectTodayMetas, metaForToken, metaSearchQueries, pickMetaCoins, type TodayMeta } from "./meta";
import {
  brainInsights,
  emptyBrain,
  learnFromTokens,
  scoreAgainstBrain,
  type RunnerBrain,
} from "./learn";
import type { FeedEvent, Kol, TabId, TrackedToken } from "./types";

const WATCH_KEY = "xmeme-watchlist";
const KOL_KEY = "xmeme-kols";
const LEARN_KEY = "xmeme-runner-brain";
const POLL_MS = 6500;
const SOCIAL_MS = 7000;
const SOCIAL_BATCH = 4;
const BOARD_LIMIT = 48;
const TABS: { id: TabId; label: string; heat?: boolean }[] = [
  { id: "trending", label: "Trending", heat: true },
  { id: "meta", label: "Today's meta", heat: true },
  { id: "hot", label: "Hot", heat: true },
  { id: "warm", label: "Warm", heat: true },
  { id: "launch", label: "Fresh", heat: true },
  { id: "cooling", label: "Cooling", heat: true },
  { id: "learn", label: "Rips" },
  { id: "radar", label: "Radar" },
  { id: "boosts", label: "Boosted" },
  { id: "scanner", label: "Scanner" },
  { id: "kols", label: "KOLs" },
  { id: "watch", label: "Watch" },
];

const HEAT_COPY: Partial<Record<TabId, { title: string; body: string }>> = {
  trending: {
    title: "Trending now",
    body: "What the market is already chasing. Next: today's meta (copycats), then Hot → Warm → Fresh → Cooling.",
  },
  meta: {
    title: "Today's meta",
    body: "Whatever went hardest on the tape today is the meta. We name it, then pull the same-category bag.",
  },
  hot: {
    title: "Hot",
    body: "Strongest reads: momentum + real X heat + volume. Not every trending pool.",
  },
  warm: {
    title: "Warm",
    body: "Heating up — early social, late bonding, livestreams. Not confirmed yet.",
  },
  launch: {
    title: "Fresh",
    body: "New pools and bonding coins, hottest first.",
  },
  cooling: {
    title: "Cooling",
    body: "Dumps and traps. Skip these if you are late.",
  },
};

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [tab, setTab] = useState<TabId>("trending");
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
  const [sortMode, setSortMode] = useState<"heat" | "newest" | "hype" | "likes" | "learn">("heat");
  const [ageFilter, setAgeFilter] = useState<"all" | "fresh" | "bonding">("all");
  const [socialFilter, setSocialFilter] = useState<"all" | "twitter" | "likes">("all");
  const [padFilter, setPadFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [metaFilter, setMetaFilter] = useState<string>("all");
  const [brain, setBrain] = useState<RunnerBrain>(() => loadJson(LEARN_KEY, emptyBrain()));

  const knownIds = useRef(new Set<string>());
  const cycle = useRef(0);
  const socialBusy = useRef(new Set<string>());
  const bagsRef = useRef({ launching, radar, boosts, trending, watch });
  bagsRef.current = { launching, radar, boosts, trending, watch };
  const brainRef = useRef(brain);
  brainRef.current = brain;

  const pendingLearn = useRef<TrackedToken[]>([]);

  const patchToken = useCallback((id: string, extra: Partial<TrackedToken>) => {
    const apply = (prev: TrackedToken[]) => {
      const index = prev.findIndex((token) => token.id === id);
      if (index === -1) return prev;
      const next = prev.slice();
      next[index] = { ...prev[index], ...extra };
      return next;
    };
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
        .slice(0, SOCIAL_BATCH);
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
    pendingLearn.current.push(...incoming);
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    if (knownIds.current.size === 0) setStatus("busy");
    const tick = cycle.current++;
    const net = GECKO_NETWORKS[geckoCursor.current % GECKO_NETWORKS.length];
    geckoCursor.current += 1;
    try {
      const jobs: Promise<void>[] = [];
      if (tick % 2 === 0) {
        jobs.push(fetchPumpNewest(32).then((rows) => ingest(rows, setLaunching)).catch(() => undefined));
      } else {
        jobs.push(fetchBagsLaunches().then((rows) => ingest(rows, setLaunching)).catch(() => undefined));
      }
      if (tick % 2 === 0) {
        jobs.push(
          fetchGeckoGlobal("new_pools", tick % 4 === 0 ? 1 : 2).then((rows) => {
            ingest(rows, setLaunching);
          }),
        );
      } else {
        jobs.push(
          fetchGeckoPools(tick % 4 === 1 ? "bsc" : "robinhood", "new_pools").then((rows) => {
            ingest(rows, setLaunching);
          }),
        );
      }
      if (tick % 4 === 0) {
        jobs.push(fetchPumpHottest(20).then((rows) => ingest(rows, setLaunching)).catch(() => undefined));
      }
      if (tick % 4 === 2) {
        jobs.push(fetchGeckoGlobal("trending_pools").then((rows) => ingest(rows, setTrending)));
      }
      if (tick % 6 === 0) {
        jobs.push(fetchPumpByMcap(16).then((rows) => ingest(rows, setTrending)).catch(() => undefined));
      }
      if (tick % 4 === 1) {
        const bag = uniqueTokens(Object.values(bagsRef.current).flat());
        const queries = metaSearchQueries(detectTodayMetas(bag, brainRef.current.lessons));
        const query = queries[Math.floor(tick / 4) % Math.max(queries.length, 1)];
        if (query) {
          jobs.push(searchTokens(query).then((rows) => ingest(rows, setTrending)).catch(() => undefined));
        }
      }
      if (tick % 8 === 5 && net) {
        jobs.push(fetchGeckoPools(net, "new_pools").then((rows) => ingest(rows, setLaunching)));
      }
      if (tick % 4 === 3) {
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
              hydrateBoosts(socialish.slice(0, 24), "profile"),
              hydrateBoosts(topBoosts.slice(0, 20), "boost"),
            ]);
            ingest(radarTokens, setRadar);
            ingest(boostTokens, setBoosts);
          })(),
        );
      }
      await Promise.allSettled(jobs);
      if (pendingLearn.current.length) {
        const learned = learnFromTokens(brainRef.current, pendingLearn.current);
        pendingLearn.current = [];
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
      }
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
        await new Promise((resolve) => setTimeout(resolve, POLL_MS));
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
          .slice(0, SOCIAL_BATCH);
        await pullTweetStats(need);
        await new Promise((resolve) => setTimeout(resolve, SOCIAL_MS));
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

  const toggleWatch = useCallback((token: TrackedToken) => {
    setWatch((current) => {
      const exists = current.some((item) => item.id === token.id);
      return exists ? current.filter((item) => item.id !== token.id) : [token, ...current];
    });
  }, []);

  const runRugCheck = useCallback(async (token: TrackedToken) => {
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
  }, []);

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

  const watchedIds = useMemo(() => new Set(watch.map((item) => item.id)), [watch]);
  const allLive = useMemo(
    () => uniqueTokens([...launching, ...radar, ...boosts, ...trending]),
    [launching, radar, boosts, trending],
  );
  const analyses = useMemo(() => indexAnalyses(allLive, brain, rugs), [allLive, brain, rugs]);
  const heatLists = useMemo(() => listsByHeat(allLive, analyses), [allLive, analyses]);
  const hotList = heatLists.hot;
  const warmList = heatLists.warm;
  const coolingList = heatLists.trap;
  const todayMetas = useMemo(() => detectTodayMetas(allLive, brain.lessons), [allLive, brain.lessons]);
  const activeMetas = useMemo(
    () => (metaFilter === "all" ? todayMetas : todayMetas.filter((meta) => meta.id === metaFilter)),
    [todayMetas, metaFilter],
  );
  const metaList = useMemo(() => pickMetaCoins(allLive, activeMetas), [allLive, activeMetas]);
  const learnList = useMemo(
    () =>
      allLive
        .filter((token) => {
          const row = analyses.get(token.id);
          return row && (row.verdict === "strong" || (row.verdict === "mixed" && row.call.level !== "watch"));
        })
        .sort((a, b) => (analyses.get(b.id)?.score ?? 0) - (analyses.get(a.id)?.score ?? 0))
        .slice(0, 24),
    [allLive, analyses],
  );
  const leadMeta = todayMetas[0];
  const analysisOf = useCallback(
    (token: TrackedToken) => analyses.get(token.id) ?? analyzeToken(token, brain, rugs[token.id]),
    [analyses, brain, rugs],
  );
  const filtered = useMemo(() => {
    const picked = pickTokens(tab, {
      launch: launching,
      radar,
      boosts,
      trending,
      watch,
      searchHits,
      scanned,
      query,
      brain,
      metaCoins: metaList,
      hot: hotList,
      warm: warmList,
      cooling: coolingList,
      learn: learnList,
    });
    return picked.filter((token) => {
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
    });
  }, [
    tab,
    launching,
    radar,
    boosts,
    trending,
    watch,
    searchHits,
    scanned,
    query,
    brain,
    metaList,
    hotList,
    warmList,
    coolingList,
    learnList,
    enabledChains,
    ageFilter,
    socialFilter,
    padFilter,
  ]);
  const ranked = useMemo(
    () =>
      sortTokens(
        filtered,
        tab === "learn" || tab === "meta" || tab === "hot" || tab === "warm" || tab === "cooling"
          ? "keep"
          : sortMode,
        brain,
        analysisOf,
      ),
    [filtered, tab, sortMode, brain, analysisOf],
  );
  const visible = ranked.slice(0, BOARD_LIMIT);
  const opened =
    allLive.find((token) => token.id === openId) ??
    watch.find((token) => token.id === openId) ??
    scanned.find((token) => token.id === openId);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo">XR</div>
          <div>
            <h1>XMeme Radar</h1>
            <p>Today's biggest rip is the meta. Same-category coins sit next to it.</p>
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
              onChange={(event) =>
                setSortMode(event.target.value as "heat" | "newest" | "hype" | "likes" | "learn")
              }
            >
              <option value="heat">Hot → warm → fresh</option>
              <option value="newest">Newest first</option>
              <option value="hype">Hottest first</option>
              <option value="likes">Most likes</option>
              <option value="learn">Looks like a runner</option>
            </select>
          </div>
        </form>
      </header>

      <div className="stats">
        <span className={`status ${status}`} />
        <b>{todayMetas.length}</b> metas
        <b>{hotList.length}</b> hot
        <b>{warmList.length}</b> warm
        <b>{seen}</b> new
        <b>{allLive.length}</b> live
        <span>{updatedAt ? `scan ${ageLabel(updatedAt)} ago` : "starting…"}</span>
        <button type="button" className="ghost" onClick={() => setShowFilters((on) => !on)}>
          {showFilters ? "Hide filters" : "Filters"}
        </button>
      </div>
      {leadMeta && (
        <div className="banner meta-hero">
          <h2>{leadMeta.headline}</h2>
          <p>{leadMeta.why}</p>
          <div className="meta-strip">
            {todayMetas.map((meta) => (
              <button
                key={meta.id}
                type="button"
                className={`chip ${metaFilter === meta.id ? "on" : ""}`}
                onClick={() => {
                  setMetaFilter(meta.id);
                  setTab("meta");
                }}
              >
                ${meta.seedSymbol}
                {meta.seedChange != null ? ` ${pct(meta.seedChange)}` : ""}
                {meta.seedMcap ? ` · ${compactUsd(meta.seedMcap)}` : ""} → {meta.label}
              </button>
            ))}
            {metaFilter !== "all" && (
              <button type="button" className="chip" onClick={() => setMetaFilter("all")}>
                All of today's metas
              </button>
            )}
          </div>
        </div>
      )}
      <div className="tape">
        {events.length === 0 ? <span className="sub">Waiting for the next launch…</span> : null}
        {events.slice(0, 8).map((event) => (
          <span key={event.id} className="chip">
            {event.text}
          </span>
        ))}
      </div>
      <div className={`chips chain-chips ${showFilters ? "" : "hidden-filters"}`}>
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

      <div className={`chips filters ${showFilters ? "" : "hidden-filters"}`}>
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
      <div className={`chips filters ${showFilters ? "" : "hidden-filters"}`}>
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
          <button
            key={item.id}
            className={`${tab === item.id ? "active" : ""} ${item.heat ? `heat-tab heat-${item.id}` : ""}`.trim()}
            onClick={() => setTab(item.id)}
          >
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
                      : item.id === "hot"
                        ? ` (${hotList.length})`
                        : item.id === "warm"
                          ? ` (${warmList.length})`
                          : item.id === "cooling"
                            ? ` (${coolingList.length})`
                            : item.id === "meta"
                              ? ` (${metaList.length})`
                              : item.id === "learn"
                                ? ` (${brain.studied})`
                                : ""}
          </button>
        ))}
      </nav>

      <div className={`grid ${opened ? "open" : ""}`}>
        <section>
          {tab === "meta" ? (
            <div className="banner">
              <h2>{leadMeta ? leadMeta.headline : "Reading today's tape"}</h2>
              <p>
                {leadMeta
                  ? `${leadMeta.why} Cards below are that bag — the rip plus same-category names.`
                  : "No coin has run hard enough today yet. As soon as Trending prints a real rip, that ticker becomes the meta and we search the same category."}
              </p>
            </div>
          ) : (
            HEAT_COPY[tab] && (
              <div className="banner">
                <h2>{HEAT_COPY[tab]?.title}</h2>
                <p>{HEAT_COPY[tab]?.body}</p>
              </div>
            )
          )}

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
                Cards below are <b>possible runners</b> after a fuller read: momentum, X heat vs
                volume, buy/sell quality, thin books, and paid boosts. Traps are filtered out.
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
                : tab === "meta"
                  ? "Nothing has defined today's meta yet. Watch Trending — the coin that goes parabolic today becomes the bag we copy."
                  : tab === "hot"
                  ? "Nothing is hot right now. Check Warm or Fresh for earlier tells."
                  : tab === "warm"
                    ? "No coins are warming yet. Fresh launches show up next."
                    : tab === "cooling"
                      ? "No dumps or traps in memory. That is the good kind of empty."
                      : tab === "trending"
                        ? "No trending pools yet. The next Gecko scan will fill this."
                        : tab === "launch"
                          ? "Waiting for the next new pool or bonding coin…"
                          : status === "busy"
                            ? "Loading tokens…"
                            : "Nothing here yet. Try a search or another tab."}
            </p>
          ) : (
            <>
            {ranked.length > visible.length && (
              <p className="empty">Showing {visible.length} of {ranked.length} — sorted to the top of this tab.</p>
            )}
            <div className="cards">
              {visible.map((token) => (
                <TokenCard
                  key={`${tab}-${token.id}`}
                  token={token}
                  watched={watchedIds.has(token.id)}
                  onWatch={toggleWatch}
                  onOpen={setOpenId}
                  rug={rugs[token.id]}
                  rugBusy={Boolean(rugBusy[token.id])}
                  rugError={rugError[token.id]}
                  onRugCheck={runRugCheck}
                  analysis={analysisOf(token)}
                  meta={metaForToken(token, todayMetas)}
                />
              ))}
            </div>
            </>
          )}
        </section>

        {opened && (
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
              <AnalysisPanel analysis={analysisOf(opened)} />
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
        )}
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
    metaCoins: TrackedToken[];
    hot: TrackedToken[];
    warm: TrackedToken[];
    cooling: TrackedToken[];
    learn: TrackedToken[];
  },
): TrackedToken[] {
  if (tab === "scanner") return bags.scanned;
  if (tab === "kols") return [];
  if (tab === "learn") return bags.learn;
  if (tab === "meta") return bags.metaCoins;
  if (tab === "hot") return bags.hot;
  if (tab === "warm") return bags.warm;
  if (tab === "cooling") return bags.cooling;
  if (tab === "watch") return bags.watch;
  if (tab === "boosts") return bags.boosts;
  if (tab === "trending") return bags.trending;
  if (tab === "launch") return bags.launch;
  if (bags.query.trim() && bags.searchHits.length) return bags.searchHits;
  return bags.radar;
}

function sortTokens(
  tokens: TrackedToken[],
  mode: "heat" | "newest" | "hype" | "likes" | "learn" | "keep",
  brain: RunnerBrain = emptyBrain(),
  analyze: (token: TrackedToken) => ReturnType<typeof analyzeToken> = (token) => analyzeToken(token, brain),
): TrackedToken[] {
  const copy = [...tokens];
  if (mode === "keep") return copy;
  if (mode === "heat") {
    copy.sort((a, b) => {
      const left = analyze(a);
      const right = analyze(b);
      const lane = heatRank(left.heat) - heatRank(right.heat);
      if (lane !== 0) return lane;
      return right.score - left.score;
    });
  } else if (mode === "newest") {
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

function AnalysisPanel({
  analysis,
  compact = false,
}: {
  analysis: ReturnType<typeof analyzeToken>;
  compact?: boolean;
}) {
  const notes = compact ? analysis.notes.slice(0, 1) : analysis.notes;
  return (
    <div className={`analysis ${analysis.verdict}`}>
      <div className="analysis-head">
        <b>{analysis.verdict}</b>
        <span>
          {analysis.heat}
          {compact ? ` · ${analysis.score}` : ` · ${analysis.momentum} · ${analysis.social} · ${analysis.flow} · ${analysis.score}`}
        </span>
      </div>
      {notes.map((note) => (
        <div key={note.text} className={`analysis-note ${note.side}`}>
          {note.side === "for" ? "+" : "−"} {note.text}
        </div>
      ))}
    </div>
  );
}

function TweetPulse({ token, compact = false }: { token: TrackedToken; compact?: boolean }) {
  const handle = token.twitterHandle ?? twitterHandle(token.twitterUrl);
  const interactions = tweetInteractions(token);
  const posted = hasTweetPost(token) || token.tweetLikes != null;
  if (compact) {
    if (!posted) return null;
    return (
      <div className="tweet-pulse compact">
        <b>X</b>
        <span>{compactCount(token.tweetLikes)} likes</span>
        <span>{compactCount(interactions)} hits</span>
        {token.tweetViews != null && <span>{compactCount(token.tweetViews)} views</span>}
      </div>
    );
  }
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

const TokenCard = memo(function TokenCard({
  token,
  watched,
  onWatch,
  onOpen,
  rug,
  rugBusy,
  rugError,
  onRugCheck,
  analysis,
  meta,
}: {
  token: TrackedToken;
  watched: boolean;
  onWatch: (token: TrackedToken) => void;
  onOpen: (id: string) => void;
  rug?: RugReport;
  rugBusy: boolean;
  rugError?: string;
  onRugCheck: (token: TrackedToken) => void;
  analysis: TokenAnalysis;
  meta?: TodayMeta;
}) {
  const [imgOk, setImgOk] = useState(true);
  const handle = twitterHandle(token.twitterUrl);
  const change = token.change1h ?? token.change24h;
  const ageBucket = coinAgeBucket(token.pairCreatedAt);
  return (
    <article className="card compact-card" onClick={() => onOpen(token.id)}>
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
            {token.launchpad ? ` · ${token.launchpad}` : ""}
            {token.livestream ? " · LIVE" : ""}
          </div>
        </div>
        <span className={`badge ${analysis.heat}`}>{analysis.heat}</span>
        {meta && (
          <span className="badge meta" title={meta.why}>
            {meta.seedSymbol.toUpperCase() === token.symbol.toUpperCase() ? "today's meta" : `same as $${meta.seedSymbol}`}
          </span>
        )}
        {rug && <span className={`badge ${rug.level}`}>{rug.level}</span>}
      </div>
      <AnalysisPanel analysis={analysis} compact />
      <TweetPulse token={token} compact />
      <div className="metrics">
        <div>
          <span>Mcap</span>
          {compactUsd(token.marketCap)}
        </div>
        <div>
          <span>1h</span>
          <b className={change && change < 0 ? "neg" : "pos"}>{pct(change)}</b>
        </div>
        <div>
          <span>24h</span>
          <b className={(token.change24h ?? 0) < 0 ? "neg" : "pos"}>{pct(token.change24h)}</b>
        </div>
        <div>
          <span>Liq</span>
          {compactUsd(token.liquidity)}
        </div>
        <div>
          <span>Age</span>
          <b className={ageBucket}>{coinAgeLabel(token.pairCreatedAt)}</b>
        </div>
        <div>
          <span>Likes</span>
          {compactCount(token.tweetLikes)}
        </div>
      </div>
      {token.bondingPct != null && token.stage === "launching" && (
        <div className="curve">
          <i style={{ width: `${token.bondingPct}%` }} />
          <span>bonding {token.bondingPct}%</span>
        </div>
      )}
      {rugError && <p className="empty">{rugError}</p>}
      <div className="actions" onClick={(event) => event.stopPropagation()}>
        <a className="mini x" href={xUrl(token)} target="_blank" rel="noreferrer">
          {handle ? `@${handle}` : "X"}
        </a>
        <a className="mini" href={token.dexUrl} target="_blank" rel="noreferrer">
          Chart
        </a>
        <TradeButtons token={token} />
        <button className="mini" onClick={() => onWatch(token)}>
          {watched ? "Unwatch" : "Watch"}
        </button>
        <button className="mini rug" onClick={() => void onRugCheck(token)} disabled={rugBusy}>
          {rugBusy ? "…" : "Rug"}
        </button>
      </div>
    </article>
  );
});

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

