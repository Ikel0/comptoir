select
    order_id,
    customer_id,
    order_status,
    cast(order_purchase_timestamp as timestamp)          as purchased_at,
    cast(order_approved_at as timestamp)                 as approved_at,
    cast(order_delivered_carrier_date as timestamp)      as shipped_at,
    cast(order_delivered_customer_date as timestamp)     as delivered_at,
    -- Olist ne donne qu'une date estimée (minuit) : on compare donc en jours, pas en heures.
    cast(order_estimated_delivery_date as date)          as estimated_delivery_date
from {{ source('raw', 'orders') }}
