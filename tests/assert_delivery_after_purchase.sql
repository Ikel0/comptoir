select order_id
from {{ ref('fct_orders') }}
where delivered_at < purchased_at
