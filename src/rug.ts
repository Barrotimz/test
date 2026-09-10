import type { TrackedToken } from "./types";

const RUG = import.meta.env.DEV ? "/rug" : "https://api.rugcheck.xyz";
const GOPLUS = import.meta.env.DEV ? "/goplus" : "https://api.gopluslabs.io";

export type RiskLevel = "safe" | "caution" | "danger" | "unknown";
export type FlagLevel = "pass" | "warn" | "fail" | "info";

export type RugFlag = {
  id: string;
  label: string;
  detail: string;
  level: FlagLevel;
};

export type RugReport = {
  level: RiskLevel;
  score: number;
  flags: RugFlag[];
  holders?: number;
  lpLockedPct?: number;
  sources: string[];
};

export type RugSignals = {
  mintAuthority?: boolean | null;
  freezeAuthority?: boolean | null;
  rugged?: boolean;
  honeypot?: boolean;
  cannotSell?: boolean;
  buyTaxPct?: number;
  sellTaxPct?: number;
  lpLockedPct?: number;
  liquidityUsd?: number;
  pairAgeMs?: number;
  topHolderPct?: number;
  creatorPct?: number;
  holderCount?: number;
  openSource?: boolean | null;
  insiderClusters?: number;
  transferFee?: boolean;
  pausable?: boolean;
  rugcheckScore?: number;
  rugcheckRisks?: string[];
};

const GOPLUS_CHAIN: Record<string, string> = {
  ethereum: "1",
  eth: "1",
  bsc: "56",
  polygon: "137",
  arbitrum: "42161",
  avalanche: "43114",
  optimism: "10",
  base: "8453",
  linea: "59144",
  blast: "81457",
  scroll: "534352",
  mantle: "5000",
  zksync: "324",
  opbnb: "204",
  cronos: "25",
  gnosis: "100",
  fantom: "250",
  celo: "42220",
  aurora: "1313161554",
};

function asPct(value?: number | string | null): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return n <= 1 ? n * 100 : n;
}

function truthy(value?: string | number | boolean | null): boolean {
  return value === true || value === "1" || value === 1;
}

export function scoreRugSignals(signals: RugSignals): RugReport {
  const flags: RugFlag[] = [];
  let score = 0;

  if (signals.rugged) {
    score += 80;
    flags.push({ id: "rugged", label: "Marked rugged", detail: "RugCheck flagged this mint as rugged.", level: "fail" });
  }
  if (signals.honeypot || signals.cannotSell) {
    score += 80;
    flags.push({
      id: "honeypot",
      label: "Honeypot / can't sell",
      detail: "Security scan says sells may be blocked.",
      level: "fail",
    });
  }
  if (signals.mintAuthority === true) {
    score += 35;
    flags.push({
      id: "mint",
      label: "Mint authority live",
      detail: "Supply can still be minted. Classic rug lever.",
      level: "fail",
    });
  } else if (signals.mintAuthority === false) {
    flags.push({ id: "mint", label: "Mint revoked", detail: "Mint authority is null.", level: "pass" });
  }
  if (signals.freezeAuthority === true) {
    score += 25;
    flags.push({
      id: "freeze",
      label: "Freeze authority live",
      detail: "Accounts can be frozen so holders cannot sell.",
      level: "fail",
    });
  } else if (signals.freezeAuthority === false) {
    flags.push({ id: "freeze", label: "Freeze revoked", detail: "Freeze authority is null.", level: "pass" });
  }
  if (signals.pausable) {
    score += 20;
    flags.push({ id: "pause", label: "Pausable token", detail: "Transfers can be paused by an authority.", level: "fail" });
  }
  if (signals.transferFee) {
    score += 10;
    flags.push({ id: "fee", label: "Transfer fee", detail: "Token-2022 transfer fee is configured.", level: "warn" });
  }

  const tax = Math.max(signals.buyTaxPct ?? 0, signals.sellTaxPct ?? 0);
  if (tax >= 10) {
    score += 30;
    flags.push({ id: "tax", label: `High tax ${tax.toFixed(1)}%`, detail: "Buy or sell tax is 10%+.", level: "fail" });
  } else if (tax > 0) {
    score += 8;
    flags.push({ id: "tax", label: `Tax ${tax.toFixed(1)}%`, detail: "A trading tax is present.", level: "warn" });
  }

  if (signals.lpLockedPct != null) {
    if (signals.lpLockedPct < 50) {
      score += 22;
      flags.push({
        id: "lp",
        label: `LP mostly unlocked (${signals.lpLockedPct.toFixed(0)}%)`,
        detail: "Liquidity can be pulled.",
        level: "fail",
      });
    } else if (signals.lpLockedPct < 90) {
      score += 10;
      flags.push({
        id: "lp",
        label: `LP partly locked (${signals.lpLockedPct.toFixed(0)}%)`,
        detail: "Some LP is still unlocked.",
        level: "warn",
      });
    } else {
      flags.push({
        id: "lp",
        label: `LP locked ${signals.lpLockedPct.toFixed(0)}%`,
        detail: "Most reported LP is locked or burned.",
        level: "pass",
      });
    }
  }

  if (signals.liquidityUsd != null) {
    if (signals.liquidityUsd < 3000) {
      score += 18;
      flags.push({
        id: "liq",
        label: "Thin liquidity",
        detail: `Only about $${Math.round(signals.liquidityUsd)} in the main pool.`,
        level: "warn",
      });
    } else {
      flags.push({
        id: "liq",
        label: "Liquidity present",
        detail: `About $${Math.round(signals.liquidityUsd).toLocaleString()} in pool.`,
        level: "pass",
      });
    }
  }

  if (signals.pairAgeMs != null && signals.pairAgeMs < 60 * 60 * 1000) {
    score += 10;
    flags.push({
      id: "age",
      label: "Brand new pair",
      detail: "Pool is under an hour old. Easy to rug in the first candles.",
      level: "warn",
    });
  }

  if (signals.topHolderPct != null && signals.topHolderPct >= 30) {
    score += 20;
    flags.push({
      id: "whale",
      label: `Top wallet ${signals.topHolderPct.toFixed(0)}%`,
      detail: "One wallet can dump the chart.",
      level: "fail",
    });
  } else if (signals.topHolderPct != null && signals.topHolderPct >= 15) {
    score += 8;
    flags.push({
      id: "whale",
      label: `Top wallet ${signals.topHolderPct.toFixed(0)}%`,
      detail: "Concentration is elevated.",
      level: "warn",
    });
  }

  if (signals.creatorPct != null && signals.creatorPct >= 8) {
    score += 14;
    flags.push({
      id: "dev",
      label: `Creator still holds ${signals.creatorPct.toFixed(1)}%`,
      detail: "Dev bag is large enough to matter.",
      level: "warn",
    });
  }

  if (signals.openSource === false) {
    score += 8;
    flags.push({
      id: "source",
      label: "Unverified contract",
      detail: "Source is not verified on the explorer.",
      level: "warn",
    });
  }

  if ((signals.insiderClusters ?? 0) >= 2) {
    score += 8;
    flags.push({
      id: "insiders",
      label: `${signals.insiderClusters} insider clusters`,
      detail: "RugCheck linked wallets that look coordinated.",
      level: "warn",
    });
  }

  for (const risk of signals.rugcheckRisks ?? []) {
    score += 12;
    flags.push({ id: `rc-${risk}`, label: risk, detail: "Reported by RugCheck.", level: "fail" });
  }

  if (signals.holderCount != null) {
    flags.push({
      id: "holders",
      label: `${signals.holderCount.toLocaleString()} holders`,
      detail: "Holder count from the security scan.",
      level: "info",
    });
  }

  const critical = new Set(["honeypot", "rugged", "mint", "freeze", "pause"]);
  const level: RiskLevel =
    flags.some((flag) => flag.level === "fail" && critical.has(flag.id)) || score >= 40
      ? "danger"
      : score >= 15
        ? "caution"
        : flags.some((flag) => flag.level === "pass")
          ? "safe"
          : "unknown";

  return {
    level,
    score: Math.min(100, score),
    flags,
    holders: signals.holderCount,
    lpLockedPct: signals.lpLockedPct,
    sources: [],
  };
}

type RugcheckReport = {
  rugged?: boolean;
  score?: number;
  score_normalised?: number;
  risks?: { name?: string; level?: string; description?: string }[] | string[];
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
  token?: { mintAuthority?: string | null; freezeAuthority?: string | null };
  totalHolders?: number;
  totalMarketLiquidity?: number;
  graphInsidersDetected?: number;
  markets?: { lp?: { lpLockedPct?: number } }[];
  token_extensions?: { transferFeeConfig?: unknown; pausableConfig?: unknown };
  topHolders?: { owner?: string; address?: string; pct?: number; insider?: boolean }[];
  knownAccounts?: Record<string, { type?: string }>;
};

type GoplusSolana = {
  mintable?: { status?: string };
  freezable?: { status?: string };
  holder_count?: string;
  holders?: { percent?: string; tag?: string }[];
  creators?: { percent?: string }[];
  transfer_fee?: Record<string, unknown>;
};

type GoplusEvm = {
  is_honeypot?: string;
  honeypot_with_same_creator?: string;
  cannot_sell_all?: string;
  cannot_buy?: string;
  buy_tax?: string;
  sell_tax?: string;
  is_open_source?: string;
  is_mintable?: string;
  hidden_owner?: string;
  can_take_back_ownership?: string;
  owner_change_balance?: string;
  creator_percent?: string;
  holder_count?: string;
  holders?: { percent?: string; is_locked?: number; tag?: string; is_contract?: number }[];
  is_in_dex?: string;
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return (await response.json()) as T;
}

function tokenSignals(token: TrackedToken): RugSignals {
  return {
    liquidityUsd: token.liquidity,
    pairAgeMs: token.pairCreatedAt ? Date.now() - token.pairCreatedAt : undefined,
  };
}

function mergeSignals(...parts: RugSignals[]): RugSignals {
  return Object.assign({}, ...parts);
}

function fromRugcheck(report: RugcheckReport): RugSignals {
  const risks = (report.risks ?? []).map((risk) =>
    typeof risk === "string" ? risk : risk.name || risk.description || "RugCheck risk",
  );
  const lpLockedPct = report.markets
    ?.map((market) => market.lp?.lpLockedPct ?? 0)
    .reduce((best, value) => Math.max(best, value), 0);
  const top = report.topHolders?.find((holder) => {
    const key = holder.owner ?? holder.address ?? "";
    const kind = report.knownAccounts?.[key]?.type;
    return !holder.insider && kind !== "AMM" && kind !== "LOCKER";
  });
  return {
    rugged: report.rugged,
    mintAuthority: (report.mintAuthority ?? report.token?.mintAuthority ?? null) != null,
    freezeAuthority: (report.freezeAuthority ?? report.token?.freezeAuthority ?? null) != null,
    holderCount: report.totalHolders,
    liquidityUsd: report.totalMarketLiquidity,
    lpLockedPct: lpLockedPct || undefined,
    insiderClusters: report.graphInsidersDetected,
    transferFee: Boolean(report.token_extensions?.transferFeeConfig),
    pausable: Boolean(report.token_extensions?.pausableConfig),
    rugcheckScore: report.score_normalised ?? report.score,
    rugcheckRisks: risks.filter(Boolean),
    topHolderPct: top?.pct,
  };
}

function fromGoplusSolana(data: GoplusSolana): RugSignals {
  const top = data.holders?.find((holder) => !/amm|pool|raydium|pump/i.test(holder.tag ?? ""));
  const feeKeys = Object.keys(data.transfer_fee ?? {});
  return {
    mintAuthority: data.mintable ? data.mintable.status !== "0" : undefined,
    freezeAuthority: data.freezable ? data.freezable.status !== "0" : undefined,
    holderCount: data.holder_count ? Number(data.holder_count) : undefined,
    topHolderPct: asPct(top?.percent),
    creatorPct: asPct(data.creators?.[0]?.percent),
    transferFee: feeKeys.length > 0,
  };
}

function fromGoplusEvm(data: GoplusEvm): RugSignals {
  const top = data.holders?.find(
    (holder) => holder.is_locked !== 1 && holder.is_contract !== 1 && !/uniswap|pool|lp/i.test(holder.tag ?? ""),
  );
  return {
    honeypot: truthy(data.is_honeypot) || truthy(data.cannot_buy),
    cannotSell: truthy(data.cannot_sell_all),
    buyTaxPct: asPct(data.buy_tax),
    sellTaxPct: asPct(data.sell_tax),
    mintAuthority: data.is_mintable ? truthy(data.is_mintable) : undefined,
    openSource: data.is_open_source ? data.is_open_source === "1" : undefined,
    creatorPct: asPct(data.creator_percent),
    holderCount: data.holder_count ? Number(data.holder_count) : undefined,
    topHolderPct: asPct(top?.percent),
  };
}

export async function checkTokenRug(token: TrackedToken): Promise<RugReport> {
  const sources: string[] = [];
  const parts: RugSignals[] = [tokenSignals(token)];

  if (token.chainId === "solana") {
    const [rug, goplus] = await Promise.allSettled([
      getJson<RugcheckReport>(`${RUG}/v1/tokens/${token.tokenAddress}/report`),
      getJson<{ result?: Record<string, GoplusSolana> }>(
        `${GOPLUS}/api/v1/solana/token_security?contract_addresses=${token.tokenAddress}`,
      ),
    ]);
    if (rug.status === "fulfilled") {
      parts.push(fromRugcheck(rug.value));
      sources.push("RugCheck");
    }
    if (goplus.status === "fulfilled") {
      const row = goplus.value.result?.[token.tokenAddress];
      if (row) {
        parts.push(fromGoplusSolana(row));
        sources.push("GoPlus");
      }
    }
  } else {
    const chain = GOPLUS_CHAIN[token.chainId];
    if (chain) {
      try {
        const data = await getJson<{ result?: Record<string, GoplusEvm> }>(
          `${GOPLUS}/api/v1/token_security/${chain}?contract_addresses=${token.tokenAddress}`,
        );
        const row = data.result?.[token.tokenAddress.toLowerCase()];
        if (row) {
          parts.push(fromGoplusEvm(row));
          sources.push("GoPlus");
        }
      } catch {
        // keep local liquidity / age signals
      }
    }
  }

  const report = scoreRugSignals(mergeSignals(...parts));
  report.sources = sources.length ? sources : ["Dex pair stats"];
  if (report.flags.length === 0) {
    report.flags.push({
      id: "none",
      label: "No extra scan data",
      detail: "Could not reach RugCheck/GoPlus. Only pair stats were used.",
      level: "info",
    });
  }
  return report;
}
