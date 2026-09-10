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

- **Heat tabs** (hottest → coolest): **Trending** → **Today's meta** → **Hot** → **Warm** → **Fresh** → **Cooling**. Cards default-sort the same way. Heat is an analysis lane (momentum + X + flow), not just “on the trending feed”.
- **Today's meta** — reads **today's tape** (Gecko trending + 24h rips). The coin that went hardest *today* is the meta — not yesterday's leftover million-cap. Same-category names are listed beside it and searched on DexScreener. Example of the idea: if a computer-coin rips today, desk/keyboard names show up next to it.
- **Trending** — GeckoTerminal trending pools, sorted by heat
- **Hot / Warm** — cross-cut of every live bag: strongest reads, then coins that are only heating up
- **Fresh** — new pools and bonding coins (pump.fun, Bags, BNB / Four.meme, Robinhood, global Gecko). Filter by launchpad chip.
- **Cooling** — dumps and trap-shaped prints so you can skip late candles
- **Twitter radar** — wide net for tweet-driven rips. Pair tweet links, pump handles, Dex profiles, **and** new coins already printing volume (the Plumber shape) before the tweet is attached. Each cycle searches job/news names plus today's hottest tickers, backfills Dex pair socials (80 at a time), and pulls more pump / Gecko / Solana-Base-BNB new pools.
- **Boosted** — tokens paying for visibility (attention, not quality)
- **KOL watch** — local list of X handles with live `from:handle` search
- **CA scanner** — paste a tweet, extract tickers / handles / Solana + EVM addresses, look them up
- **Watchlist** — saved in `localStorage`
- **Rug check** — on-demand scan (auto-runs in the CA scanner)
  - Solana: [RugCheck](https://rugcheck.xyz) mint/freeze/LP lock + [GoPlus](https://gopluslabs.io) holders
  - EVM: GoPlus honeypot, tax, mint, creator bag, unverified source
  - Local pair stats: thin liquidity and brand-new pools
- **Tweet attraction** — launching coins with an X status link show **likes and total interactions** on the card (RTs + replies + quotes + bookmarks). You do not have to open Twitter. You can still paste an `x.com/.../status/ID` link in the CA scanner (`quiet` / `warming` / `hot` / `viral`)
- **Token hype** — each card gets a market-attraction badge from 24h volume, 1h pump, Dex boosts, turnover, and tweet likes
- **Filters** — last hour, still bonding, has X, has likes; sort hot→warm→fresh / newest / hottest / most likes / looks like a runner
- **Padre** — Copy CA sits next to a Padre button that opens `https://trade.padre.gg/trade/{chain}/{contract}` for that exact coin (Solana, BNB, ETH, Base)
- **Learned rips** — studies million-dollar runners (PONS on Robinhood, graduated pump coins) vs the pack: why they went so much higher (reach, venue, volume). The tab lists those lessons and **possible runners** scored from that memory. Heuristic only.
- **Analysis** — each card gets a strong/mixed/weak/trap read: 5m vs 1h momentum, likes vs followers, buy/sell quality, wash-looking volume, thin liquidity, paid boosts with a dead tweet. Sidebar shows the full for/against list.
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

The board analyzes each live coin once per update, skips no-op merges, and only paints the top 48 cards on a tab so the UI stays responsive while the sniffer keeps running.

Dev mode proxies DexScreener, GeckoTerminal, RugCheck, GoPlus, and tweet-embed metrics through Vite to avoid browser CORS issues.

## Disclaimer

Public market data only. A “safe” rug badge is a heuristic, not a guarantee. Not financial advice.
