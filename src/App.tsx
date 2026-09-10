import { memo, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  fetchBagsLaunches,
  fetchBoosts,
  fetchGeckoGlobal,
  fetchGeckoPools,
  fetchProfiles,
  fillSocialsFromDex,
  fetchPumpByMcap,
  fetchPumpHottest,
  fetchPumpLive,
  fetchPumpNewest,
  hydrateBoosts,
  lookupAddresses,
  quotePatchChanged,
  refreshQuotes,
  searchMany,
  searchTokens,
  selectQuoteTargets,
  viewerPatchFromLive,
  dexIsCooling,
  dexCooldownLeft,
} from "./api";
import { CHAINS, GECKO_NETWORKS, chainLabel, normalizeChain } from "./chains";
import { LAUNCHPADS } from "./launchpads";
import { eventsForNew, mergeLists, overlayLive, pushEvents } from "./merge";
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
  sharePct,
  authLabel,
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
import { pulseLabel, pulseStage, tapeQuality, twitterAgeChip } from "./read";
import { pickBuyTape, patchBuys2m, type BuySample } from "./buys";
import { pickRadarTokens, radarQuerySlice, hasXTrail, isTapeOpportunity, PLUMBER_CA } from "./social";
import { listenPumpCreates } from "./pumpStream";
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
const MCAP_MS = 10_000;
const SOCIAL_MS = 7000;
const SOCIAL_BATCH = 6;
const BOARD_LIMIT = 60;
const TABS: { id: TabId; label: string; heat?: boolean }[] = [
  { id: "trending", label: "Trending", heat: true },
  { id: "meta", label: "Today's meta", heat: true },
  { id: "hot", label: "Hot", heat: true },
  { id: "buys", label: "Buys 2m", heat: true },
  { id: "warm", label: "Warm", heat: true },
  { id: "launch", label: "Fresh", heat: true },
  { id: "cooling", label: "Cooling", heat: true },
  { id: "learn", label: "Rips" },
  { id: "radar", label: "Twitter radar" },
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
  buys: {
    title: "Most buys · last 2 minutes",
    body: "Coins printing the most buys right now. Dex only gives a rolling 5-minute tape — we sample it on the 10s quote tick and estimate the last two minutes. Highest buy count at the top.",
  },
  warm: {
    title: "Warm",
    body: "Heating up — early social, late bonding, livestreams. Not confirmed yet.",
  },
  launch: {
    title: "Fresh",
    body: "New pools and bonding coins, hottest first. pump.fun creates also stream in live (PumpPortal) so this tab is not stuck on the 6.5s HTTP poll.",
  },
  radar: {
    title: "Twitter radar",
    body: "Wide net for tweet-driven rips: Dex pair + website status links on the 10s quote tick, pump handles, live x.com/status hunts, and CAs that are already ripping before the tweet is attached. Hunts are staggered so Dex 429s do not punch a hole in coverage. Bundled-look coins get a warning from clone-sized holder bags.",
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
  const [quotesAt, setQuotesAt] = useState<number | null>(null);
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
  const [dexHold, setDexHold] = useState(0);
  const [pumpLive, setPumpLive] = useState(false);

  const knownIds = useRef(new Set<string>());
  const cycle = useRef(0);
  const socialBusy = useRef(new Set<string>());
  const bagsRef = useRef({ launching, radar, boosts, trending, watch });
  bagsRef.current = { launching, radar, boosts, trending, watch };
  const quoteBagRef = useRef({ launching, radar, boosts, trending, watch, scanned, searchHits });
  quoteBagRef.current = { launching, radar, boosts, trending, watch, scanned, searchHits };
  const brainRef = useRef(brain);
  brainRef.current = brain;
  const rugsRef = useRef(rugs);
  rugsRef.current = rugs;
  const openIdRef = useRef(openId);
  openIdRef.current = openId;
  const rugBusyRef = useRef(new Set<string>());
  const visibleIdsRef = useRef<string[]>([]);
  const buySamplesRef = useRef(new Map<string, BuySample[]>());
  const hydratePage = useRef(0);

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

  const applyQuotes = useCallback((rows: { id: string; patch: Partial<TrackedToken> }[]) => {
    if (rows.length === 0) return;
    const byId = new Map(
      rows.map((row) => [row.id, patchBuys2m(row.id, row.patch, buySamplesRef.current)]),
    );
    const apply = (prev: TrackedToken[]) => {
      let changed = false;
      const next = prev.map((token) => {
        const patch = byId.get(token.id);
        if (!patch || !quotePatchChanged(token, patch)) return token;
        changed = true;
        return { ...token, ...patch };
      });
      return changed ? next : prev;
    };
    setLaunching(apply);
    setRadar(apply);
    setBoosts(apply);
    setTrending(apply);
    setWatch(apply);
    setScanned(apply);
    setSearchHits(apply);
  }, []);

  const runRugCheck = useCallback(async (token: TrackedToken) => {
    if (rugBusyRef.current.has(token.id)) return;
    rugBusyRef.current.add(token.id);
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
      rugBusyRef.current.delete(token.id);
      setRugBusy((current) => ({ ...current, [token.id]: false }));
    }
  }, []);

  const ensureRugCheck = useCallback(
    async (token: TrackedToken) => {
      if (rugsRef.current[token.id] || rugBusyRef.current.has(token.id)) return;
      await runRugCheck(token);
    },
    [runRugCheck],
  );

  const ingest = useCallback((incoming: TrackedToken[], setter: (fn: (prev: TrackedToken[]) => TrackedToken[]) => void) => {
    if (incoming.length === 0) return;
    const fresh = eventsForNew(incoming, knownIds.current);
    for (const token of incoming) knownIds.current.add(token.id);
    if (fresh.length) {
      setEvents((prev) => pushEvents(prev, fresh));
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
      const bag = uniqueTokens(Object.values(bagsRef.current).flat());
      const cooling = dexIsCooling();
      setDexHold(dexCooldownLeft());
      if (!cooling) {
        jobs.push(
          (async () => {
            const querySlice = radarQuerySlice(
              bag,
              [...metaSearchQueries(detectTodayMetas(bag, brainRef.current.lessons)), PLUMBER_CA],
              tick,
            );
            try {
              ingest(await searchMany(querySlice.length ? querySlice : ["x.com/status"]), setRadar);
            } catch {
              // Dex 429 / cooling — pump and gecko jobs still run
            }
            if (dexIsCooling()) return;
            try {
              if (tick % 4 === 1) {
                ingest(await fillSocialsFromDex(bag, 25, hydratePage.current++), setRadar);
                return;
              }
              if (tick % 4 !== 3) return;
              const [latestBoosts, topBoosts, profiles] = await Promise.all([
                fetchBoosts("latest"),
                fetchBoosts("top"),
                fetchProfiles(),
              ]);
              const socialish = [...latestBoosts, ...profiles].filter((item) => {
                const links = item.links ?? [];
                const blob = [item.description ?? "", ...links.map((link) => `${link.type ?? ""} ${link.url}`)].join(" ");
                return (
                  /twitter|x\.com/i.test(blob) ||
                  Boolean(firstTweetId(item.description ?? "", ...links.map((link) => link.url))) ||
                  /@[A-Za-z0-9_]{2,15}/.test(item.description ?? "")
                );
              });
              const [radarTokens, boostTokens] = await Promise.all([
                hydrateBoosts(socialish.slice(0, 48), "profile"),
                hydrateBoosts(topBoosts.slice(0, 28), "boost"),
              ]);
              ingest(radarTokens, setRadar);
              ingest(boostTokens, setBoosts);
            } catch {
              // Dex cooldown after hunts — do not take down pump/gecko
            }
          })(),
        );
      }
      jobs.push(fetchPumpNewest(64).then((rows) => ingest(rows, setLaunching)).catch(() => undefined));
      jobs.push(
        fetchPumpLive(80)
          .then((rows) => {
            ingest(rows, setLaunching);
            ingest(rows, setRadar);
            applyQuotes(rows.map((token) => ({ id: token.id, patch: viewerPatchFromLive(token) })));
          })
          .catch(() => undefined),
      );
      if (tick % 2 === 1) {
        jobs.push(fetchBagsLaunches().then((rows) => ingest(rows, setLaunching)).catch(() => undefined));
      }
      jobs.push(
        fetchGeckoGlobal("new_pools", tick % 2 === 0 ? 1 : 2).then((rows) => {
          ingest(rows, setLaunching);
        }),
      );
      jobs.push(
        fetchGeckoPools(["solana", "base", "bsc", "robinhood"][tick % 4] ?? "solana", "new_pools").then((rows) => {
          ingest(rows, setLaunching);
        }),
      );
      if (tick % 2 === 0) {
        jobs.push(fetchPumpHottest(36).then((rows) => ingest(rows, setLaunching)).catch(() => undefined));
      }
      if (tick % 3 === 0) {
        jobs.push(fetchGeckoGlobal("trending_pools").then((rows) => ingest(rows, setTrending)));
      }
      if (tick % 5 === 0) {
        jobs.push(fetchPumpByMcap(24).then((rows) => ingest(rows, setTrending)).catch(() => undefined));
      }
      if (tick % 4 === 2 && net) {
        jobs.push(fetchGeckoPools(net, "new_pools").then((rows) => ingest(rows, setLaunching)));
      }
      await Promise.allSettled(jobs);
      if (pendingLearn.current.length) {
        const learned = learnFromTokens(brainRef.current, pendingLearn.current);
        pendingLearn.current = [];
        if (learned.fresh.length) {
          brainRef.current = learned.brain;
          setBrain(learned.brain);
          setEvents((prev) =>
            pushEvents(
              prev,
              learned.fresh.map((lesson) => ({
                id: `learn:${lesson.id}:${lesson.at}`,
                at: lesson.at,
                text: `LEARNED $${lesson.symbol} · ${lesson.why[0] ?? "rip"}`,
              })),
            ),
          );
        }
      }
      setUpdatedAt(Date.now());
      setDexHold(dexCooldownLeft());
      setStatus("ok");
    } catch (err) {
      setStatus(knownIds.current.size ? "ok" : "err");
      setError(err instanceof Error ? err.message : "Scan hiccup");
    }
  }, [ingest, applyQuotes]);

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
    return listenPumpCreates((token) => ingest([token], setLaunching), setPumpLive);
  }, [ingest]);

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
        const openToken = openIdRef.current
          ? bag.find((token) => token.id === openIdRef.current)
          : undefined;
        if (openToken) await ensureRugCheck(openToken);
        const nextScan = uniqueTokens(bag)
          .filter((token) => !rugsRef.current[token.id] && !rugBusyRef.current.has(token.id))
          .sort((a, b) => {
            const bump = (token: TrackedToken) => (hasXTrail(token) || isTapeOpportunity(token) ? 1_000_000_000 : 0);
            return bump(b) + (b.volume5m ?? b.volume1h ?? 0) - (bump(a) + (a.volume5m ?? a.volume1h ?? 0));
          })
          .slice(0, 1);
        for (const token of nextScan) await ensureRugCheck(token);
        await new Promise((resolve) => setTimeout(resolve, SOCIAL_MS));
      }
    };
    void loop();
    return () => {
      alive = false;
    };
  }, [pullTweetStats, ensureRugCheck]);

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
    () => uniqueTokens([...launching, ...radar, ...boosts, ...trending, ...watch]),
    [launching, radar, boosts, trending, watch],
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
  const radarList = useMemo(() => pickRadarTokens(allLive), [allLive]);
  const buyList = useMemo(() => pickBuyTape(allLive), [allLive]);
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
      radarCoins: radarList,
      buyCoins: buyList,
      hot: hotList,
      warm: warmList,
      cooling: coolingList,
      learn: learnList,
    });
    return overlayLive(picked, allLive).filter((token) => {
      if (enabledChains.length > 0 && enabledChains.length !== CHAINS.length) {
        if (!enabledChains.includes(normalizeChain(token.chainId))) return false;
      }
      if (ageFilter === "fresh" && coinAgeBucket(token.pairCreatedAt) !== "fresh") return false;
      if (ageFilter === "bonding" && token.stage !== "launching") return false;
      if (socialFilter === "twitter" && !token.twitterUrl && !token.twitterHandle && !token.tweetUrl) return false;
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
    radarList,
    buyList,
    hotList,
    warmList,
    coolingList,
    learnList,
    allLive,
    enabledChains,
    ageFilter,
    socialFilter,
    padFilter,
  ]);
  const ranked = useMemo(
    () =>
      sortTokens(
        filtered,
        tab === "learn" ||
        tab === "meta" ||
        tab === "hot" ||
        tab === "warm" ||
        tab === "cooling" ||
        tab === "radar" ||
        tab === "buys"
          ? "keep"
          : sortMode,
        brain,
        analysisOf,
      ),
    [filtered, tab, sortMode, brain, analysisOf],
  );
  const visible = ranked.slice(0, BOARD_LIMIT);
  visibleIdsRef.current = visible.map((token) => token.id);
  const opened =
    allLive.find((token) => token.id === openId) ??
    watch.find((token) => token.id === openId) ??
    scanned.find((token) => token.id === openId);

  useEffect(() => {
    if (!opened) return;
    void ensureRugCheck(opened);
  }, [opened, ensureRugCheck]);

  useEffect(() => {
    if (!openId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  useEffect(() => {
    let alive = true;
    let quoting = false;
    const loop = async () => {
      while (alive) {
        const bag = uniqueTokens(Object.values(quoteBagRef.current).flat());
        const buyLeaders = pickBuyTape(bag)
          .slice(0, 24)
          .map((token) => token.id);
        const targets = selectQuoteTargets(
          bag,
          visibleIdsRef.current,
          openIdRef.current,
          [...bagsRef.current.watch.map((token) => token.id), ...buyLeaders],
        );
        if (targets.length === 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        if (quoting) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          continue;
        }
        quoting = true;
        const started = Date.now();
        try {
          applyQuotes(await refreshQuotes(targets));
          setQuotesAt(Date.now());
        } catch {
          // keep the last printed mcap
        } finally {
          quoting = false;
        }
        const wait = Math.max(400, MCAP_MS - (Date.now() - started));
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    };
    void loop();
    return () => {
      alive = false;
    };
  }, [applyQuotes]);

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
            <span>{status === "busy" ? "Refreshing…" : error ?? (updatedAt ? `Updated ${ageLabel(updatedAt)} ago` : "Live")}</span>
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
        <span>{quotesAt ? `mcap live · ${ageLabel(quotesAt)} ago` : "mcap live · on"}</span>
        <span>{pumpLive ? "pump stream on" : "pump.fun HTTP"}</span>
        {dexHold > 0 ? <span>Dex cooling {Math.ceil(dexHold / 1000)}s</span> : null}
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
                  ? ` (${radarList.length})`
                  : item.id === "boosts"
                    ? ` (${boosts.length})`
                    : item.id === "trending"
                      ? ` (${trending.length})`
                      : item.id === "hot"
                        ? ` (${hotList.length})`
                        : item.id === "buys"
                          ? ` (${buyList.length})`
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
                  : tab === "buys"
                    ? "No buy tape yet. As Dex quotes tick, coins with the most buys in the last two minutes land here."
                  : tab === "warm"
                    ? "No coins are warming yet. Fresh launches show up next."
                    : tab === "cooling"
                      ? "No dumps or traps in memory. That is the good kind of empty."
                      : tab === "trending"
                        ? "No trending pools yet. The next Gecko scan will fill this."
                        : tab === "launch"
                          ? "Waiting for the next new pool or bonding coin…"
                          : tab === "radar"
                            ? "No X trails yet. Radar now pulls tweet links off live pairs, not just Dex profiles."
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
              <div className="side-head">
                <h2>${opened.symbol} details</h2>
                <button className="mini side-close" onClick={() => setOpenId(null)} aria-label="Close details">
                  ✕
                </button>
              </div>
              <p>
                {opened.name} · {chainLabel(opened.chainId)}
                {opened.launchpad ? ` · ${opened.launchpad}` : ""} · {opened.stage ?? "live"} ·{" "}
                {coinAgeLabel(opened.pairCreatedAt)}
                {opened.livestream
                  ? ` · LIVE ${compactCount(opened.viewers ?? 0)} watching`
                  : (opened.viewers ?? 0) > 0
                    ? ` · ${compactCount(opened.viewers)} watching`
                    : ""}
              </p>
              <CoinIntel token={opened} rug={rugs[opened.id]} busy={Boolean(rugBusy[opened.id])} />
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
                  <span>Buys 2m</span>
                  {compactCount(opened.buys2m)}
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
            <p>Open a coin — we auto-scan holders, mint, and freeze. You can still tap Rug to refresh.</p>
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
    radarCoins: TrackedToken[];
    buyCoins: TrackedToken[];
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
  if (tab === "buys") return bags.buyCoins;
  if (tab === "warm") return bags.warm;
  if (tab === "cooling") return bags.cooling;
  if (tab === "watch") return bags.watch;
  if (tab === "boosts") return bags.boosts;
  if (tab === "trending") return bags.trending;
  if (tab === "launch") return bags.launch;
  if (tab === "radar") {
    if (bags.query.trim() && bags.searchHits.length) return bags.searchHits;
    return bags.radarCoins;
  }
  if (bags.query.trim() && bags.searchHits.length) return bags.searchHits;
  return bags.radarCoins;
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

function IntelChips({
  token,
  rug,
  busy,
}: {
  token: TrackedToken;
  rug?: RugReport;
  busy?: boolean;
}) {
  const stats = rug?.stats;
  const chips: { key: string; label: string; tone: string }[] = [];
  const pulse = pulseLabel(pulseStage(token));
  if (pulse) chips.push({ key: "pulse", label: pulse, tone: pulse === "STRETCH" || pulse === "MIGRATED" ? "live" : "ok" });
  if (token.livestream) {
    chips.unshift({
      key: "live",
      label: `LIVE ${compactCount(token.viewers ?? 0)} watching`,
      tone: "live",
    });
  } else if ((token.viewers ?? 0) > 0) {
    chips.unshift({ key: "live", label: `${compactCount(token.viewers)} watching`, tone: "ok" });
  }
  if (stats?.devSold) chips.push({ key: "ds", label: "DS", tone: "warn" });
  else if (stats?.creatorPct != null) {
    chips.push({
      key: "dev",
      label: `Dev ${sharePct(stats.creatorPct)}`,
      tone: stats.creatorPct >= 8 ? "warn" : "ok",
    });
  }
  if (stats?.serialLauncher) {
    chips.push({ key: "serial", label: `Serial ${stats.creatorLaunches}`, tone: "bad" });
  } else if ((stats?.creatorLaunches ?? 0) >= 3) {
    chips.push({ key: "serial", label: `${stats?.creatorLaunches} deploys`, tone: "warn" });
  }
  if (stats?.tooBundled) {
    chips.push({
      key: "bundle",
      label: `Bundled ${sharePct(stats.bundledPct)}`,
      tone: "bad",
    });
  } else if ((stats?.bundleWallets ?? 0) >= 4) {
    chips.push({
      key: "bundle",
      label: `Clustered ${sharePct(stats?.bundledPct)}`,
      tone: "warn",
    });
  }
  if (stats?.top10Pct != null) {
    chips.push({
      key: "t10",
      label: `Top10 ${sharePct(stats.top10Pct)}`,
      tone: stats.top10Pct >= 30 ? "bad" : "ok",
    });
  }
  if (stats?.insiderPct != null) {
    chips.push({
      key: "ins",
      label: `Insd ${sharePct(stats.insiderPct)}`,
      tone: stats.insiderPct >= 8 ? "warn" : "ok",
    });
  }
  if (stats?.mintAuthority != null) {
    chips.push({
      key: "mint",
      label: stats.mintAuthority ? "Mint" : "Mint no",
      tone: stats.mintAuthority ? "bad" : "ok",
    });
  }
  if (stats?.freezeAuthority != null) {
    chips.push({
      key: "frz",
      label: stats.freezeAuthority ? "Freeze" : "Freeze no",
      tone: stats.freezeAuthority ? "bad" : "ok",
    });
  }
  if (token.boostAmount) chips.push({ key: "paid", label: "Paid", tone: "warn" });
  const xAge = twitterAgeChip(token.twitterJoinedAt);
  if (xAge) chips.push({ key: "xage", label: xAge, tone: "" });
  if (token.buys2m || token.buys5m) {
    chips.push({
      key: "buys",
      label: token.buys2m
        ? `${compactCount(token.buys2m)} buys 2m`
        : `${compactCount(token.buys5m)} buys 5m`,
      tone: "ok",
    });
  }
  if (!chips.length && busy) chips.push({ key: "scan", label: "scanning…", tone: "" });
  if (!chips.length) return null;
  return (
    <div className="intel-chips">
      {chips.map((chip) => (
        <span key={chip.key} className={`intel-chip ${chip.tone}`}>
          {chip.label}
        </span>
      ))}
    </div>
  );
}

function CoinIntel({
  token,
  rug,
  busy,
}: {
  token: TrackedToken;
  rug?: RugReport;
  busy?: boolean;
}) {
  const stats = rug?.stats;
  const tape = tapeQuality(token);
  const pulse = pulseLabel(pulseStage(token));
  const cells = [
    { label: "Pulse", value: pulse ?? "—", tone: pulse === "STRETCH" || pulse === "MIGRATED" ? "live" : "" },
    {
      label: "Dev hold",
      value: stats?.devSold ? "DS" : sharePct(stats?.creatorPct),
      tone: stats?.devSold || (stats?.creatorPct ?? 0) >= 8 ? "warn" : "",
    },
    {
      label: "Dev deploys",
      value:
        stats?.creatorLaunches != null
          ? `${stats.creatorLaunches}${stats.creatorDead != null ? ` · ${stats.creatorDead} dead` : ""}`
          : "—",
      tone: stats?.serialLauncher ? "bad" : "",
    },
    { label: "Top 10 H.", value: sharePct(stats?.top10Pct), tone: (stats?.top10Pct ?? 0) >= 30 ? "bad" : "" },
    {
      label: "Bundled",
      value:
        stats?.bundledPct != null
          ? `${sharePct(stats.bundledPct)}${stats.bundleWallets ? ` · ${stats.bundleWallets} wallets` : ""}`
          : "—",
      tone: stats?.tooBundled ? "bad" : "",
    },
    { label: "Insiders H.", value: sharePct(stats?.insiderPct), tone: (stats?.insiderPct ?? 0) >= 8 ? "warn" : "" },
    { label: "Holders", value: compactCount(stats?.holderCount), tone: "" },
    {
      label: "Buys 2m",
      value: compactCount(token.buys2m ?? (token.buys5m != null ? Math.round(token.buys5m * 0.4) : undefined)),
      tone: (token.buys2m ?? 0) >= 40 ? "ok" : "",
    },
    {
      label: "Mint Auth.",
      value: authLabel(stats?.mintAuthority),
      tone: stats?.mintAuthority ? "bad" : stats?.mintAuthority === false ? "ok" : "",
    },
    {
      label: "Freeze Auth.",
      value: authLabel(stats?.freezeAuthority),
      tone: stats?.freezeAuthority ? "bad" : stats?.freezeAuthority === false ? "ok" : "",
    },
    { label: "LP locked", value: sharePct(stats?.lpLockedPct), tone: (stats?.lpLockedPct ?? 0) >= 90 ? "ok" : "" },
    {
      label: "Viewers",
      value: token.livestream || token.viewers != null ? compactCount(token.viewers ?? 0) : "—",
      tone: token.livestream ? "live" : "",
      hint: token.livestreamTitle,
    },
    { label: "1h traders", value: compactCount(token.buyers1h), tone: tape.washy ? "warn" : "" },
    {
      label: "Organic tape",
      value: tape.uniqueShare != null ? sharePct(tape.uniqueShare * 100) : "—",
      tone: tape.washy ? "bad" : (tape.uniqueShare ?? 0) >= 0.35 ? "ok" : "",
    },
    { label: "Turnover 1h", value: tape.turnover != null ? `${tape.turnover.toFixed(2)}x` : "—", tone: "" },
    {
      label: "From ATH",
      value: tape.athDrawdown != null ? `-${Math.round(tape.athDrawdown)}%` : compactUsd(token.athMarketCap),
      tone: (tape.athDrawdown ?? 0) >= 40 ? "warn" : "",
    },
    { label: "X age", value: twitterAgeChip(token.twitterJoinedAt)?.replace(/^X /, "") ?? "—", tone: "" },
    {
      label: "Boosts",
      value: token.boostAmount ? compactCount(token.boostAmount) : "No",
      tone: token.boostAmount ? "warn" : "",
    },
  ];
  return (
    <div className="coin-intel">
      <div className="coin-intel-head">
        <h3>Token data & security</h3>
        <p>
          {busy
            ? "Scanning holders, mint, freeze, and deployer history…"
              : rug
              ? `${rug.sources.join(" · ")}. Pulse / DS / serial / bundled look / unique buyers — public-tape read, not a private Axiom indexer.`
              : "Auto-scans holders, mint/freeze, and this wallet's other deploys. Viewers are live pump.fun watchers."}
        </p>
      </div>
      <div className="intel-grid">
        {cells.map((cell) => (
          <div key={cell.label} className={`intel-cell ${cell.tone}`} title={cell.hint}>
            <span>{cell.label}</span>
            <strong>{cell.value}</strong>
            {cell.hint ? <em>{cell.hint}</em> : null}
          </div>
        ))}
      </div>
    </div>
  );
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
            {token.livestream
              ? ` · LIVE ${compactCount(token.viewers ?? 0)}`
              : (token.viewers ?? 0) > 0
                ? ` · ${compactCount(token.viewers)} watching`
                : ""}
            {pulseLabel(pulseStage(token)) ? ` · ${pulseLabel(pulseStage(token))}` : ""}
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
      <IntelChips token={token} rug={rug} busy={rugBusy} />
      <AnalysisPanel analysis={analysis} compact />
      <TweetPulse token={token} compact />
      <div className="metrics">
        <div>
          <span>Mcap</span>
          {compactUsd(token.marketCap)}
        </div>
        <div>
          <span>2m buys</span>
          <b className={token.buys2m || token.buys5m ? "pos" : ""}>
            {compactCount(token.buys2m ?? (token.buys5m != null ? Math.round(token.buys5m * 0.4) : undefined))}
          </b>
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
          <span>Viewers</span>
          <b className={token.livestream ? "pos" : ""}>
            {compactCount(token.livestream || (token.viewers ?? 0) > 0 ? token.viewers : undefined)}
          </b>
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

