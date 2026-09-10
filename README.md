# XMeme Radar

A Twitter / X **memecoin tracker** for this repo. There was no monitor here before — this app watches tokens that just published socials or bought DexScreener boosts, then gives you one-click live X search for `$TICKER` and contract-address chatter.

It is not a firehose of every tweet on X. That needs official X API credentials or a paid alert product. This dashboard uses public market APIs and deep-links into X.

## Existing paid Twitter monitors

If you want sub-second tweet alerts into Telegram/Discord/bots:

- [X-Relay](https://x-relay.com/) — account + CA detection + DexScreener enrichment
- [TweetStream](https://tweetstream.io/crypto-twitter-alerts) — WebSocket alerts for selected KOLs
- [Xanguard](https://xanguard.tech/) — sub-second X alerts, pump.fun matching
- [Core X Tracker](https://github.com/CoreXTracker/core) — meme-coin / pump.fun X tracker

## Notes from J7Tracker

[J7Tracker](https://j7tracker.io/) is the closest thing to what this board wants to be, so it is
worth being precise about what they actually sell and what of it is reachable from here.

**What they do.** They advertise social tracking on Twitter/X, Truth Social, Instagram and TikTok
at roughly **200ms**, served from five edge regions, plus a sub-10ms token deployer, vanity
contract addresses, and one hotkey across pump.fun, BONK, Four.meme, Clanker and USD1. Their
Chrome extension bolts "VAMP" buttons onto other people's trading terminals. Their business is
being *first to the post* and then deploying off it — the tracker exists to feed the deployer.

**What we cannot copy.** Their [public API](https://docs.j7tracker.io/docs) is deploy-only
(`POST /submit`, JWT plus an encrypted api key) — there is no readable social feed to consume.
Nor is there a free way to poll X timelines from a server: `syndication.twitter.com` rate-limits
datacenter IPs immediately, RSSHub's Twitter route is gone, the public Nitter mirrors are dead,
and xcancel requires a whitelisted reader. Real sub-second detection means the official X API or
one of the paid products above. This board is honest about that and does not pretend otherwise.

**What we borrowed instead.** The transferable part is not the pipe, it is the *read*. J7 is
tweet-first: the post is the asset and the coin is downstream of it. So we score the post the
same way, using data we already fetch from fxtwitter:

- **Whose post is it.** A handle that echoes the ticker (`@plumbercoin` for `$PLUMBER`) is the
  coin shilling itself. A handle that shares nothing with the ticker or name, on an account with
  real reach, means the coin is riding somebody else's audience — which is exactly how `$Plumber`
  came off a `@polymarket` post. Cards show a **VAMP @handle 1.2M** chip for that case, and the
  analysis says so in words.
- **How old is the post.** fxtwitter returns `created_timestamp`, so every card can show a
  **POST 4m** chip. Being early to the post is the entire premise of a 200ms tracker; even on an
  HTTP poll, knowing a post is four minutes old rather than four days old changes the read.
- **Sort by it.** "Off a big account" ranks reach and freshness together, so the tweet-first lane
  is one dropdown away instead of buried in the heat ladder.

Still open, if a paid feed ever gets added: a watched-account lane (their actual product), and
matching a brand-new post to a mint before the mint has any market data at all.

## What this app does

- **Heat tabs** (hottest → coolest): **Trending** → **Today's meta** → **Hot** → **Warm** → **Fresh** → **Cooling**. Cards default-sort the same way. Heat is an analysis lane (momentum + X + flow), not just “on the trending feed”.
- **Today's meta** — reads **today's tape** (Gecko trending + 24h rips). The coin that went hardest *today* is the meta — not yesterday's leftover million-cap. Same-category names are listed beside it and searched on DexScreener. Example of the idea: if a computer-coin rips today, desk/keyboard names show up next to it.
- **Trending** — GeckoTerminal trending pools, sorted by heat
- **Hot / Warm** — cross-cut of every live bag: strongest reads, then coins that are only heating up
- **Buys 2m** — coins with the most buys in the last two minutes. DexScreener only prints a rolling 5-minute buy count; the 10s quote tick samples it and estimates the 2-minute window. Highest buy count at the top.
- **Fresh** — new pools and bonding coins (pump.fun HTTP + live PumpPortal creates, Bags, BNB / Four.meme, Robinhood, global Gecko). Filter by launchpad chip.
- **Cooling** — dumps and trap-shaped prints so you can skip late candles
- **Twitter radar** — hunts tweet-driven rips: Dex pair + website `x.com/status` links (also pulled on the 10s quote tick), pump handles, live Dex searches for status URLs, and CAs that are already ripping before the tweet is attached. Status IDs rank above a bare handle. Hunts are staggered; a Dex 429 cools Dex only, it does not stop the board.
- **Boosted** — tokens paying for visibility (attention, not quality)
- **KOL watch** — local list of X handles with live `from:handle` search
- **CA scanner** — paste a tweet, extract tickers / handles / Solana + EVM addresses, look them up
- **Watchlist** — saved in `localStorage`
- **Rug check** — on-demand scan (auto-runs in the CA scanner)
  - Solana: [RugCheck](https://rugcheck.xyz) mint/freeze/LP lock + [GoPlus](https://gopluslabs.io) holders
  - EVM: GoPlus honeypot, tax, mint, creator bag, unverified source
  - Local pair stats: thin liquidity and brand-new pools
- **Token data** — opening a coin auto-scans RugCheck/GoPlus: **top 10** (LP/curve stripped), **bundled look** (clone-sized holder bags — too bundled gets a red chip), **dev hold / DS**, **serial deploys**, insiders, mint/freeze, Pulse lane, unique 1h traders, turnover, ATH drawdown, X account age, and pump.fun **live viewers** (painted on the card, not only in the sidebar). True Jito sniper/bundle traces need a private block indexer; we flag the holder-tape version instead.
- **Tweet attraction** — launching coins with an X status link show **likes and total interactions** on the card (RTs + replies + quotes + bookmarks). You do not have to open Twitter. You can still paste an `x.com/.../status/ID` link in the CA scanner (`quiet` / `warming` / `hot` / `viral`)
- **Token hype** — each card gets a market-attraction badge from 24h volume, 1h pump, Dex boosts, turnover, and tweet likes
- **Post origin (J7-style)** — a **VAMP** chip when the attached post comes from an outside account rather than the coin's own, with that account's following, plus a **POST** chip for how old the post is. Both feed the analysis and the **Off a big account** sort.
- **Filters** — last hour, still bonding, has X, has likes; sort hot→warm→fresh / newest / hottest / most likes / looks like a runner / off a big account
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

The board analyzes each live coin once per update, skips no-op merges, and only paints the top 60 cards on a tab so the UI stays responsive while the sniffer keeps running. Market cap, price, and 1h change on those visible cards (plus the open coin and watchlist) refresh every 10 seconds from DexScreener pair quotes — and that same quote tick now attaches `x.com/status` links parked on Dex **websites** (the Plumber miss). Cards always paint from the merged live bag so a later Gecko reprint cannot wipe twitter or live viewers.

Dex hunts stay on a 4-query slice every poll, but they run **one after another** (~220ms apart) and pair-hydrate / boosts wait until those searches finish. Extra CA-search bursts were dropped because the quote tick plus `/tokens/v1` hydrate already cover known mints. A Dex **429** pauses further Dex calls (status bar: `Dex cooling Ns`) instead of punching a hole in the radar; pump.fun, Bags, and Gecko keep running. New pump.fun creates also arrive over [PumpPortal](https://pumpportal.fun/) WebSocket so Fresh is not stuck on the 6.5s HTTP poll.

Dev mode proxies DexScreener, GeckoTerminal, RugCheck, GoPlus, and tweet-embed metrics through Vite to avoid browser CORS issues.

Bags moved its launch feed behind an `x-api-key`. A 401 parks that feed for half an hour rather
than burning a request per cycle, and the status bar shows **Bags feed dark** so the gap is
visible instead of silent. Everything else on the board is unaffected.

## Disclaimer

Public market data only. A “safe” rug badge is a heuristic, not a guarantee. Not financial advice.
