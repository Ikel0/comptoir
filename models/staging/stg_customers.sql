-- customer_id change à chaque commande ; customer_unique_id identifie la personne.
select
    customer_id,
    customer_unique_id,
    customer_zip_code_prefix as zip_prefix,
    customer_city            as city,
    upper(customer_state)    as state
from {{ source('raw', 'customers') }}
