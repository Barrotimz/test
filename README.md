# XMeme Radar

A Twitter / X **memecoin tracker** for this repo. There was no monitor here before — this app watches tokens that just published socials or bought DexScreener boosts, then gives you one-click live X search for `$TICKER` and contract-address chatter.

It is not a firehose of every tweet on X. That needs official X API credentials or a paid alert product. This dashboard uses public market APIs and deep-links into X.

## Existing paid Twitter monitors

If you want sub-second tweet alerts into Telegram/Discord/bots:

- [X-Relay](https://x-relay.com/) — account + CA detection + DexScreener enrichment
- [TweetStream](https://tweetstream.io/crypto-twitter-alerts) — WebSocket alerts for selected KOLs
- [Xanguard](https://xanguard.tech/) — sub-second X alerts, pump.fun matching
- [Core X Tracker](https://github.com/CoreXTracker/core) — meme-coin / pump.fun X tracker

## What this app does

- **Twitter radar** — latest DexScreener token profiles that include an X link
- **Boosted** — tokens paying for visibility (attention, not quality)
- **Trending** — GeckoTerminal trending pools (Solana / Base / BSC / Ethereum)
- **KOL watch** — local list of X handles with live `from:handle` search
- **CA scanner** — paste a tweet, extract tickers / handles / Solana + EVM addresses, look them up
- **Watchlist** — saved in `localStorage`
- **Rug check** — on-demand scan (auto-runs in the CA scanner)
  - Solana: [RugCheck](https://rugcheck.xyz) mint/freeze/LP lock + [GoPlus](https://gopluslabs.io) holders
  - EVM: GoPlus honeypot, tax, mint, creator bag, unverified source
  - Local pair stats: thin liquidity and brand-new pools
- **Tweet attraction** — paste an `x.com/.../status/ID` link to score likes, RTs, quotes, replies, views, and author followers (`quiet` / `warming` / `hot` / `viral`)
- **Token hype** — each card gets a market-attraction badge from 24h volume, 1h pump, Dex boosts, and turnover
- **Coin age** — pair/pool created-at on every card (`just launched`, `12m old`, `5h old`, `3d old`). Sort **Newest first** or **Hottest first**. These are already-trading coins, not unreleased launches.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173

```bash
npm test
npm run build
```

Dev mode proxies DexScreener, GeckoTerminal, RugCheck, GoPlus, and tweet-embed metrics through Vite to avoid browser CORS issues.

## Disclaimer

Public market data only. A “safe” rug badge is a heuristic, not a guarantee. Not financial advice.
