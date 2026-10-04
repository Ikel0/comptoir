-- Rang de chaque commande livrée dans l'historique du client (customer_unique_id).
-- Les commandes annulées ou indisponibles ne comptent pas comme un achat.
select
    order_id,
    customer_unique_id,
    purchased_at,
    row_number() over (partition by customer_unique_id order by purchased_at, order_id) as order_rank,
    lead(purchased_at) over (partition by customer_unique_id order by purchased_at, order_id) as next_purchased_at
from {{ ref('int_orders') }}
where order_status = 'delivered'
