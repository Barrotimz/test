import type { Chain, PostKind } from "../types";

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

export function formatTime(ts: number): string {
  const delta = Date.now() - ts;
  const min = Math.floor(delta / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

export function formatPnl(pnl?: number): string | null {
  if (pnl === undefined || Number.isNaN(pnl)) return null;
  const sign = pnl > 0 ? "+" : "";
  return `${sign}${pnl}%`;
}

export function kindLabel(kind: PostKind): string {
  if (kind === "win") return "WIN";
  if (kind === "loss") return "LOSS";
  if (kind === "call") return "CALL";
  return "STORY";
}

export function chainLabel(chain: Chain): string {
  return { sol: "SOL", eth: "ETH", base: "BASE", bsc: "BSC" }[chain];
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}
