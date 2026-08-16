#!/usr/bin/env python3
"""KOTN hunter: High-Value (1090) first, then Overstock (1089). Uses find=."""

from __future__ import annotations

import argparse
import html as htmllib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
HV, OS = 1090, 1089
ROOT = Path(__file__).resolve().parent
LESSONS_PATH = ROOT / "kotn_lessons.json"

TITLE_RE = re.compile(
    r'listing-tile-title-link"[^>]*>\s*([\s\S]*?)</a>', re.I
)
COND_RE = re.compile(r'listing-item-condition[^>]*>\s*([\s\S]*?)</div>', re.I)


def load_lessons() -> dict:
    if LESSONS_PATH.exists():
        return json.loads(LESSONS_PATH.read_text())
    return {}


def save_lessons(lessons: dict) -> None:
    lessons["updated"] = time.strftime("%Y-%m-%d")
    LESSONS_PATH.write_text(json.dumps(lessons, indent=2) + "\n")


def fetch(url: str, timeout: int = 25) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", "replace")


def clean(text: str) -> str:
    text = htmllib.unescape(re.sub(r"<[^>]+>", " ", text))
    return re.sub(r"\s+", " ", text).strip()


def parse_tiles(page_html: str) -> list[dict]:
    out = []
    seen = set()
    for m in re.finditer(
        r'<div class="listing-tile" data-id="(\d+)"[\s\S]{0,4000}?</div>\s*</div>\s*</div>',
        page_html,
    ):
        listing_id = int(m.group(1))
        if listing_id in seen:
            continue
        block = m.group(0)
        tm = TITLE_RE.search(block)
        cm = COND_RE.search(block)
        title = clean(tm.group(1)) if tm else ""
        if not title or title.lower() == "location:":
            continue
        seen.add(listing_id)
        out.append(
            {
                "id": listing_id,
                "title": title,
                "tile_condition": clean(cm.group(1)) if cm else "",
            }
        )
    return out


def auction_url(auction_id: int, **params) -> str:
    q = {k: v for k, v in params.items() if v not in (None, "", [])}
    qs = urllib.parse.urlencode(q, doseq=True)
    base = f"https://kotnauction.com/auctions/{auction_id}"
    return f"{base}?{qs}" if qs else base


def listing_pages(auction_id: int, pages: int, **params) -> list[dict]:
    items = []
    seen = set()
    empty = 0
    for page in range(1, pages + 1):
        url = auction_url(auction_id, page=page, **params)
        try:
            html = fetch(url)
        except Exception as exc:
            print(f"# fetch fail {url}: {exc}", file=sys.stderr)
            empty += 1
            if empty >= 2:
                break
            continue
        tiles = parse_tiles(html)
        new = [t for t in tiles if t["id"] not in seen]
        if not new:
            empty += 1
            if empty >= 2:
                break
            continue
        empty = 0
        for t in new:
            t["auction"] = "HV" if auction_id == HV else "OS"
            t["auction_id"] = auction_id
            seen.add(t["id"])
            items.append(t)
        time.sleep(0.08)
    return items


def listing_detail(listing_id: int) -> dict:
    html = fetch(f"https://kotnauction.com/listings/{listing_id}")
    title_m = re.search(r"<h1>(.*?)</h1>", html, re.S)
    cond_m = re.search(r'Item condition:</span>\s*<span class="value">([^<]+)', html)
    pkg_m = re.search(r'Package condition:</span>\s*<span class="value">([^<]+)', html)
    notes = [clean(p) for p in re.findall(r'<p class="value pre[^"]*">(.*?)</p>', html, re.S)]
    bids = []
    bm = re.search(r"var initialBids = (\[.*?\]);", html, re.S)
    if bm:
        try:
            bids = json.loads(bm.group(1))
        except json.JSONDecodeError:
            bids = []
    lm = re.search(r"var listing = ({.*?});", html, re.S)
    increment = None
    if lm:
        try:
            listing = json.loads(lm.group(1))
            increment = listing.get("bid_increment")
        except json.JSONDecodeError:
            pass
    high = bids[0]["bid"] if bids else 0
    bidder = bids[0]["bidder"] if bids else None
    auction = "OS" if increment == 1 else "HV"
    return {
        "title": clean(title_m.group(1)) if title_m else "",
        "cond": clean(cond_m.group(1)) if cond_m else "",
        "pkg": clean(pkg_m.group(1)) if pkg_m else "",
        "notes": " | ".join(n for n in notes if n)[:500],
        "bid": high,
        "bidder": bidder,
        "nbids": len(bids),
        "increment": increment,
        "auction": auction,
        "url": f"https://kotnauction.com/listings/{listing_id}",
    }


def skip_reason(title: str, query: str | None, lessons: dict) -> str | None:
    junk = lessons.get("junk_title_re")
    if junk and re.search(junk, title, re.I):
        return "junk_title"
    q = (query or "").lower()
    for rule in lessons.get("false_positives") or []:
        rule_q = (rule.get("query") or "").lower()
        # Per-query skips only apply to that find=. Never on new/category crawls.
        if rule_q and rule_q not in q:
            continue
        if not rule_q and not q:
            continue
        pat = rule.get("skip_title_re")
        if pat and re.search(pat, title, re.I):
            return f"fp:{rule.get('query') or 'global'}"
    return None


def hunt_find(queries: list[str], pages: int, lessons: dict) -> list[dict]:
    rows = []
    seen = set()
    for query in queries:
        for auction_id in (HV, OS):
            items = listing_pages(auction_id, pages, find=query)
            for item in items:
                if item["id"] in seen:
                    continue
                why = skip_reason(item["title"], query, lessons)
                item["query"] = query
                item["skipped"] = why
                seen.add(item["id"])
                rows.append(item)
    return rows


def hunt_new(pages: int, category: str | None, lessons: dict) -> list[dict]:
    rows = []
    seen = set()
    params = {"order_by": "posted_desc"}
    if category:
        params["category"] = category
    for auction_id in (HV, OS):
        items = listing_pages(auction_id, pages, **params)
        for item in items:
            if item["id"] in seen:
                continue
            item["query"] = "posted_desc"
            item["skipped"] = skip_reason(item["title"], None, lessons)
            seen.add(item["id"])
            rows.append(item)
    return rows


def hunt_category(category: str, pages: int, lessons: dict) -> list[dict]:
    rows = []
    seen = set()
    for auction_id in (HV, OS):
        items = listing_pages(auction_id, pages, category=category)
        for item in items:
            if item["id"] in seen:
                continue
            item["query"] = f"category={category}"
            item["skipped"] = skip_reason(item["title"], None, lessons)
            seen.add(item["id"])
            rows.append(item)
    return rows


def enrich(rows: list[dict], limit: int) -> list[dict]:
    keep = [r for r in rows if not r.get("skipped")][:limit]
    out = []
    for i, row in enumerate(keep):
        try:
            detail = listing_detail(row["id"])
        except Exception as exc:
            print(f"# detail fail {row['id']}: {exc}", file=sys.stderr)
            continue
        merged = {**row, **detail}
        out.append(merged)
        time.sleep(0.05)
        print(
            f"{merged['auction']}\t{merged['id']}\t${merged['bid']:>4}  "
            f"{(merged.get('bidder') or '-'):12}  {merged['title'][:72]}",
            flush=True,
        )
    return out


def print_table(rows: list[dict]) -> None:
    if not rows:
        print("No kept lots.")
        return
    print("\n| Auction | ID | Bid | Bidder | Condition | Title |")
    print("|---|---|---|---|---|---|")
    for r in rows:
        title = r.get("title", "").replace("|", "/")[:90]
        print(
            f"| {r.get('auction','')} | [{r['id']}]({r.get('url','')}) | "
            f"${r.get('bid',0)} | {r.get('bidder') or '-'} | "
            f"{(r.get('cond') or r.get('tile_condition') or '')[:28]} | {title} |"
        )


WATCHLIST_PATH = ROOT / "kotn_watchlist.json"


def load_watchlist() -> dict:
    if WATCHLIST_PATH.exists():
        return json.loads(WATCHLIST_PATH.read_text())
    return {"notes": [], "lots": []}


def save_watchlist(data: dict) -> None:
    WATCHLIST_PATH.write_text(json.dumps(data, indent=2) + "\n")


def all_in(bid: float) -> float:
    return round(bid * 1.243 + 1.13, 2)


def hunt_watch(ids: list[int], watch_meta: dict[int, dict]) -> list[dict]:
    rows = []
    for listing_id in ids:
        meta = watch_meta.get(listing_id) or {}
        try:
            detail = listing_detail(listing_id)
        except Exception as exc:
            print(f"# detail fail {listing_id}: {exc}", file=sys.stderr)
            continue
        max_bid = meta.get("max")
        bid = detail.get("bid") or 0
        room = None if max_bid is None else max_bid - bid
        status = "ok"
        if max_bid is not None:
            if bid >= max_bid:
                status = "over_max"
            elif bid >= max_bid * 0.8:
                status = "near_max"
        merged = {
            **detail,
            "id": listing_id,
            "max": max_bid,
            "room": room,
            "all_in_bid": all_in(bid) if bid else 0,
            "all_in_max": all_in(max_bid) if max_bid else None,
            "status": status,
            "watch_note": meta.get("note") or "",
            "query": "watch",
        }
        rows.append(merged)
        time.sleep(0.05)
        max_s = f"max ${max_bid}" if max_bid is not None else "max -"
        print(
            f"{merged['auction']}\t{listing_id}\t${bid:>4}  "
            f"{(merged.get('bidder') or '-'):12}  {max_s:10}  "
            f"{status:8}  {merged['title'][:56]}",
            flush=True,
        )
    rows.sort(key=lambda r: (0 if r.get("auction") == "HV" else 1, r.get("id", 0)))
    return rows


def print_watch_table(rows: list[dict]) -> None:
    if not rows:
        print("No watch lots.")
        return
    print("\n| Auction | ID | Bid | Bidder | Max | Room | All-in@bid | Status | Title |")
    print("|---|---|---|---|---|---|---|---|---|")
    for r in rows:
        title = r.get("title", "").replace("|", "/")[:70]
        max_bid = r.get("max")
        room = r.get("room")
        print(
            f"| {r.get('auction','')} | [{r['id']}]({r.get('url','')}) | "
            f"${r.get('bid',0)} | {r.get('bidder') or '-'} | "
            f"{'$'+str(max_bid) if max_bid is not None else '-'} | "
            f"{'$'+str(room) if room is not None else '-'} | "
            f"${r.get('all_in_bid',0)} | {r.get('status','')} | {title} |"
        )


def learn_skip(query: str, pattern: str, lessons: dict) -> None:
    fps = lessons.setdefault("false_positives", [])
    fps.append({"query": query, "skip_title_re": pattern})
    save_lessons(lessons)
    print(f"learned: {query} skip /{pattern}/")


def main() -> int:
    lessons = load_lessons()
    p = argparse.ArgumentParser(description="KOTN search: HV first, then OS, find=")
    sub = p.add_subparsers(dest="cmd", required=True)

    f = sub.add_parser("find", help="Title search via find= on HV then OS")
    f.add_argument("queries", nargs="+")
    f.add_argument("--pages", type=int, default=4)
    f.add_argument("--details", type=int, default=40)

    n = sub.add_parser("new", help="Newly listed (posted_desc), HV then OS")
    n.add_argument("--pages", type=int, default=3)
    n.add_argument("--category", default=None)
    n.add_argument("--details", type=int, default=30)

    c = sub.add_parser("category", help="Category crawl, HV then OS")
    c.add_argument("category")
    c.add_argument("--pages", type=int, default=8)
    c.add_argument("--details", type=int, default=0)

    l = sub.add_parser("learn", help="Append a false-positive skip regex")
    l.add_argument("query")
    l.add_argument("pattern")

    w = sub.add_parser("watch", help="Score public lots from kotn_watchlist.json or IDs")
    w.add_argument("ids", nargs="*", type=int, help="Optional listing IDs; default is the watchlist file")

    wa = sub.add_parser("watch-add", help="Append a listing ID to kotn_watchlist.json")
    wa.add_argument("listing_id", type=int)
    wa.add_argument("--max", type=int, default=None)
    wa.add_argument("--note", default="")

    args = p.parse_args()
    if args.cmd == "learn":
        learn_skip(args.query, args.pattern, lessons)
        return 0
    if args.cmd == "watch-add":
        data = load_watchlist()
        lots = data.setdefault("lots", [])
        for lot in lots:
            if lot.get("id") == args.listing_id:
                if args.max is not None:
                    lot["max"] = args.max
                if args.note:
                    lot["note"] = args.note
                save_watchlist(data)
                print(f"updated watch {args.listing_id} max={lot.get('max')} {lot.get('note','')}")
                return 0
        lots.append({"id": args.listing_id, "max": args.max, "note": args.note})
        save_watchlist(data)
        print(f"added watch {args.listing_id} max={args.max} {args.note}")
        return 0
    if args.cmd == "watch":
        data = load_watchlist()
        meta = {int(lot["id"]): lot for lot in data.get("lots") or [] if lot.get("id")}
        ids = args.ids or [int(lot["id"]) for lot in data.get("lots") or [] if lot.get("id")]
        if not ids:
            print("Watchlist empty. Add IDs to kotn_watchlist.json or: kotn_search.py watch-add ID --max 150")
            return 1
        kept = hunt_watch(ids, meta)
        out_path = ROOT / "kotn_last_search.json"
        out_path.write_text(json.dumps(kept, indent=2) + "\n")
        print_watch_table(kept)
        print(f"\nWrote {out_path} ({len(kept)} lots).", file=sys.stderr)
        return 0

    if args.cmd == "find":
        rows = hunt_find(args.queries, args.pages, lessons)
        details_n = args.details
    elif args.cmd == "new":
        rows = hunt_new(args.pages, args.category, lessons)
        details_n = args.details
    else:
        rows = hunt_category(args.category, args.pages, lessons)
        details_n = args.details

    skipped = [r for r in rows if r.get("skipped")]
    kept = [r for r in rows if not r.get("skipped")]
    hv = sum(1 for r in kept if r.get("auction") == "HV")
    os_ = sum(1 for r in kept if r.get("auction") == "OS")
    print(
        f"# kept {len(kept)} (HV {hv} / OS {os_})  skipped {len(skipped)}  "
        f"raw {len(rows)}",
        file=sys.stderr,
    )
    for r in skipped[:12]:
        print(f"# skip {r['id']} [{r.get('skipped')}] {r['title'][:80]}", file=sys.stderr)

    if details_n:
        kept = enrich(kept, details_n)
    else:
        for r in kept[:40]:
            print(f"{r.get('auction')}\t{r['id']}\t{r['title'][:80]}")

    out_path = ROOT / "kotn_last_search.json"
    out_path.write_text(json.dumps(kept, indent=2) + "\n")
    print_table(kept)
    print(f"\nWrote {out_path} ({len(kept)} lots). HV listed first.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
