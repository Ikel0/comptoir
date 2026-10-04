-- Promesse de livraison par trajet (État du vendeur -> État du client).
-- Commandes livrées à un seul vendeur ; les trajets de moins de 30 commandes sont exclus,
-- leurs médianes ne seraient pas stables.
with orders as (
    select *
    from {{ ref('fct_orders') }}
    where order_status = 'delivered' and delivered_at is not null and seller_state is not null
)

select
    seller_state,
    customer_state,
    count(*)                                                    as orders,
    median(promised_days)                                       as median_promised_days,
    median(actual_days)                                         as median_actual_days,
    quantile_cont(actual_days, 0.9)                             as p90_actual_days,
    avg(is_late::int)                                           as late_rate,
    avg((review_score <= 2)::int)                               as bad_review_rate,
    sum((is_late and review_score <= 2)::int)                   as bad_reviews_late
from orders
group by seller_state, customer_state
having count(*) >= 30
