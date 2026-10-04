select
    c.customer_unique_id,
    any_value(c.state)                                         as state,
    any_value(c.city)                                          as city,
    min(co.purchased_at)                                       as first_purchased_at,
    count(co.order_id)                                         as delivered_orders
from {{ ref('stg_customers') }} c
left join {{ ref('int_customer_orders') }} co using (customer_unique_id)
group by c.customer_unique_id
