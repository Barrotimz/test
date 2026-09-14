# Pumptok

Not another TikTok clone. Pumptok is a **live tape for meme-coin traders**.

Every post is a **trade receipt** (entry MC, size, hold). If you open a **call**, it gets a clock and a ticking mark. Everyone else **rides or fades** it. Your rank is **hit rate and streak**, not follower count. Rugs go to the **R.I.P.** lane.

## Run it

```bash
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:5173`).

## What you can do

- Land on **Live** and ride or fade an open call
- Scroll the **Tape** of locked fills
- Watch people you follow, plus 24h stories
- Visit **R.I.P.** for rugs and missed calls
- Drop your own receipt or open a timed call from **+**
- Check ranks on **Explore** and profiles

This first version is client-only. State lives in `localStorage`. Live prices are a deterministic tape on each call, not a brokerage feed.
