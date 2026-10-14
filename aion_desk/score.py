"""Turn a craft tier and its market into a fee-aware entry.

Costs come from Aion2Market's expected-value model (mastery 100). The
headline margin on that site is the cheapest ask minus that cost. This
module subtracts exchange fees and, when the ask sits above the recorded
sale average, uses the sale average as the exit.
"""

from __future__ import annotations

from typing import Any

TIER_LABELS = {1: "Splendent", 2: "Expert", 3: "Artisan"}


class FeeError(ValueError):
    pass


def keep_rate(sale_fee: float, list_fee: float) -> float:
    """Share of the sale price left after the sale fee and the listing fee."""
    if sale_fee < 0 or list_fee < 0:
        raise FeeError("fees cannot be negative")
    if sale_fee + list_fee >= 1:
        raise FeeError("fees leave nothing of the sale")
    return 1.0 - sale_fee - list_fee


def realistic_exit(ask: float | None, sold_avg: float | None) -> tuple[float | None, str | None]:
    """Exit price used for profit.

    The cheapest ask is what you can undercut today. When the 28-day average
    sale is lower, that average is the price the item has actually cleared.
    """
    if ask is None or ask <= 0:
        return None, None
    if sold_avg is None or sold_avg <= 0:
        return ask, "ask"
    if sold_avg < ask:
        return sold_avg, "sold_avg"
    return ask, "ask"


def attempts_for_one(steps: list[dict[str, Any]], stop_tier: int) -> list[float]:
    """Expected attempts of each step when the crafter stops at `stop_tier`.

    Steps are the chain in order. Step i (1-based) produces the input of the
    next step. The lucky result chance is success rate times combo chance.
    A failed attempt is modeled as returning nothing, matching Aion2Market.
    """
    if stop_tier < 1 or stop_tier > len(steps):
        raise ValueError(f"stop tier {stop_tier} is outside 1..{len(steps)}")
    chosen = steps[:stop_tier]
    attempts = [0.0] * stop_tier
    attempts[-1] = _attempts_to_make(1.0, chosen[-1])
    for index in range(stop_tier - 2, -1, -1):
        attempts[index] = _attempts_to_make(attempts[index + 1], chosen[index])
    return attempts


def _attempts_to_make(need: float, step: dict[str, Any]) -> float:
    chance = float(step["success_rate"]) * float(step["combo_probability"])
    if chance <= 0:
        raise ValueError("a step has no chance to produce its result")
    return need / chance


def scale_steps(steps: list[dict[str, Any]], stop_tier: int) -> list[dict[str, Any]]:
    """Material list for one finished piece of the chosen tier."""
    attempts = attempts_for_one(steps, stop_tier)
    scaled: list[dict[str, Any]] = []
    for step, tries in zip(steps[:stop_tier], attempts):
        chain_tries = float(step["attempts"]) or tries
        ratio = tries / chain_tries
        materials = []
        for material in step.get("materials") or []:
            unit = material.get("unit_price")
            listing = material.get("listing_price")
            expected = float(material["per_attempt"]) * tries
            subtotal = None if unit is None else expected * float(unit)
            cheaper = (
                material.get("method") not in (None, "buy")
                and unit is not None
                and listing is not None
                and float(unit) < float(listing)
            )
            materials.append(
                {
                    "material_key": material["material_key"],
                    "name": material.get("name"),
                    "per_attempt": material["per_attempt"],
                    "expected": expected,
                    "unit_price": unit,
                    "subtotal": subtotal,
                    "listing_price": listing,
                    "method": material.get("method"),
                    "via": material.get("via") or [],
                    "cheaper_than_listing": cheaper,
                }
            )
        step_cost = step.get("step_cost")
        scaled.append(
            {
                "step_no": step["step_no"],
                "recipe_id": step["recipe_id"],
                "mastery_level": step["mastery_level"],
                "success_rate": step["success_rate"],
                "combo_probability": step["combo_probability"],
                "attempts": tries,
                "result_key": step["result_key"],
                "result_name": step.get("result_name"),
                "step_cost": None if step_cost is None else float(step_cost) * ratio,
                "materials": materials,
            }
        )
    return scaled


def score_tier(
    *,
    cost: float | None,
    cost_market: float | None,
    ask: float | None,
    listings: int | None,
    units_sold: int | None,
    sold_avg: float | None,
    sale_fee: float,
    list_fee: float,
    min_listings: int,
    min_sold: int,
    missing: int = 0,
    carried: int = 0,
) -> dict[str, Any]:
    """Score one place to stop a craft chain."""
    keep = keep_rate(sale_fee, list_fee)
    exit_price, exit_basis = realistic_exit(ask, sold_avg)
    flags: list[str] = []
    if carried > 0:
        flags.append("stale_prices")
    if missing > 0:
        flags.append("incomplete_cost")
    if exit_basis == "sold_avg":
        flags.append("ask_above_sales")
    elif exit_basis == "ask" and sold_avg is not None and ask is not None and sold_avg > ask:
        flags.append("ask_below_sales")

    if missing > 0 or cost is None or cost <= 0 or exit_price is None:
        return {
            "ask": ask if ask and ask > 0 else None,
            "exit": None,
            "exit_basis": None,
            "headline_margin": None,
            "headline_roi": None,
            "net": None,
            "roi": None,
            "breakeven_ask": (cost / keep) if cost is not None and cost > 0 else None,
            "verdict": "incomplete" if missing > 0 else "unlisted",
            "confidence": "low",
            "flags": flags,
            "keep": keep,
        }

    assert cost is not None
    headline_margin = None if ask is None else ask - cost
    headline_roi = None if ask is None else (ask - cost) / cost
    net = exit_price * keep - cost
    roi = net / cost
    breakeven = cost / keep

    book = listings or 0
    sales = units_sold
    if book < min_listings:
        flags.append("thin_book")
    if sales is None:
        flags.append("unknown_sales")
    elif sales < min_sold:
        flags.append("no_sales")

    liquid = "thin_book" not in flags and "unknown_sales" not in flags and "no_sales" not in flags
    if net > 0 and liquid:
        verdict = "enter"
    elif net > 0:
        verdict = "watch"
    else:
        verdict = "skip"

    if verdict == "enter" and book >= 8 and (sales or 0) >= 15:
        confidence = "high"
    elif verdict == "enter" and book >= 5 and (sales or 0) >= 5:
        confidence = "medium"
    else:
        confidence = "low"

    input_savings = None
    if cost_market is not None:
        input_savings = cost_market - cost

    return {
        "ask": ask,
        "exit": exit_price,
        "exit_basis": exit_basis,
        "headline_margin": headline_margin,
        "headline_roi": headline_roi,
        "net": net,
        "roi": roi,
        "breakeven_ask": breakeven,
        "verdict": verdict,
        "confidence": confidence,
        "flags": flags,
        "keep": keep,
        "input_savings": input_savings,
    }


def tier_label(tier: int, name: str | None) -> str:
    return TIER_LABELS.get(tier) or (name or f"Tier {tier}")
