const SOLANA_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
const EVM_RE = /\b0x[a-fA-F0-9]{40}\b/g;
const TICKER_RE = /\$([A-Za-z][A-Za-z0-9]{1,14})/g;
const HANDLE_RE = /(?:^|[^A-Za-z0-9_])@([A-Za-z0-9_]{2,15})\b/g;

const SOLANA_FALSE_POSITIVES = new Set([
  "11111111111111111111111111111111",
  "So11111111111111111111111111111111111111112",
]);

export type ExtractedMentions = {
  solana: string[];
  evm: string[];
  tickers: string[];
  handles: string[];
};

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function extractMentions(text: string): ExtractedMentions {
  const solana = unique(text.match(SOLANA_RE) ?? []).filter(
    (addr) => !SOLANA_FALSE_POSITIVES.has(addr) && !addr.startsWith("0x"),
  );
  const evm = unique((text.match(EVM_RE) ?? []).map((addr) => addr.toLowerCase()));
  const tickers = unique(
    [...text.matchAll(TICKER_RE)].map((match) => match[1].toUpperCase()),
  );
  const handles = unique(
    [...text.matchAll(HANDLE_RE)].map((match) => match[1]),
  );

  return { solana, evm, tickers, handles };
}
