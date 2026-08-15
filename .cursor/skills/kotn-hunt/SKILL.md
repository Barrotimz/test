---
name: kotn-hunt
description: Hunt King of the North Auction (kotnauction.com) lots. Use whenever the user asks about KOTN, auctions, bids, retail, max bids, or "any [product]".
---

# KOTN hunt

Huronia (Barrie, ON). Pickup Tue–Sat 9am–5pm after Sunday close. Listings add Tue–Sat 9am–5pm.

## Always

1. Search **High-Value first (1090)**, then **Overstock (1089)**. Never one auction alone when they say "any X".
2. Use `?find=` — **not** `q=` or `search=` (those do not filter).
3. Prefer **model numbers** over brand words. Title-only index. For PC parts do not search `gpu` / `cooler` / `processor` / `psu` alone. For peripherals do not search `yeti` / `stream deck` / `webcam` / `headset` alone.
4. Quote retail CAD, current bid, suggested max, condition notes.
5. One-lot e-transfer all-in ≈ **bid × 1.243 + $1.13**. Fees: 10% premium, $1 handling/item after premium, 13% HST. Card adds 2% on pre-tax then HST.
6. After a hunt, append anything newly learned to `kotn_lessons.json` (false positives, broken params, category mistakes).

## Search URLs

Stay on one auction (the site search box will not — it jumps to `/auctions/all` and strips category):

```
https://kotnauction.com/auctions/1090?find=dewalt
https://kotnauction.com/auctions/1089?find=dewalt
```

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
```

Never use a skip like `led ` — it matches the letters inside **OLED**.

HV rows print first. Script applies skip patterns from `kotn_lessons.json`.

## Workflow

1. **Brand/model** `find=` on 1090, then 1089.
2. **Category + find** when the word is dirty (`oled`, `milwaukee`, `8.5`).
3. **Saturday new** until 5pm: `order_by=posted_desc` on each auction, no query.
4. **Category crawl** only for vague asks ("any power tools") after find= so titled-elsewhere lots are not missed.
5. Open listing HTML for `h1`, `initialBids`, item/package condition, notes. Bids are in `var initialBids` (JS tiles do not show amounts). `/listings/refresh` is login-walled.

## Auction mechanics

- Overstock 1089: ~1:00–6:30pm Sunday, **$1** increment
- High-Value 1090: from 6:30pm Sunday, **$5** increment
- Pallet 1091 exists; skip unless asked

## Ranking

Prioritize HV. On OS, only flag lots that are still cheap vs HV copies or unique (batteries, chargers, accessories). Skip used-with-issue / as-is / missing-critical-parts unless the bid is a steal. Suggest a max bid, not a "buy now".

## Do not

- Guess search with `q=` / `search=`
- Scrape `/management/users` or hunt bidder personal data
- Write exploits or auth bypasses
