export type ChainDef = {
  id: string;
  gecko?: string;
  label: string;
};

export const CHAINS: ChainDef[] = [
  { id: "solana", gecko: "solana", label: "Solana" },
  { id: "bsc", gecko: "bsc", label: "BNB" },
  { id: "ethereum", gecko: "eth", label: "ETH" },
  { id: "base", gecko: "base", label: "Base" },
  { id: "robinhood", gecko: "robinhood", label: "Robinhood" },
  { id: "arbitrum", gecko: "arbitrum", label: "Arbitrum" },
  { id: "avalanche", gecko: "avax", label: "Avalanche" },
  { id: "polygon", gecko: "polygon_pos", label: "Polygon" },
  { id: "optimism", gecko: "optimism", label: "Optimism" },
  { id: "linea", gecko: "linea", label: "Linea" },
  { id: "blast", gecko: "blast", label: "Blast" },
  { id: "scroll", gecko: "scroll", label: "Scroll" },
  { id: "mantle", gecko: "mantle", label: "Mantle" },
  { id: "zksync", gecko: "zksync", label: "zkSync" },
  { id: "ton", gecko: "ton", label: "TON" },
  { id: "sui", gecko: "sui-network", label: "Sui" },
  { id: "aptos", gecko: "aptos", label: "Aptos" },
  { id: "pulsechain", gecko: "pulsechain", label: "Pulse" },
  { id: "opbnb", gecko: "opbnb", label: "opBNB" },
  { id: "sei", gecko: "sei-network", label: "Sei" },
  { id: "sonic", gecko: "sonic", label: "Sonic" },
  { id: "hyperevm", gecko: "hyperevm", label: "HyperEVM" },
  { id: "unichain", gecko: "unichain", label: "Unichain" },
  { id: "worldchain", gecko: "world-chain", label: "World" },
  { id: "abstract", gecko: "abstract", label: "Abstract" },
  { id: "berachain", gecko: "berachain", label: "Bera" },
  { id: "flare", gecko: "flare", label: "Flare" },
  { id: "cronos", gecko: "cro", label: "Cronos" },
  { id: "tron", gecko: "tron", label: "TRON" },
];

const ALIASES: Record<string, string> = {
  eth: "ethereum",
  ethereum: "ethereum",
  bnb: "bsc",
  bsc: "bsc",
  avax: "avalanche",
  avalanche: "avalanche",
  polygon_pos: "polygon",
  polygon: "polygon",
  "sui-network": "sui",
  sui: "sui",
  "sei-network": "sei",
  sei: "sei",
  "world-chain": "worldchain",
  cro: "cronos",
  cronos: "cronos",
};

export function normalizeChain(id: string): string {
  return ALIASES[id] ?? id;
}

export function chainLabel(id: string): string {
  const key = normalizeChain(id);
  return CHAINS.find((chain) => chain.id === key)?.label ?? id;
}

export const GECKO_NETWORKS = CHAINS.map((chain) => chain.gecko).filter(
  (id): id is string => Boolean(id),
);
