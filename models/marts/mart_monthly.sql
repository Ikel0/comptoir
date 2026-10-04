-- Les mois de sept. et oct. 2016, déc. 2016 et à partir de sept. 2018 ont moins de
-- 400 commandes : ils sont marqués is_partial pour ne pas lire une chute qui n'existe pas.
select
    date_trunc('month', purchased_at)::date                         as month,
    count(*)                                                        as orders,
    count(*) filter (where order_status = 'delivered')              as delivered_orders,
    sum(items_value) filter (where order_status = 'delivered')      as gmv,
    avg(items_value) filter (where order_status = 'delivered')      as avg_basket,
    avg(is_late::int) filter (where delivered_at is not null)       as late_rate,
    avg(review_score)                                               as avg_review,
    count(*) filter (where is_first_order)                          as new_customers,
    count(*) < 400                                                  as is_partial
from {{ ref('fct_orders') }}
group by 1
