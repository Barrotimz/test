import { coinAgeBucket, pairAgeMs, tweetInteractions } from "./format";
import { scoreAgainstBrain, type RunnerBrain, type RunnerCall } from "./learn";
import { matchingRipMeta } from "./meta";
import { pulseStage, tapeQuality, twitterAccountAgeMs } from "./read";
import type { RugReport } from "./rug";
import type { TrackedToken } from "./types";

export type HeatLane = "hot" | "warm" | "fresh" | "quiet" | "trap";

export type AnalysisVerdict = "strong" | "mixed" | "weak" | "trap";

export type AnalysisNote = {
  side: "for" | "against";
  text: string;
};

export type TokenAnalysis = {
  verdict: AnalysisVerdict;
  score: number;
  call: RunnerCall;
  notes: AnalysisNote[];
  momentum: "up" | "fade" | "dump" | "flat";
  social: "hot" | "warm" | "paid" | "none";
  flow: "buyers" | "even" | "sellers" | "thin";
  heat: HeatLane;
};

function engagementRate(token: TrackedToken): number | undefined {
  const likes = token.tweetLikes;
  const followers = token.twitterFollowers;
  if (likes == null || !followers) return undefined;
  return likes / followers;
}

export function analyzeToken(token: TrackedToken, brain: RunnerBrain, rug?: RugReport): TokenAnalysis {
  const call = scoreAgainstBrain(token, brain);
  const notes: AnalysisNote[] = [];
  let score = call.score;

  const c5 = token.change5m;
  const c1 = token.change1h;
  const buys = token.buys1h ?? 0;
  const sells = token.sells1h ?? 0;
  const buyers = token.buyers1h;
  const vol5 = token.volume5m ?? 0;
  const vol1 = token.volume1h ?? 0;
  const liq = token.liquidity ?? 0;
  const mcap = token.marketCap ?? 0;
  const likes = token.tweetLikes ?? 0;
  const views = token.tweetViews ?? 0;
  const interactions = tweetInteractions(token) ?? 0;
  const ageMs = pairAgeMs(token.pairCreatedAt);
  const boost = token.boostAmount ?? 0;

  let momentum: TokenAnalysis["momentum"] = "flat";
  if ((c1 ?? 0) <= -30 || (c5 ?? 0) <= -15) {
    momentum = "dump";
    score -= 22;
    notes.push({ side: "against", text: "Already dumping — late to the move" });
  } else if ((c5 ?? 0) < 0 && (c1 ?? 0) > 15) {
    momentum = "fade";
    score -= 10;
    notes.push({ side: "against", text: "1h is green but 5m rolled over" });
  } else if ((c5 ?? 0) > 8 && (c1 ?? 0) > 8) {
    momentum = "up";
    score += 12;
    notes.push({ side: "for", text: "5m and 1h both up — momentum is aligned" });
  }

  let social: TokenAnalysis["social"] = "none";
  const rate = engagementRate(token);
  if (likes >= 200 || interactions >= 80) {
    social = "hot";
    notes.push({ side: "for", text: "X post has real heat, not just a handle" });
  } else if (likes >= 25 || interactions >= 15) {
    social = "warm";
    notes.push({ side: "for", text: "Social is warming — same early tell million-runners had" });
  } else if (boost >= 30 && likes < 10) {
    social = "paid";
    score -= 12;
    notes.push({ side: "against", text: "Boosted on DexScreener but the tweet is dead — paid attention" });
  }
  if (rate != null && rate >= 0.02) {
    score += 8;
    notes.push({ side: "for", text: "Likes vs followers are high (post is punching above reach)" });
  } else if (rate != null && followersHigh(token) && rate < 0.0004 && likes < 30) {
    score -= 8;
    notes.push({ side: "against", text: "Huge account, almost no likes — not a live catalyst" });
  }
  if (views >= 5_000 && interactions / views < 0.004) {
    notes.push({ side: "against", text: "Lots of views, almost no replies/RTs — weak engagement" });
  }
  if (likes >= 80 && vol1 < 500 && mcap < 15_000) {
    score -= 8;
    notes.push({ side: "against", text: "Social heat without volume — chatter is ahead of money" });
  }
  if (vol1 >= 20_000 && likes === 0 && !token.twitterHandle) {
    notes.push({ side: "against", text: "Volume with no X trail — harder to tell if it's organic" });
  }

  let flow: TokenAnalysis["flow"] = "even";
  if (buys + sells < 6 && mcap < 50_000) {
    flow = "thin";
    score -= 8;
    notes.push({ side: "against", text: "Almost no 1h prints — easy to fake a candle" });
  } else if (buys > 0 && buys >= sells * 1.5) {
    flow = "buyers";
    score += 10;
    notes.push({ side: "for", text: `Buyers in control (${buys} buys / ${sells} sells)` });
  } else if (sells > 0 && sells >= buys * 1.5) {
    flow = "sellers";
    score -= 12;
    notes.push({ side: "against", text: `Sellers in control (${sells} sells / ${buys} buys)` });
  }
  if (buyers != null && vol1 >= 8_000 && buyers <= 4) {
    score -= 10;
    notes.push({ side: "against", text: "Volume from a handful of wallets — wash / insider look" });
  }
  const tape = tapeQuality(token);
  if (tape.washy && !notes.some((note) => /wash/.test(note.text))) {
    score -= 8;
    notes.push({ side: "against", text: "Tape looks botty — lots of buys, almost no unique wallets" });
  } else if (tape.uniqueShare != null && tape.uniqueShare >= 0.35 && buys >= 12) {
    score += 6;
    notes.push({ side: "for", text: "Unique buyers are a real share of prints — more organic than bot wash" });
  }
  if (tape.turnover != null && tape.turnover >= 0.8 && vol1 >= 10_000) {
    score += 5;
    notes.push({ side: "for", text: "1h volume is turning over a large slice of mcap" });
  }
  if (tape.athDrawdown != null && tape.athDrawdown >= 40) {
    score -= 8;
    notes.push({ side: "against", text: `Down ${Math.round(tape.athDrawdown)}% from ATH — late unless it reclaims` });
  }
  if (vol5 > 0 && vol1 > 0 && vol5 * 12 > vol1 * 2.2) {
    score += 6;
    notes.push({ side: "for", text: "5m volume is accelerating vs the last hour" });
  }

  if (mcap > 0 && liq > 0 && liq / mcap < 0.04 && mcap > 20_000) {
    score -= 10;
    notes.push({ side: "against", text: "Book is thin vs mcap — a few sells can nuke it" });
  } else if (liq >= 8_000 && mcap >= 20_000 && liq / mcap >= 0.12) {
    notes.push({ side: "for", text: "Liquidity is not a postage stamp vs mcap" });
  }

  if (ageMs != null && ageMs < 20 * 60_000 && (c1 ?? 0) > 200 && liq < 2_000) {
    score -= 10;
    notes.push({ side: "against", text: "Parabolic on a brand-new thin pool — often the exit, not the entry" });
  }
  if (token.livestream && (vol1 >= 500 || likes >= 10 || (token.viewers ?? 0) >= 3)) {
    score += token.viewers && token.viewers >= 20 ? 10 : 6;
    notes.push({
      side: "for",
      text:
        token.viewers != null
          ? `Livestream is on · ${token.viewers} watching now`
          : "Livestream is on — attention is happening now",
    });
  }
  if (token.kingOfHill) {
    score += 6;
    notes.push({ side: "for", text: "King of the hill — winning the pad attention war" });
  }
  if (token.bondingPct != null && token.bondingPct >= 80) {
    score += 5;
    notes.push({ side: "for", text: `Bonding curve is ${token.bondingPct}% — close to graduation` });
  }
  const pulse = pulseStage(token);
  if (pulse === "stretch") {
    score += 4;
    notes.push({ side: "for", text: "Final stretch on the curve — Axiom Pulse would park this here" });
  } else if (pulse === "migrated") {
    notes.push({ side: "for", text: "Just migrated off the pad — the Raydium/PumpSwap candle window" });
  }
  const xAge = twitterAccountAgeMs(token.twitterJoinedAt);
  if (xAge != null && xAge < 7 * 24 * 60 * 60_000 && (ageMs == null || ageMs < 2 * 24 * 60 * 60_000)) {
    score -= 8;
    notes.push({ side: "against", text: "X account is brand new on a new coin — classic throwaway" });
  } else if (xAge != null && xAge > 2 * 365 * 24 * 60 * 60_000 && likes >= 20) {
    score += 4;
    notes.push({ side: "for", text: "Tweet came from an aged X account, not a 2-hour burner" });
  }
  const stats = rug?.stats;
  if (stats?.serialLauncher) {
    score -= 10;
    notes.push({
      side: "against",
      text: `Serial deployer — ${stats.creatorLaunches} prior coins, ${stats.creatorDead} already dead`,
    });
  }
  if (stats?.devSold) {
    notes.push({ side: "against", text: "Dev bag is empty (DS) — they already sold or never held" });
  } else if (stats?.creatorPct != null && stats.creatorPct >= 5 && stats.creatorPct < 30) {
    notes.push({ side: "against", text: `Dev still holds ${stats.creatorPct.toFixed(1)}%` });
  }
  if (stats?.top10Pct != null && stats.top10Pct >= 35) {
    notes.push({ side: "against", text: `Top 10 wallets hold ${stats.top10Pct.toFixed(0)}% after dropping LP/curve` });
  }
  const metaHit = matchingRipMeta(token, brain.lessons);
  if (metaHit) {
    score += 12;
    notes.push({
      side: "for",
      text: `Same meta as $${metaHit.seedSymbol} (${metaHit.label}) — copycat of today's rip`,
    });
  }

  if (rug?.level === "danger") {
    score -= 24;
    notes.push({ side: "against", text: `Rug scan: ${rug.flags.find((flag) => flag.level === "fail")?.label ?? "danger"}` });
  } else if (rug?.level === "caution") {
    score -= 8;
    notes.push({ side: "against", text: "Rug scan is caution — size smaller if you touch it" });
  }

  for (const reason of call.reasons.slice(0, 2)) {
    if (!notes.some((note) => note.text === reason)) {
      notes.push({ side: "for", text: reason });
    }
  }

  score = Math.max(0, Math.min(100, score));
  const looksLikeTrap =
    (momentum === "dump" && score < 55) ||
    (score < 22 &&
      (momentum === "dump" ||
        momentum === "fade" ||
        flow === "sellers" ||
        social === "paid" ||
        rug?.level === "danger"));
  const verdict: AnalysisVerdict = looksLikeTrap
    ? "trap"
    : score >= 64
      ? "strong"
      : score >= 38
        ? "mixed"
        : "weak";

  const confirmedHot =
    verdict === "strong" ||
    call.level === "runner" ||
    (social === "hot" && (momentum === "up" || vol1 >= 8_000 || flow === "buyers"));
  const confirmedWarm =
    verdict === "mixed" ||
    call.level === "setup" ||
    social === "warm" ||
    token.kingOfHill === true ||
    (token.livestream === true && vol1 >= 1_000) ||
    (token.bondingPct != null && token.bondingPct >= 70);

  const heat: HeatLane =
    verdict === "trap" || momentum === "dump"
      ? "trap"
      : confirmedHot
        ? "hot"
        : confirmedWarm
          ? "warm"
          : token.stage === "launching" || coinAgeBucket(token.pairCreatedAt) === "fresh"
            ? "fresh"
            : "quiet";

  return { verdict, score, call, notes: notes.slice(0, 7), momentum, social, flow, heat };
}

function followersHigh(token: TrackedToken): boolean {
  return (token.twitterFollowers ?? 0) >= 50_000;
}

export function isLikelyDump(token: TrackedToken): boolean {
  return (token.change1h ?? 0) <= -35 && ((token.volume1h ?? 0) > 2_000 || (token.tweetLikes ?? 0) > 20);
}

export function heatLane(token: TrackedToken, brain: RunnerBrain, rug?: RugReport): HeatLane {
  return analyzeToken(token, brain, rug).heat;
}

export function heatRank(lane: HeatLane): number {
  return { hot: 0, warm: 1, fresh: 2, quiet: 3, trap: 4 }[lane];
}

export function uniqueTokens(tokens: TrackedToken[]): TrackedToken[] {
  const map = new Map<string, TrackedToken>();
  for (const token of tokens) map.set(token.id, token);
  return [...map.values()];
}

export function indexAnalyses(
  tokens: TrackedToken[],
  brain: RunnerBrain,
  rugs?: Record<string, RugReport>,
): Map<string, TokenAnalysis> {
  const map = new Map<string, TokenAnalysis>();
  for (const token of tokens) {
    map.set(token.id, analyzeToken(token, brain, rugs?.[token.id]));
  }
  return map;
}

export function listsByHeat(
  tokens: TrackedToken[],
  analyses: Map<string, TokenAnalysis>,
): { hot: TrackedToken[]; warm: TrackedToken[]; trap: TrackedToken[] } {
  const hot: TrackedToken[] = [];
  const warm: TrackedToken[] = [];
  const trap: TrackedToken[] = [];
  for (const token of tokens) {
    const heat = analyses.get(token.id)?.heat;
    if (heat === "hot") hot.push(token);
    else if (heat === "warm") warm.push(token);
    else if (heat === "trap") trap.push(token);
  }
  const byScore = (a: TrackedToken, b: TrackedToken) =>
    (analyses.get(b.id)?.score ?? 0) - (analyses.get(a.id)?.score ?? 0);
  hot.sort(byScore);
  warm.sort(byScore);
  trap.sort(byScore);
  return { hot, warm, trap };
}

export function pickByHeat(
  tokens: TrackedToken[],
  brain: RunnerBrain,
  lane: HeatLane,
  analyze: (token: TrackedToken) => TokenAnalysis = (token) => analyzeToken(token, brain),
): TrackedToken[] {
  return uniqueTokens(tokens)
    .filter((token) => analyze(token).heat === lane)
    .sort((a, b) => analyze(b).score - analyze(a).score);
}

export function pickAnalyzedRunners(tokens: TrackedToken[], brain: RunnerBrain, limit = 24): TrackedToken[] {
  return [...tokens]
    .map((token) => ({ token, analysis: analyzeToken(token, brain) }))
    .filter((row) => row.analysis.verdict === "strong" || (row.analysis.verdict === "mixed" && row.analysis.call.level !== "watch"))
    .sort((a, b) => b.analysis.score - a.analysis.score)
    .slice(0, limit)
    .map((row) => row.token);
}
