-- Une ligne par client : sa première commande livrée et s'il est revenu.
-- Seuls les clients qui ont eu repeat_window_days jours d'historique sont « éligibles » :
-- sans ce filtre, les clients de 2018 tirent le taux de réachat vers le bas.
select
    o.customer_unique_id,
    o.order_id,
    o.purchased_at,
    o.customer_state,
    o.seller_state,
    o.is_late,
    o.days_late,
    o.review_score,
    o.items_value,
    co.next_purchased_at,
    o.purchased_at <= date '{{ var("data_end_date") }}' - interval {{ var("repeat_window_days") }} day as is_eligible,
    co.next_purchased_at is not null
        and co.next_purchased_at <= o.purchased_at + interval {{ var("repeat_window_days") }} day      as returned_in_window
from {{ ref('fct_orders') }} o
join {{ ref('int_customer_orders') }} co using (order_id)
where co.order_rank = 1
