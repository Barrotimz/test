"""Local craft desk. Run: python -m aion_desk.server"""

from __future__ import annotations

import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from aion_desk.market import MarketError, Upstream, build_board, build_craft, price_history
from aion_desk.score import FeeError

STATIC = Path(__file__).resolve().parent / "static"
UPSTREAM = Upstream()


def main() -> None:
    server = ThreadingHTTPServer(("0.0.0.0", 8787), Handler)
    print("Craft desk at http://127.0.0.1:8787")
    server.serve_forever()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self._api(parsed.path, parse_qs(parsed.query))
            return
        self._static(parsed.path)

    def log_message(self, fmt: str, *args) -> None:
        print(f"{self.address_string()} {fmt % args}")

    def _api(self, path: str, query: dict[str, list[str]]) -> None:
        try:
            if path == "/api/servers":
                self._json(200, _servers(UPSTREAM.get_json("/servers")))
                return
            if path == "/api/board":
                if _flag(query, "refresh"):
                    UPSTREAM.clear()
                self._json(200, build_board(UPSTREAM, _server(query), **_score_args(query)))
                return
            if path.startswith("/api/craft/"):
                target = _int_path(path, "/api/craft/")
                tier = _int(query, "tier", 3, 1, 6)
                self._json(
                    200,
                    build_craft(UPSTREAM, _server(query), target, tier, **_score_args(query)),
                )
                return
            if path.startswith("/api/prices/"):
                item = _int_path(path, "/api/prices/")
                hours = _int(query, "hours", 168, 1, 24 * 30)
                self._json(200, price_history(UPSTREAM, _server(query), item, hours))
                return
            self._json(404, {"detail": "unknown route"})
        except (FeeError, MarketError, ValueError) as exc:
            self._json(400, {"detail": str(exc)})

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _static(self, path: str) -> None:
        relative = "index.html" if path in ("", "/") else path.lstrip("/")
        file = (STATIC / relative).resolve()
        if not file.is_relative_to(STATIC) or not file.is_file():
            self.send_error(404)
            return
        data = file.read_bytes()
        mime = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)


def _servers(payload: dict) -> dict:
    regions: dict[str, list[dict]] = {}
    for server in payload.get("servers") or []:
        if not server.get("has_data"):
            continue
        region = server.get("region_name") or server.get("region") or "Other"
        regions.setdefault(region, []).append(
            {
                "server_id": server["server_id"],
                "name": server.get("name"),
                "region": server.get("region"),
                "region_name": region,
                "faction": server.get("faction"),
            }
        )
    order = ["North America East", "North America West", "Europe", "South America", "Asia"]
    grouped = []
    for name in order + sorted(set(regions) - set(order)):
        if name in regions:
            rows = sorted(regions[name], key=lambda row: (row["faction"] or "", row["name"] or ""))
            grouped.append({"region": name, "servers": rows})
    return {"default": payload.get("default") or 11304, "regions": grouped}


def _score_args(query: dict[str, list[str]]) -> dict:
    return {
        "sale_fee": _float(query, "sale_fee", 0.20, 0, 0.8),
        "list_fee": _float(query, "list_fee", 0.02, 0, 0.2),
        "min_listings": _int(query, "min_listings", 3, 0, 50),
        "min_sold": _int(query, "min_sold", 2, 0, 1000),
    }


def _server(query: dict[str, list[str]]) -> int:
    return _int(query, "server", 11304, 1, 999999)


def _flag(query: dict[str, list[str]], name: str) -> bool:
    raw = (query.get(name) or ["0"])[0]
    return raw in ("1", "true", "yes")


def _int_path(path: str, prefix: str) -> int:
    raw = path[len(prefix) :].strip("/")
    if not raw.isdigit():
        raise ValueError("item id must be a number")
    return int(raw)


def _int(query: dict[str, list[str]], name: str, default: int, low: int, high: int) -> int:
    raw = (query.get(name) or [None])[0]
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be a whole number") from exc
    if not low <= value <= high:
        raise ValueError(f"{name} must be between {low} and {high}")
    return value


def _float(query: dict[str, list[str]], name: str, default: float, low: float, high: float) -> float:
    raw = (query.get(name) or [None])[0]
    if raw is None or raw == "":
        return default
    try:
        value = float(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be a number") from exc
    if not low <= value <= high:
        raise ValueError(f"{name} must be between {low} and {high}")
    return value


if __name__ == "__main__":
    main()
