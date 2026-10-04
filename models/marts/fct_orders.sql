select
    o.*,
    s.state                     as seller_state,
    co.order_rank,
    co.order_rank = 1           as is_first_order
from {{ ref('int_orders') }} o
left join {{ ref('stg_sellers') }} s using (seller_id)
left join {{ ref('int_customer_orders') }} co using (order_id)
