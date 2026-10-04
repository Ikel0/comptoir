-- Dates impossibles connues dans l'archive : 166 remises au transporteur avant l'achat,
-- 23 livraisons avant l'expédition. Elles sont exclues de l'analyse vendeur / transporteur ;
-- le test avertit si leur nombre augmente.
{{ config(severity='warn', warn_if='> 189') }}
select order_id
from {{ ref('stg_orders') }}
where shipped_at < purchased_at or delivered_at < shipped_at
