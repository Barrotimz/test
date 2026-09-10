const DEX_TO_PAD: Record<string, string> = {
  "pump-fun": "pump.fun",
  pumpfun: "pump.fun",
  pump: "pump.fun",
  bags: "Bags",
  "bags-fm": "Bags",
  bagsfm: "Bags",
  "four-meme": "Four.meme",
  fourmeme: "Four.meme",
  "four_meme": "Four.meme",
  moonshot: "Moonshot",
  moonit: "Moonshot",
  "moonshot-money": "Moonshot",
  letsbonk: "Bonk",
  "lets-bonk": "Bonk",
  "letsbonk-fun": "Bonk",
  "raydium-launchlab": "Bonk",
  launchlab: "Bonk",
  bonk: "Bonk",
  bonkers: "Bonkers",
  mayhem: "Mayhem",
  printr: "Printr",
  stonkfun: "Stonkfun",
  "stonk-fun": "Stonkfun",
  surge: "Surge",
  soar: "Soar",
  "pve-win": "pve.win",
  pvewin: "pve.win",
  liquid: "Liquid",
  "meteora-dbc": "Meteora",
  meteora: "Meteora",
};

export const LAUNCHPADS = [
  "pump.fun",
  "Bags",
  "Four.meme",
  "Moonshot",
  "Bonk",
  "Robinhood",
  "Mayhem",
  "Bonkers",
  "Printr",
  "Stonkfun",
  "Surge",
  "Soar",
  "pve.win",
  "Liquid",
  "Meteora",
] as const;

export function launchpadFromDex(dexId?: string, chainId?: string): string | undefined {
  if (dexId) {
    const key = dexId.toLowerCase().replace(/[:/]/g, "-");
    if (DEX_TO_PAD[key]) return DEX_TO_PAD[key];
    for (const [alias, label] of Object.entries(DEX_TO_PAD)) {
      if (key.includes(alias)) return label;
    }
  }
  if (chainId === "robinhood") return "Robinhood";
  return undefined;
}
