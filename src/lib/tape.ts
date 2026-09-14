import type { Post, Rank } from "../types";

export type Mark = {
  pnl: number;
  progress: number;
  remainingMs: number;
  settled: boolean;
  hit: boolean | null;
};

export function isLive(post: Post, now = Date.now()): boolean {
  return post.kind === "call" && !!post.call && now < post.call.expiresAt;
}

export function markCall(post: Post, now = Date.now()): Mark | null {
  if (!post.call) return null;
  const { targetPct, expiresAt, seed } = post.call;
  const span = Math.max(1, expiresAt - post.createdAt);
  const progress = Math.min(1, Math.max(0, (now - post.createdAt) / span));
  const settled = now >= expiresAt;
  const destinedHit = seed % 3 !== 0;
  const wave = Math.sin(progress * Math.PI * (2 + (seed % 4)) + seed) * Math.max(8, Math.abs(targetPct) * 0.22);
  const toward = destinedHit ? targetPct : targetPct * -0.45;
  const pnl = Math.round((toward * (0.15 + 0.85 * progress) + wave) * 10) / 10;
  const hit = settled ? (targetPct >= 0 ? pnl >= targetPct * 0.85 : pnl <= targetPct * 0.85) : null;
  return { pnl, progress, remainingMs: Math.max(0, expiresAt - now), settled, hit };
}

export function displayPnl(post: Post, now = Date.now()): number | undefined {
  const mark = markCall(post, now);
  if (mark) return mark.pnl;
  return post.pnl;
}

export function isGrave(post: Post, now = Date.now()): boolean {
  if (post.kind === "loss") return true;
  const mark = markCall(post, now);
  return mark?.settled === true && mark.hit === false;
}

export function formatRemain(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function scoreTrader(posts: Post[], now = Date.now()) {
  const closed = posts.filter((post) => {
    if (post.kind === "win" || post.kind === "loss") return true;
    return post.kind === "call" && markCall(post, now)?.settled;
  });
  const ordered = [...closed].sort((a, b) => b.createdAt - a.createdAt);
  let hits = 0;
  let misses = 0;
  for (const post of ordered) {
    if (wasHit(post, now)) hits += 1;
    else misses += 1;
  }
  let streak = 0;
  for (const post of ordered) {
    if (!wasHit(post, now)) break;
    streak += 1;
  }
  const total = hits + misses;
  const hitRate = total ? Math.round((hits / total) * 100) : 0;
  const score = hits * 12 + streak * 8 + hitRate;
  const rank: Rank = score > 90 ? "Deity" : score > 60 ? "Wizard" : score > 36 ? "Ape" : score > 16 ? "Crab" : "Shrimp";
  return { hits, misses, hitRate, streak, rank, score, total };
}

function wasHit(post: Post, now: number): boolean {
  if (post.kind === "win") return true;
  if (post.kind === "loss") return false;
  return markCall(post, now)?.hit === true;
}
