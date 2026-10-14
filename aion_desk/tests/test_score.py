import unittest

from aion_desk.score import attempts_for_one, keep_rate, realistic_exit, scale_steps, score_tier


FEES = dict(sale_fee=0.20, list_fee=0.02, min_listings=3, min_sold=2)


class KeepRateTest(unittest.TestCase):
    def test_world_exchange_keeps_78_percent(self):
        self.assertAlmostEqual(keep_rate(0.20, 0.02), 0.78)

    def test_rejects_fees_that_consume_the_sale(self):
        with self.assertRaises(ValueError):
            keep_rate(0.9, 0.2)


class ExitTest(unittest.TestCase):
    def test_uses_the_sale_average_when_the_ask_is_higher(self):
        price, basis = realistic_exit(45_000_000, 18_499_999.5)
        self.assertEqual(price, 18_499_999.5)
        self.assertEqual(basis, "sold_avg")

    def test_uses_the_ask_when_recent_sales_cleared_higher(self):
        price, basis = realistic_exit(280_000, 410_000)
        self.assertEqual(price, 280_000)
        self.assertEqual(basis, "ask")

    def test_ignores_a_zero_average(self):
        price, basis = realistic_exit(100, 0)
        self.assertEqual(price, 100)
        self.assertEqual(basis, "ask")


class ScoreTest(unittest.TestCase):
    def test_splendent_gloves_are_an_entry(self):
        # Kaisinel snapshot, 14 Oct 2026. Cost and sales from Aion2Market.
        scored = score_tier(
            cost=92676.1168363286,
            cost_market=120000,
            ask=280000,
            listings=15,
            units_sold=33,
            sold_avg=410000,
            **FEES,
        )
        self.assertEqual(scored["verdict"], "enter")
        self.assertEqual(scored["confidence"], "high")
        self.assertAlmostEqual(scored["net"], 125723.8831636714, places=2)
        self.assertGreater(scored["roi"], 1.3)
        self.assertIn("ask_below_sales", scored["flags"])

    def test_artisan_greaves_ask_is_not_the_exit(self):
        scored = score_tier(
            cost=10_977_880,
            cost_market=10_977_880,
            ask=45_000_000,
            listings=1,
            units_sold=2,
            sold_avg=18_499_999.5,
            **FEES,
        )
        self.assertEqual(scored["exit_basis"], "sold_avg")
        self.assertAlmostEqual(scored["net"], 3_452_119.61, delta=1)
        self.assertEqual(scored["verdict"], "watch")
        self.assertIn("thin_book", scored["flags"])

    def test_headline_profit_can_be_a_loss_after_fees(self):
        # Artisan gloves: ask above cost, proceeds after 22% below cost.
        scored = score_tier(
            cost=10_105_241.888,
            cost_market=10_105_241.888,
            ask=11_920_000,
            listings=6,
            units_sold=3,
            sold_avg=17_500_000,
            **FEES,
        )
        self.assertGreater(scored["headline_roi"], 0)
        self.assertLess(scored["net"], 0)
        self.assertEqual(scored["verdict"], "skip")

    def test_missing_material_price_is_not_an_entry(self):
        scored = score_tier(
            cost=1000,
            cost_market=1000,
            ask=5000,
            listings=10,
            units_sold=40,
            sold_avg=5000,
            missing=2,
            **FEES,
        )
        self.assertEqual(scored["verdict"], "incomplete")
        self.assertIn("incomplete_cost", scored["flags"])

    def test_unlisted_item_has_no_exit(self):
        scored = score_tier(
            cost=1000,
            cost_market=1000,
            ask=None,
            listings=0,
            units_sold=0,
            sold_avg=None,
            **FEES,
        )
        self.assertEqual(scored["verdict"], "unlisted")
        self.assertIsNone(scored["net"])


class AttemptsTest(unittest.TestCase):
    def test_one_splendent_uses_the_first_step_only(self):
        steps = [
            {"success_rate": 0.93121326, "combo_probability": 0.25, "attempts": 74.9965811237252},
            {"success_rate": 0.9463, "combo_probability": 0.25, "attempts": 17.4594526992697},
            {"success_rate": 0.9684, "combo_probability": 0.25, "attempts": 4.1306422598306},
        ]
        attempts = attempts_for_one(steps, 1)
        self.assertEqual(len(attempts), 1)
        self.assertAlmostEqual(attempts[0], 1 / (0.93121326 * 0.25), places=6)

    def test_scaled_step_cost_matches_the_tier_cost(self):
        # Breastplate step 1, scaled off the artisan chain, equals the tier-1 cost.
        steps = [
            {
                "step_no": 1,
                "recipe_id": 412016001,
                "mastery_level": 3,
                "success_rate": 0.93121326,
                "combo_probability": 0.25,
                "attempts": 74.9965811237252,
                "result_key": 210150014,
                "result_name": "Splendent Orichalcum Breastplate",
                "step_cost": 2797643.5466813133,
                "materials": [
                    {
                        "material_key": 1,
                        "name": "Refining Stone",
                        "per_attempt": 3,
                        "expected": 224.99,
                        "unit_price": 2149.0,
                        "subtotal": 483503.0,
                        "listing_price": 2149.0,
                        "method": "buy",
                        "via": [],
                    }
                ],
            }
        ]
        scaled = scale_steps(steps, 1)
        self.assertAlmostEqual(scaled[0]["step_cost"], 160236.6119, delta=0.01)
        self.assertAlmostEqual(scaled[0]["materials"][0]["expected"], 3 * scaled[0]["attempts"], places=6)


if __name__ == "__main__":
    unittest.main()
