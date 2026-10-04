-- Retards et avis par vendeur, au grain commande-vendeur (une commande à deux vendeurs
-- compte pour chacun). Le retard est celui de la commande : Olist ne date pas chaque colis.
with order_sellers as (
    select distinct i.order_id, i.seller_id
    from {{ ref('stg_order_items') }} i
)

select
    os.seller_id,
    s.state                                         as seller_state,
    count(*)                                        as delivered_orders,
    sum(o.is_late::int)                             as late_orders,
    avg(o.is_late::int)                             as late_rate,
    avg(o.review_score)                             as avg_review,
    sum((o.review_score <= 2)::int)                 as bad_reviews
from order_sellers os
join {{ ref('int_orders') }} o on o.order_id = os.order_id
join {{ ref('stg_sellers') }} s on s.seller_id = os.seller_id
where o.order_status = 'delivered' and o.delivered_at is not null
group by os.seller_id, s.state
