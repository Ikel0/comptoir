-- Une ligne par commande, avec les montants, l'avis retenu et la mesure de la promesse.
with items as (
    select
        order_id,
        count(*)                  as items_count,
        count(distinct seller_id) as sellers_count,
        any_value(seller_id)      as any_seller_id,
        sum(price)                as items_value,
        sum(freight_value)        as freight_value
    from {{ ref('stg_order_items') }}
    group by order_id
),

payments as (
    select order_id, sum(payment_value) as payment_value, max(payment_installments) as installments
    from {{ ref('stg_order_payments') }}
    group by order_id
)

select
    o.order_id,
    c.customer_unique_id,
    c.state                                        as customer_state,
    o.order_status,
    o.purchased_at,
    o.delivered_at,
    o.estimated_delivery_date,
    i.items_count,
    i.sellers_count,
    -- Le vendeur n'est attribué que si la commande n'en a qu'un (98,7 % des commandes).
    case when i.sellers_count = 1 then i.any_seller_id end                       as seller_id,
    i.items_value,
    i.freight_value,
    p.payment_value,
    p.installments,
    r.review_score,
    r.reviewed_at,
    r.review_message is not null                                                 as has_review_text,
    -- Promesse et réalité, en jours calendaires depuis l'achat.
    date_diff('day', o.purchased_at::date, o.estimated_delivery_date)            as promised_days,
    date_diff('day', o.purchased_at::date, o.delivered_at::date)                 as actual_days,
    date_diff('day', o.estimated_delivery_date, o.delivered_at::date)            as days_late,
    o.delivered_at::date > o.estimated_delivery_date                             as is_late,
    r.reviewed_at::date < o.delivered_at::date                                   as reviewed_before_delivery
from {{ ref('stg_orders') }} o
join {{ ref('stg_customers') }} c using (customer_id)
left join items i using (order_id)
left join payments p using (order_id)
left join {{ ref('stg_order_reviews') }} r using (order_id)
