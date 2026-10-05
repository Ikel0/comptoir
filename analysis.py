"""Calcule tous les chiffres de l'étude depuis les marts dbt et les écrit dans site/data/results.json.

L'étude et le dashboard lisent ce fichier : aucun chiffre n'est recopié à la main.
"""
import json
import math
from datetime import date
from pathlib import Path

import duckdb

ROOT = Path(__file__).parent
OUT = ROOT / "site" / "data" / "results.json"
# Date de publication de la note, fixe. generated_on est la date du dernier calcul qui a
# changé un chiffre ; la page n'affiche « mise à jour le … » que si les deux diffèrent.
PUBLISHED_ON = "2026-10-04"
con = duckdb.connect(str(ROOT / "data" / "comptoir.duckdb"), read_only=True)


def rows(sql: str) -> list[dict]:
    cur = con.execute(sql)
    names = [d[0] for d in cur.description]
    return [dict(zip(names, r)) for r in cur.fetchall()]


def one(sql: str) -> dict:
    return rows(sql)[0]


DELIVERED = """
    from marts.fct_orders
    where order_status = 'delivered' and delivered_at is not null
"""
BUCKET = """case when actual_days <= 7 then '0-7' when actual_days <= 14 then '8-14'
    when actual_days <= 21 then '15-21' when actual_days <= 30 then '22-30' else '31+' end"""

con.execute(f"create temp table d as select *, {BUCKET} as bucket {DELIVERED}")

results = {}

results["scope"] = one("""
    select (select count(*) from marts.fct_orders) as orders,
           count(*) as delivered,
           min(purchased_at)::date as first_purchase,
           max(purchased_at)::date as last_purchase,
           count(*) filter (where review_score is not null) as reviewed,
           count(*) filter (where has_review_text) as reviewed_with_text
    from d
""")

# 1. Promesse et réalité, mois par mois (mois complets uniquement).
results["monthly"] = rows("""
    select strftime(date_trunc('month', purchased_at), '%Y-%m') as month,
           count(*) as orders,
           round(avg(promised_days), 1) as promised_days,
           round(avg(actual_days), 1) as actual_days,
           round(avg(is_late::int), 4) as late_rate,
           round(avg(review_score), 2) as avg_review
    from d
    where purchased_at >= '2017-01-01' and purchased_at < '2018-09-01'
    group by 1 order by 1
""")

# 2. À délai réel égal, le mauvais avis dépend-il du retard sur la promesse ?
results["delay_vs_promise"] = rows("""
    select bucket, is_late, count(*) as orders, round(avg((review_score <= 2)::int), 4) as bad_rate
    from d where review_score is not null
    group by 1, 2
    order by min(actual_days), is_late
""")

results["bad_reviews"] = one("""
    select count(*) filter (where review_score <= 2) as bad,
           count(*) filter (where review_score <= 2 and is_late) as bad_late,
           count(*) filter (where review_score <= 2 and reviewed_before_delivery) as bad_before_delivery,
           count(*) filter (where reviewed_before_delivery) as reviewed_before_delivery,
           round(avg(is_late::int) filter (where reviewed_before_delivery), 4) as late_rate_before_delivery,
           round(avg(review_score) filter (where reviewed_before_delivery), 2) as avg_score_before_delivery,
           round(avg(review_score) filter (where not reviewed_before_delivery), 2) as avg_score_after_delivery
    from d where review_score is not null
""")

# 3. Qui cause le retard : remise tardive du vendeur ou transport ?
con.execute("""
    create temp table handover as
    select d.order_id, d.is_late, so.shipped_at > li.limit_at as seller_late,
           date_diff('day', d.purchased_at::date, so.shipped_at::date) as seller_days,
           date_diff('day', so.shipped_at::date, d.delivered_at::date) as carrier_days
    from d
    join staging.stg_orders so using (order_id)
    join (select order_id, max(shipping_limit_at) as limit_at from staging.stg_order_items group by 1) li using (order_id)
    where so.shipped_at is not null and so.shipped_at >= d.purchased_at and d.delivered_at >= so.shipped_at
""")
results["handover"] = one("""
    select count(*) as orders,
           count(*) filter (where seller_late) as seller_late_orders,
           round(avg(is_late::int) filter (where seller_late), 4) as late_rate_if_seller_late,
           round(avg(is_late::int) filter (where not seller_late), 4) as late_rate_if_seller_on_time,
           count(*) filter (where is_late) as late_orders,
           count(*) filter (where is_late and not seller_late) as late_with_seller_on_time,
           round(avg(seller_days) filter (where is_late), 1) as seller_days_late,
           round(avg(carrier_days) filter (where is_late), 1) as carrier_days_late,
           round(avg(seller_days) filter (where not is_late), 1) as seller_days_on_time,
           round(avg(carrier_days) filter (where not is_late), 1) as carrier_days_on_time
    from handover
""")

# 4. Vendeurs : retard observé contre retard attendu vu leurs trajets.
con.execute("""
    create temp table order_sellers as
    select distinct i.order_id, i.seller_id, s.state as seller_state, d.customer_state, d.is_late, d.review_score
    from staging.stg_order_items i
    join d on d.order_id = i.order_id
    join staging.stg_sellers s on s.seller_id = i.seller_id
""")
con.execute("""
    create temp table seller_excess as
    with route as (select seller_state, customer_state, avg(is_late::int) as r from order_sellers group by all)
    select seller_id, count(*) as orders, sum(is_late::int) as late, sum(r) as expected
    from order_sellers join route using (seller_state, customer_state)
    group by seller_id
""")
results["sellers"] = one("""
    with v as (
        select *, sum(late) over (order by late desc, seller_id rows unbounded preceding) as cum_late,
               sum(orders) over (order by late desc, seller_id rows unbounded preceding) as cum_orders,
               row_number() over (order by late desc, seller_id) as rank
        from seller_excess
    ), tot as (select sum(late) as late, sum(orders) as orders, count(*) as sellers from seller_excess)
    select tot.sellers, tot.late as late_orders,
           min(rank) filter (where cum_late >= 0.5 * tot.late) as sellers_for_half_late,
           round(min(cum_orders) filter (where cum_late >= 0.5 * tot.late) / tot.orders, 4) as order_share_of_those,
           (select count(*) from seller_excess where orders >= 30 and late > 1.5 * expected and late - expected >= 5) as excess_sellers,
           (select round(sum(late - expected)) from seller_excess where orders >= 30 and late > 1.5 * expected and late - expected >= 5) as excess_late
    from v, tot group by tot.sellers, tot.late, tot.orders
""")

# 5. Trajets : la promesse est-elle mal calibrée quelque part ?
results["routes"] = rows("""
    select seller_state || ' → ' || customer_state as route, orders,
           median_promised_days as promised, median_actual_days as actual,
           round(p90_actual_days, 0) as p90_actual, round(late_rate, 4) as late_rate,
           round(bad_review_rate, 4) as bad_rate
    from marts.mart_delivery_promise
    order by orders desc, route
""")


# 6. Backtest des règles de promesse : calibrées sur 2017, évaluées sur 2018.
#    L'effet sur les avis suppose que le taux de mauvais avis d'une commande dépend de
#    sa tranche de délai réel et du respect de la promesse, mesuré sur 2017.
con.execute("""
    create temp table bad_rate_2017 as
    select bucket, is_late, avg((review_score <= 2)::int) as r
    from d where review_score is not null and purchased_at < '2018-01-01' group by all
""")
con.execute("create temp table test as select * from d where purchased_at >= '2018-01-01' and seller_state is not null")


con.execute("""
    create temp table route_2017 as
    select seller_state, customer_state, count(*) as n, avg(is_late::int) as late_rate,
           quantile_cont(actual_days, 0.93) as q93
    from d where purchased_at < '2018-01-01' and seller_state is not null group by all
""")
global_q93 = con.execute("select quantile_cont(actual_days, 0.93) from d where purchased_at < '2018-01-01'").fetchone()[0]


def evaluate(policy: str, new_promise_sql: str) -> dict:
    r = one(f"""
        with t as (
            select test.*, {new_promise_sql} as new_promise
            from test left join route_2017 using (seller_state, customer_state)
        ),
        s as (select *, actual_days > new_promise as new_late from t)
        select count(*) as orders,
               round(avg(promised_days), 2) as olist_promise, round(avg(new_promise), 2) as new_promise,
               round(avg(s.is_late::int), 4) as olist_late_rate, round(avg(new_late::int), 4) as new_late_rate,
               round(sum(b1.r)) as olist_bad_reviews, round(sum(b2.r)) as new_bad_reviews
        from s
        left join bad_rate_2017 b1 on b1.bucket = s.bucket and b1.is_late = s.is_late and s.review_score is not null
        left join bad_rate_2017 b2 on b2.bucket = s.bucket and b2.is_late = s.new_late and s.review_score is not null
    """)
    r["policy"] = policy
    return r


RISKY = "n >= 30 and late_rate > 0.08"


def plus_margin(days: int) -> str:
    return f"promised_days + case when {RISKY} then {days} else 0 end"


results["backtest"] = {
    "risky_routes": one(f"select count(*) as routes, sum(n) as orders_2017 from route_2017 where {RISKY}"),
    "policies": [
        evaluate("route_q93", f"ceil(case when n >= 30 then q93 else {global_q93} end)"),
        evaluate("risky_routes_plus_5", plus_margin(5)),
    ],
}

# Grille lue par la figure 3 : la même règle avec une marge de 0 à 10 jours. La page ne
# propose que ces valeurs ; elle n'interpole rien.
margins = []
for days in range(11):
    r = evaluate(f"risky_routes_plus_{days}", plus_margin(days))
    margins.append({
        "margin": days,
        "new_promise": r["new_promise"],
        "extra_days": round(r["new_promise"] - r["olist_promise"], 2),
        "new_late_rate": r["new_late_rate"],
        "late_avoided_share": round(1 - r["new_late_rate"] / r["olist_late_rate"], 4),
        "new_bad_reviews": r["new_bad_reviews"],
    })
results["backtest"]["margins"] = margins

# Date « glissante » : quantile 93 % des délais des commandes livrées dans les 14 jours
# précédant l'achat (par État client si au moins 50 livraisons, sinon global). Seules les
# livraisons déjà faites au moment de l'achat sont utilisées.
con.execute("create temp table days as select range::date as day from range(date '2018-01-01', date '2018-08-30', interval 1 day)")
con.execute("""
    create temp table rolling_state as
    select day, customer_state, quantile_cont(actual_days, 0.93) as q, count(*) as n
    from days join d on d.delivered_at::date < day and d.delivered_at::date >= day - 14 group by all
""")
con.execute("""
    create temp table rolling_all as
    select day, quantile_cont(actual_days, 0.93) as q
    from days join d on d.delivered_at::date < day and d.delivered_at::date >= day - 14 group by all
""")
roll = one("""
    with t as (
        select test.*, ceil(case when s.n >= 50 then s.q else a.q end) as new_promise
        from test
        join rolling_all a on a.day = test.purchased_at::date
        left join rolling_state s on s.day = test.purchased_at::date and s.customer_state = test.customer_state
    )
    select round(avg(new_promise), 2) as new_promise, round(avg((actual_days > new_promise)::int), 4) as new_late_rate,
           round(avg((actual_days > new_promise)::int) filter (where month(purchased_at) = 3), 4) as march_late_rate
    from t
""")
roll["policy"] = "rolling_14d_q93"
results["backtest"]["policies"].append(roll)

# 7. Réachat à 180 jours, clients éligibles, effet du retard ajusté par État.
results["repeat"] = one("""
    select count(*) as eligible_customers,
           count(*) filter (where returned_in_window) as returned,
           round(avg(returned_in_window::int), 4) as repeat_rate,
           round(avg(returned_in_window::int) filter (where is_late), 4) as repeat_if_late,
           round(avg(returned_in_window::int) filter (where not is_late), 4) as repeat_if_on_time,
           count(*) filter (where is_late) as late_first_orders
    from marts.mart_first_orders where is_eligible
""")
adj = one("""
    with s as (
        select customer_state,
               avg(returned_in_window::int) filter (where is_late) as rl,
               avg(returned_in_window::int) filter (where not is_late) as ro,
               count(*) filter (where is_late) as nl
        from marts.mart_first_orders where is_eligible
        group by 1 having count(*) filter (where is_late) >= 20
    )
    select sum(rl * nl) / sum(nl) as late, sum(ro * nl) / sum(nl) as on_time_standardised, sum(nl) as n_late
    from s
""")
# Écart-type binomial de la différence : suffisant pour dire si l'écart dépasse le bruit.
p = adj["on_time_standardised"]
se = math.sqrt(p * (1 - p) / adj["n_late"])
results["repeat"]["state_adjusted"] = {
    "late": round(adj["late"], 4),
    "on_time_standardised": round(p, 4),
    "difference": round(adj["late"] - p, 4),
    "z": round((adj["late"] - p) / se, 2),
}

# 8. Pièges de données.
results["pitfalls"] = one("""
    select (select count(*) from staging.stg_orders) as orders,
           (select count(distinct customer_id) from staging.stg_customers) as customer_ids,
           (select count(distinct customer_unique_id) from staging.stg_customers) as unique_customers,
           (select count(*) from (select order_id from raw.order_reviews group by 1 having count(*) > 1)) as orders_with_several_reviews,
           (select count(*) from (select review_id from raw.order_reviews group by 1 having count(*) > 1)) as reviews_on_several_orders,
           (select count(*) from staging.stg_orders where shipped_at < purchased_at) as shipped_before_purchase,
           (select count(*) from staging.stg_orders where delivered_at < shipped_at) as delivered_before_shipped,
           (select count(*) from marts.fct_orders where abs(items_value + freight_value - payment_value) > 0.05) as payment_mismatch,
           (select count(*) from marts.mart_monthly where is_partial) as partial_months
""")

# Chiffres dérivés cités dans l'étude, calculés ici plutôt qu'à la main.
h, b, bt = results["handover"], results["bad_reviews"], results["backtest"]["policies"]
by_bucket = {(r["bucket"], r["is_late"]): r["bad_rate"] for r in results["delay_vs_promise"]}
# Rapport « date dépassée / date tenue » des mauvais avis, sur les tranches de délai qui
# comptent au moins 100 commandes en retard (la tranche 0-7 j n'en a que 74).
ratios = [
    late["bad_rate"] / on_time["bad_rate"]
    for late in results["delay_vs_promise"] if late["is_late"] and late["orders"] >= 100
    for on_time in results["delay_vs_promise"] if not on_time["is_late"] and on_time["bucket"] == late["bucket"]
]
results["derived"] = {
    "late_vs_on_time_ratio_min": round(min(ratios), 1),
    "late_vs_on_time_ratio_max": round(max(ratios), 1),
    "late_share_seller_on_time": round(h["late_with_seller_on_time"] / h["late_orders"], 4),
    "bad_share_before_delivery": round(b["bad_before_delivery"] / b["bad"], 4),
    "bad_15_21_on_time": by_bucket[("15-21", False)],
    "bad_15_21_late": by_bucket[("15-21", True)],
    "excess_late_share": round(results["sellers"]["excess_late"] / results["sellers"]["late_orders"], 4),
    "risky_plus5_extra_days": round(bt[1]["new_promise"] - bt[1]["olist_promise"], 2),
    "risky_plus5_bad_avoided": bt[1]["olist_bad_reviews"] - bt[1]["new_bad_reviews"],
    "risky_plus5_bad_avoided_share": round((bt[1]["olist_bad_reviews"] - bt[1]["new_bad_reviews"]) / bt[1]["olist_bad_reviews"], 4),
    "risky_plus5_late_avoided_share": round(1 - bt[1]["new_late_rate"] / bt[1]["olist_late_rate"], 4),
}

# La 5e marge de la grille est la règle citée dans le texte : les deux doivent coïncider.
five = results["backtest"]["margins"][5]
assert five["late_avoided_share"] == results["derived"]["risky_plus5_late_avoided_share"]
assert five["new_promise"] == bt[1]["new_promise"] and five["new_late_rate"] == bt[1]["new_late_rate"]

# La date de la note ne change que si un chiffre change : rejouer l'analyse en CI un autre
# jour doit redonner exactement le même fichier, sinon check_numbers.py échoue sur la date.
previous = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
results = {"published_on": PUBLISHED_ON, **results}
unchanged = json.loads(json.dumps(results, default=str)) == {k: v for k, v in previous.items() if k != "generated_on"}
results = {"generated_on": previous["generated_on"] if unchanged and "generated_on" in previous
           else date.today().isoformat(), **results}

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(results, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
print(f"{OUT.relative_to(ROOT)} écrit")
