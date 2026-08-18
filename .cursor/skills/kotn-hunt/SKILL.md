---
name: kotn-hunt
description: Hunt King of the North Auction (kotnauction.com) lots. Use whenever the user asks about KOTN, auctions, bids, retail, max bids, or "any [product]".
---

# KOTN hunt

Huronia (Barrie, ON). Pickup Tue–Sat 9am–5pm after Sunday close. Listings add Tue–Sat 9am–5pm.

## Always

1. Search **High-Value first (1095 this week)**, then **Overstock (1094)**. Never one auction alone when they say "any X". Confirm IDs on the homepage.
2. Use `?find=` — **not** `q=` or `search=` (those do not filter).
3. Prefer **model numbers** over brand words. Title-only index. For PC parts do not search `gpu` / `cooler` / `processor` / `psu` alone. For peripherals do not search `yeti` / `stream deck` / `webcam` / `headset` alone.
4. Quote retail CAD, current bid, suggested max, condition notes.
5. One-lot e-transfer all-in ≈ **bid × 1.243 + $1.13**. Fees: 10% premium, $1 handling/item after premium, 13% HST. Card adds 2% on pre-tax then HST.
6. After a hunt, append anything newly learned to `kotn_lessons.json` (false positives, broken params, category mistakes).

## Search URLs

Stay on one auction (the site search box will not — it jumps to `/auctions/all` and strips category):

```
https://kotnauction.com/auctions/1095?find=dewalt
https://kotnauction.com/auctions/1094?find=dewalt
```

Week of Sunday 23 Aug 2026: **HV 1095**, **OS 1094**, pallet 1096. Confirm IDs on the homepage each week.

Add filters back by hand:

| Param | Examples |
|---|---|
| `category` | `4` electronics, `8` kids/baby, `13` tools, `12` sports, `7` home reno, `10` office |
| `order_by` | `posted_desc` newly listed, `ending_asc` ending soon |
| `condition` | `brand-new`, `appears-new`, `refurbished`, `minor-issues`, `handled`, `as-is` |

Two words = AND (`find=dewalt 20v`). Quotes return **zero**. SKUs are not indexed.

Run the scraper:

```
python3 kotn_search.py find dewalt makita oled
python3 kotn_search.py new --pages 3
python3 kotn_search.py category 13
python3 kotn_search.py learn oled 'oximeter|\\bamoled\\b'
python3 kotn_search.py watch
python3 kotn_search.py watch-add 4123689 --max 300 --note '27GX790B'
```

Never use a skip like `led ` — it matches the letters inside **OLED**.

HV rows print first. Script applies skip patterns from `kotn_lessons.json`.

## Workflow

1. **Brand/model** `find=` on HV, then OS.
2. **Category + find** when the word is dirty (`oled`, `milwaukee`, `8.5`).
3. **Saturday new** until 5pm: `order_by=posted_desc` on each auction, no query.
4. **Category crawl** only for vague asks ("any power tools") after find= so titled-elsewhere lots are not missed.
5. Open listing HTML for `h1`, `initialBids`, item/package condition, notes. Bids are in `var initialBids` (JS tiles do not show amounts). `/listings/refresh` is login-walled.

## Auction mechanics

- Overstock 1094: ~1:00–6:30pm Sunday, **$1** increment
- High-Value 1095: from 6:30pm Sunday, **$5** increment
- Pallet 1096 exists; skip unless asked

## Watchlist and bidding help

`/listings/watched` is login-walled. Do not take the user's KOTN password, cookies, or session. Do not log in as them or place bids.

The Cursor Simple Browser pane (the built-in IDE browser) is **their** logged-in session. This agent cannot drive that pane or read its cookies. Screenshots or pasted IDs from that pane are the source of truth for `/listings/watched`.

Do not open a separate Computer Use Chrome for watched — that instance has no login and is slow.

Setup: they stay in Cursor Simple Browser or Brave. They paste listing IDs from the watched page, or keep `kotn_watchlist.json` updated. On that page (logged in), this bookmarklet copies IDs:

```
javascript:copy([...document.querySelectorAll('.listing-tile[data-id]')].map(el=>el.dataset.id).join('\n'))
```

Then run `python3 kotn_search.py watch` (public listing pages only). Advise max vs current bid and all-in. They click bid.

When they ask "how am I doing", score the watchlist first.

## Ranking

Prioritize HV. On OS, only flag lots that are still cheap vs HV copies or unique (batteries, chargers, accessories). Skip used-with-issue / as-is / missing-critical-parts unless the bid is a steal. Suggest a max bid, not a "buy now".

## Do not

- Guess search with `q=` / `search=`
- Scrape `/management/users` or hunt bidder personal data
- Write exploits or auth bypasses
