"""Recalcule la grille de marges de la figure 3 sans passer par le SQL d'analysis.py.

Les commandes sont relues depuis fct_orders et la règle est appliquée en Python : si
l'une des deux implémentations se trompe (filtre, seuil, arrondi), les grilles divergent.
"""
import json
import unittest
from collections import defaultdict
from pathlib import Path

import duckdb

ROOT = Path(__file__).parent
RESULTS = json.loads((ROOT / "site" / "data" / "results.json").read_text(encoding="utf-8"))
PAGE = (ROOT / "site" / "index.html").read_text(encoding="utf-8")


def load_orders():
    con = duckdb.connect(str(ROOT / "data" / "comptoir.duckdb"), read_only=True)
    return con.execute("""
        select purchased_at < '2018-01-01' as is_2017, seller_state, customer_state,
               promised_days, actual_days, is_late
        from marts.fct_orders
        where order_status = 'delivered' and delivered_at is not null and seller_state is not null
    """).fetchall()


class MarginGrid(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        orders = load_orders()
        per_route = defaultdict(lambda: [0, 0])
        for is_2017, seller, customer, _, _, late in orders:
            if is_2017:
                per_route[(seller, customer)][0] += 1
                per_route[(seller, customer)][1] += late
        cls.risky = {route for route, (n, late) in per_route.items() if n >= 30 and late / n > 0.08}
        cls.test = [o for o in orders if not o[0]]
        cls.grid = RESULTS["backtest"]["margins"]

    def recompute(self, margin):
        promises, late = [], 0
        for _, seller, customer, promised, actual, _ in self.test:
            promise = promised + (margin if (seller, customer) in self.risky else 0)
            promises.append(promise)
            late += actual > promise
        olist_late = round(sum(o[5] for o in self.test) / len(self.test), 4)
        new_late = round(late / len(self.test), 4)
        return round(sum(promises) / len(promises), 2), new_late, round(1 - new_late / olist_late, 4)

    def test_grid_covers_0_to_10_days(self):
        self.assertEqual([m["margin"] for m in self.grid], list(range(11)))

    def test_risky_routes_match(self):
        self.assertEqual(len(self.risky), RESULTS["backtest"]["risky_routes"]["routes"])

    def test_each_margin_matches_independent_computation(self):
        for entry in self.grid:
            with self.subTest(margin=entry["margin"]):
                promise, late_rate, avoided = self.recompute(entry["margin"])
                self.assertEqual(entry["new_promise"], promise)
                self.assertEqual(entry["new_late_rate"], late_rate)
                self.assertEqual(entry["late_avoided_share"], avoided)

    def test_zero_margin_is_olist(self):
        olist = RESULTS["backtest"]["policies"][1]
        self.assertEqual(self.grid[0]["new_promise"], olist["olist_promise"])
        self.assertEqual(self.grid[0]["late_avoided_share"], 0)

    def test_more_margin_never_adds_delays(self):
        shares = [m["late_avoided_share"] for m in self.grid]
        self.assertEqual(shares, sorted(shares))

    def test_five_days_is_the_rule_in_the_text(self):
        # La note cite 12 % de retards retirés et 25 trajets : la grille doit redonner ces valeurs.
        self.assertEqual(round(self.grid[5]["late_avoided_share"] * 100), 12)
        self.assertEqual(self.grid[5]["late_avoided_share"], RESULTS["derived"]["risky_plus5_late_avoided_share"])
        self.assertTrue('id="margin" type="range" min="0" max="10" step="1" value="5"' in PAGE,
                        "le curseur de la figure 3 doit partir de 5 jours, sur la grille 0-10")


if __name__ == "__main__":
    unittest.main()
