import unittest

from aion_desk.market import build_board, build_craft


class FakeUpstream:
    def __init__(self, routes):
        self.routes = routes

    def get_json(self, path):
        for prefix, payload in self.routes.items():
            if path.startswith(prefix):
                return payload
        raise AssertionError(path)


def fixture():
    crafts = {
        "server_id": 1,
        "faction": "Elyos",
        "race": "Light",
        "captured_at": "2026-10-14T22:07:55Z",
        "model": {"mastery": 100, "algorithm_version": 2},
        "targets": [
            {
                "target_key": 100,
                "name": "Artisan's Splendent Orichalcum Gloves",
                "category": "Armor",
                "skill": "Tailoring",
                "profile": "armor:gloves",
                "profile_label": "Orichalcum Gloves",
            }
        ],
    }
    detail = {
        "target_key": 100,
        "category": "Armor",
        "skill": "Tailoring",
        "race": "Light",
        "profile": "armor:gloves",
        "profile_label": "Orichalcum Gloves",
        "model": {"mastery": 100},
        "latest": {"missing": 0, "carried": 0},
        "tiers": [
            {
                "tier": 1,
                "item_key": 11,
                "name": "Splendent Orichalcum Gloves",
                "cost": 92676.12,
                "cost_market": 100000,
                "market_price": 280000,
            },
            {
                "tier": 3,
                "item_key": 13,
                "name": "Artisan's Splendent Orichalcum Gloves",
                "cost": 10105241.89,
                "cost_market": 10105241.89,
                "market_price": 11920000,
            },
        ],
        "steps": [
            {
                "step_no": 1,
                "recipe_id": 1,
                "mastery_level": 3,
                "success_rate": 0.93,
                "combo_probability": 0.25,
                "attempts": 4.3,
                "result_key": 11,
                "result_name": "Splendent Orichalcum Gloves",
                "step_cost": 92676.12,
                "materials": [
                    {
                        "material_key": 7,
                        "name": "Strong Leather",
                        "per_attempt": 4,
                        "expected": 17.2,
                        "unit_price": 500,
                        "subtotal": 8600,
                        "listing_price": 800,
                        "method": "craft",
                        "via": [{"name": "Raw Leather", "per_unit": 2, "unit_price": 200}],
                    }
                ],
            }
        ],
    }
    items = {
        "items": [
            {
                "item_key": 11,
                "listed": True,
                "price": 280000,
                "listings": 15,
                "units_sold": 33,
                "sold_avg_price": 410000,
                "sold_min_price": 200000,
                "sold_max_price": 500000,
                "change_pct": 1,
            },
            {
                "item_key": 13,
                "listed": True,
                "price": 11920000,
                "listings": 6,
                "units_sold": 3,
                "sold_avg_price": 17500000,
                "sold_min_price": 11000000,
                "sold_max_price": 18000000,
                "change_pct": -1,
            },
        ]
    }
    return FakeUpstream(
        {
            "/crafts?": crafts,
            "/crafts/100": detail,
            "/servers": {
                "servers": [
                    {
                        "server_id": 1,
                        "name": "Kaisinel",
                        "region": "EU",
                        "region_name": "Europe",
                        "faction": "Elyos",
                    }
                ]
            },
            "/quna": {
                "best": {"item_key": 9, "kina_per_quna": 2500, "thin": False},
                "chests": [{"item_key": 9, "name": "Kina Chest: 400,000 Kina"}],
            },
            "/items?": items,
        }
    )


class BoardTest(unittest.TestCase):
    def test_board_keeps_the_early_stop_and_drops_the_artisan(self):
        board = build_board(
            fixture(),
            1,
            sale_fee=0.20,
            list_fee=0.02,
            min_listings=3,
            min_sold=2,
        )
        self.assertEqual(board["server"]["name"], "Kaisinel")
        self.assertEqual(len(board["entries"]), 1)
        entry = board["entries"][0]
        self.assertEqual(entry["profile_label"], "Orichalcum Gloves")
        self.assertEqual(entry["short"], "Splendent")
        self.assertEqual(entry["verdict"], "enter")
        self.assertAlmostEqual(entry["net"], 280000 * 0.78 - 92676.12, places=2)
        artisan = board["families"][0]["tiers"][1]
        self.assertEqual(artisan["verdict"], "skip")
        self.assertGreater(artisan["headline_roi"], 0)

    def test_craft_sheet_scales_materials_to_one_piece(self):
        sheet = build_craft(
            fixture(),
            1,
            100,
            1,
            sale_fee=0.20,
            list_fee=0.02,
            min_listings=3,
            min_sold=2,
        )
        material = sheet["steps"][0]["materials"][0]
        self.assertTrue(material["cheaper_than_listing"])
        self.assertAlmostEqual(material["expected"], 4 / (0.93 * 0.25), places=4)
        self.assertEqual(sheet["focus"]["verdict"], "enter")


if __name__ == "__main__":
    unittest.main()
