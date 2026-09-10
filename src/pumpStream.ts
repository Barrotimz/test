import { tokenId } from "./chains";
import { attachXTrail } from "./social";
import type { TrackedToken } from "./types";

export const PUMP_STREAM_URL = "wss://pumpportal.fun/api/data";

export type PumpCreateEvent = {
  mint?: string;
  name?: string;
  symbol?: string;
  uri?: string;
  txType?: string;
  marketCapSol?: number;
  traderPublicKey?: string;
  bondingCurveKey?: string;
};

export function pumpCreateToToken(event: PumpCreateEvent, at = Date.now()): TrackedToken | undefined {
  const mint = event.mint?.trim();
  if (!mint) return undefined;
  if (event.txType && event.txType !== "create") return undefined;
  const symbol = (event.symbol || event.name || "PUMP").replace(/^\$/, "").slice(0, 16);
  const name = event.name || symbol;
  return attachXTrail({
    id: tokenId("solana", mint),
    chainId: "solana",
    tokenAddress: mint,
    name,
    symbol,
    dexUrl: `https://pump.fun/${mint}`,
    launchpad: "pump.fun",
    creator: event.traderPublicKey,
    websiteUrl: event.uri?.startsWith("http") ? event.uri : undefined,
    pairCreatedAt: at,
    stage: "launching",
    seenAt: at,
    source: "launch",
  });
}

export function listenPumpCreates(
  onCreate: (token: TrackedToken) => void,
  onStatus?: (live: boolean) => void,
): () => void {
  let closed = false;
  let socket: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wait = 2000;

  const connect = () => {
    if (closed || typeof WebSocket === "undefined") return;
    try {
      socket = new WebSocket(PUMP_STREAM_URL);
    } catch {
      onStatus?.(false);
      if (!closed) {
        timer = setTimeout(connect, wait);
        wait = Math.min(30_000, Math.round(wait * 1.5));
      }
      return;
    }
    socket.onopen = () => {
      wait = 2000;
      onStatus?.(true);
      socket?.send(JSON.stringify({ method: "subscribeNewToken" }));
    };
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data)) as PumpCreateEvent;
        const token = pumpCreateToToken(data);
        if (token) onCreate(token);
      } catch {
        // greeting / malformed
      }
    };
    socket.onerror = () => socket?.close();
    socket.onclose = () => {
      onStatus?.(false);
      if (closed) return;
      timer = setTimeout(connect, wait);
      wait = Math.min(30_000, Math.round(wait * 1.5));
    };
  };

  connect();
  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    socket?.close();
  };
}
