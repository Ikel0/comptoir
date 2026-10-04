-- Le paiement d'une commande doit égaler articles + frais de port. 260 commandes s'en
-- écartent de plus de 5 centimes dans l'archive (bons d'achat, intérêts de paiement en
-- plusieurs fois). Le test avertit au-delà de ce niveau connu au lieu d'échouer.
{{ config(severity='warn', warn_if='> 260') }}
select order_id, items_value + freight_value as expected, payment_value
from {{ ref('fct_orders') }}
where payment_value is not null
  and items_value is not null
  and abs(items_value + freight_value - payment_value) > 0.05
