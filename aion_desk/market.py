"""Assemble a craft board from the Aion2Market public API."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
from typing import Any, Callable

from aion_desk.score import scale_steps, score_tier, tier_label

API_ROOT = "https://aion2.exchange/api"
USER_AGENT = "AionCraftDesk/0.1 (personal crafting ledger; caches for 5 minutes)"


class MarketError(RuntimeError):
    pass


class Upstream:
    """Small cached reader for the public market API."""

    def __init__(self, root: str = API_ROOT, ttl_seconds: float = 300, opener: Callable[..., Any] | None = None):
        self.root = root.rstrip("/")
        self.ttl = ttl_seconds
        self._opener = opener or urllib.request.urlopen
        self._cache: dict[str, tuple[float, Any]] = {}
        self._lock = Lock()

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()

    def get_json(self, path: str) -> Any:
        if not path.startswith("/"):
            path = "/" + path
        now = time.time()
        with self._lock:
            hit = self._cache.get(path)
            if hit and hit[0] > now:
                return hit[1]
        payload = self._fetch(path)
        with self._lock:
            self._cache[path] = (time.time() + self.ttl, payload)
        return payload

    def _fetch(self, path: str) -> Any:
        request = urllib.request.Request(
            self.root + path,
            headers={"Accept": "application/json", "User-Agent": USER_AGENT},
        )
        try:
            with self._opener(request, timeout=25) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:300]
            raise MarketError(f"market API {exc.code} for {path}: {detail}") from exc
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise MarketError(f"market API unreachable for {path}: {exc}") from exc


def build_board(
    upstream: Upstream,
    server_id: int,
    *,
    sale_fee: float,
    list_fee: float,
    min_listings: int,
    min_sold: int,
) -> dict[str, Any]:
    crafts = upstream.get_json(f"/crafts?server={server_id}")
    servers = upstream.get_json("/servers")
    quna = upstream.get_json(f"/quna?server={server_id}")
    server = _server(servers, server_id)
    targets = crafts.get("targets") or []
    details = _details(upstream, server_id, [int(t["target_key"]) for t in targets])
    item_keys = []
    for detail in details.values():
        for tier in detail.get("tiers") or []:
            item_keys.append(int(tier["item_key"]))
    items = _items(upstream, server_id, item_keys)

    families = []
    for target in targets:
        key = int(target["target_key"])
        detail = details.get(key)
        if not detail or "tiers" not in detail:
            continue
        missing = int((detail.get("latest") or {}).get("missing") or 0)
        carried = int((detail.get("latest") or {}).get("carried") or 0)
        tiers = []
        for tier in detail["tiers"]:
            item = items.get(int(tier["item_key"]))
            tiers.append(
                _tier_row(
                    target,
                    tier,
                    item,
                    sale_fee=sale_fee,
                    list_fee=list_fee,
                    min_listings=min_listings,
                    min_sold=min_sold,
                    missing=missing,
                    carried=carried,
                )
            )
        families.append(
            {
                "target_key": key,
                "profile": target.get("profile"),
                "profile_label": piece_name(target.get("name")) or target.get("profile_label"),
                "category": target.get("category"),
                "skill": target.get("skill"),
                "race": crafts.get("race"),
                "tiers": tiers,
                "best": _best(tiers),
            }
        )

    families.sort(key=_family_sort)
    entries = [
        tier
        for family in families
        for tier in family["tiers"]
        if tier["verdict"] == "enter"
    ]
    entries.sort(key=lambda row: (-(row["roi"] or 0), -(row["net"] or 0)))

    best_chest = quna.get("best") if isinstance(quna, dict) else None
    chest = None
    if best_chest and best_chest.get("kina_per_quna"):
        named = next(
            (c for c in quna.get("chests") or [] if c.get("item_key") == best_chest.get("item_key")),
            None,
        )
        chest = {
            "kina_per_quna": best_chest["kina_per_quna"],
            "name": None if named is None else named.get("name"),
            "thin": bool(best_chest.get("thin")),
        }

    return {
        "server": server,
        "race": crafts.get("race"),
        "faction": crafts.get("faction"),
        "captured_at": crafts.get("captured_at"),
        "quna": chest,
        "fees": {"sale": sale_fee, "listing": list_fee, "keep": 1 - sale_fee - list_fee},
        "thresholds": {"min_listings": min_listings, "min_sold": min_sold},
        "model": {
            "mastery": (crafts.get("model") or {}).get("mastery"),
            "algorithm_version": (crafts.get("model") or {}).get("algorithm_version"),
        },
        "families": families,
        "entries": entries,
    }


def build_craft(
    upstream: Upstream,
    server_id: int,
    target_key: int,
    tier: int,
    *,
    sale_fee: float,
    list_fee: float,
    min_listings: int,
    min_sold: int,
) -> dict[str, Any]:
    detail = upstream.get_json(f"/crafts/{target_key}?server={server_id}")
    if "tiers" not in detail:
        raise MarketError(detail.get("detail") or "this item has no craft chain on that server")
    steps = scale_steps(detail.get("steps") or [], tier)
    chosen = next((row for row in detail["tiers"] if int(row["tier"]) == tier), None)
    if chosen is None:
        raise MarketError(f"tier {tier} is not on this recipe")
    keys = [int(row["item_key"]) for row in detail["tiers"]]
    items = _items(upstream, server_id, keys)
    missing = int((detail.get("latest") or {}).get("missing") or 0)
    carried = int((detail.get("latest") or {}).get("carried") or 0)
    target = {
        "target_key": target_key,
        "category": detail.get("category"),
        "skill": detail.get("skill"),
        "profile": detail.get("profile"),
        "profile_label": detail.get("profile_label"),
    }
    scored = [
        _tier_row(
            target,
            row,
            items.get(int(row["item_key"])),
            sale_fee=sale_fee,
            list_fee=list_fee,
            min_listings=min_listings,
            min_sold=min_sold,
            missing=missing,
            carried=carried,
        )
        for row in detail["tiers"]
    ]
    focus = next(row for row in scored if row["tier"] == tier)
    return {
        "focus": focus,
        "tiers": scored,
        "steps": steps,
        "race": detail.get("race"),
        "model": {
            "mastery": (detail.get("model") or {}).get("mastery"),
        },
    }


def price_history(upstream: Upstream, server_id: int, item_key: int, hours: int) -> dict[str, Any]:
    start = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - hours * 3600))
    payload = upstream.get_json(f"/items/{item_key}/prices?server={server_id}&from={start}")
    if "points" not in payload:
        return {"item_key": item_key, "points": [], "detail": payload.get("detail")}
    points = [
        {
            "ts": point["ts"],
            "close": point.get("close"),
            "listings": point.get("listings"),
        }
        for point in payload["points"]
        if point.get("close") is not None
    ]
    return {"item_key": item_key, "points": points}


def _details(upstream: Upstream, server_id: int, keys: list[int]) -> dict[int, dict[str, Any]]:
    found: dict[int, dict[str, Any]] = {}
    if not keys:
        return found

    def load(key: int) -> tuple[int, dict[str, Any]]:
        try:
            return key, upstream.get_json(f"/crafts/{key}?server={server_id}")
        except MarketError:
            return key, {}

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(load, key) for key in keys]
        for future in as_completed(futures):
            key, payload = future.result()
            found[key] = payload
    return found


def _items(upstream: Upstream, server_id: int, keys: list[int]) -> dict[int, dict[str, Any]]:
    unique = list(dict.fromkeys(keys))
    found: dict[int, dict[str, Any]] = {}
    for start in range(0, len(unique), 80):
        chunk = unique[start : start + 80]
        joined = ",".join(str(key) for key in chunk)
        payload = upstream.get_json(
            f"/items?server={server_id}&keys={joined}&limit={len(chunk)}&sort=key&order=asc"
        )
        for item in payload.get("items") or []:
            found[int(item["item_key"])] = item
    return found


def _server(payload: dict[str, Any], server_id: int) -> dict[str, Any]:
    for server in payload.get("servers") or []:
        if int(server["server_id"]) == server_id:
            return {
                "server_id": server_id,
                "name": server.get("name"),
                "region": server.get("region"),
                "region_name": server.get("region_name"),
                "faction": server.get("faction"),
            }
    return {"server_id": server_id, "name": str(server_id), "region": None, "region_name": None, "faction": None}


def _tier_row(
    target: dict[str, Any],
    tier: dict[str, Any],
    item: dict[str, Any] | None,
    *,
    sale_fee: float,
    list_fee: float,
    min_listings: int,
    min_sold: int,
    missing: int,
    carried: int,
) -> dict[str, Any]:
    listed = bool(item and item.get("listed") and item.get("price"))
    ask = float(item["price"]) if listed else None
    listings = int(item["listings"]) if item and item.get("listings") is not None else (0 if item else None)
    units_sold = None if item is None else item.get("units_sold")
    sold_avg = None if item is None else item.get("sold_avg_price")
    scored = score_tier(
        cost=_num(tier.get("cost")),
        cost_market=_num(tier.get("cost_market")),
        ask=ask,
        listings=listings,
        units_sold=None if units_sold is None else int(units_sold),
        sold_avg=_num(sold_avg),
        sale_fee=sale_fee,
        list_fee=list_fee,
        min_listings=min_listings,
        min_sold=min_sold,
        missing=missing,
        carried=carried,
    )
    name = tier.get("name")
    return {
        "tier": int(tier["tier"]),
        "item_key": int(tier["item_key"]),
        "target_key": int(target["target_key"]),
        "name": name,
        "short": tier_label(int(tier["tier"]), name),
        "category": target.get("category"),
        "skill": target.get("skill"),
        "profile": target.get("profile"),
        "profile_label": piece_name(target.get("name")) or piece_name(name) or target.get("profile_label"),
        "cost": _num(tier.get("cost")),
        "cost_market": _num(tier.get("cost_market")),
        "listings": listings,
        "units_sold": None if units_sold is None else int(units_sold),
        "sold_avg": _num(sold_avg),
        "sold_min": None if item is None else _num(item.get("sold_min_price")),
        "sold_max": None if item is None else _num(item.get("sold_max_price")),
        "change_pct": None if item is None else item.get("change_pct"),
        "input_savings": scored.get("input_savings"),
        **{key: value for key, value in scored.items() if key != "input_savings"},
    }


def _best(tiers: list[dict[str, Any]]) -> dict[str, Any] | None:
    ranked = [tier for tier in tiers if tier.get("roi") is not None]
    if not ranked:
        return None
    order = {"enter": 0, "watch": 1, "skip": 2, "incomplete": 3, "unlisted": 4}
    ranked.sort(key=lambda tier: (order.get(tier["verdict"], 9), -(tier["roi"] or 0)))
    winner = ranked[0]
    return {"tier": winner["tier"], "verdict": winner["verdict"], "roi": winner["roi"], "item_key": winner["item_key"]}


def _family_sort(family: dict[str, Any]) -> tuple:
    best = family.get("best") or {}
    order = {"enter": 0, "watch": 1, "skip": 2, "incomplete": 3, "unlisted": 4}
    return (
        order.get(best.get("verdict"), 9),
        -(best.get("roi") or -10),
        family.get("profile_label") or "",
    )


def piece_name(name: str | None) -> str | None:
    if not name:
        return None
    for prefix in ("Artisan's Splendent ", "Expert's Splendent ", "Splendent "):
        if name.startswith(prefix):
            return name[len(prefix) :]
    return name


def _num(value: Any) -> float | None:
    if value is None:
        return None
    return float(value)
