-- Chaque client ayant au moins une commande livrée doit avoir exactement une première commande.
select d.customer_unique_id
from {{ ref('dim_customers') }} d
left join {{ ref('mart_first_orders') }} f using (customer_unique_id)
where d.delivered_orders > 0 and f.customer_unique_id is null
