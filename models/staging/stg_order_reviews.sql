-- Une commande peut avoir plusieurs avis (547 cas) et un même review_id peut couvrir
-- plusieurs commandes (789 cas). On garde l'avis le plus récent de chaque commande.
select
    order_id,
    review_id,
    cast(review_score as integer)               as review_score,
    nullif(trim(review_comment_title), '')      as review_title,
    nullif(trim(review_comment_message), '')    as review_message,
    cast(review_creation_date as timestamp)     as reviewed_at,
    cast(review_answer_timestamp as timestamp)  as review_answered_at
from {{ source('raw', 'order_reviews') }}
qualify row_number() over (
    partition by order_id
    order by cast(review_answer_timestamp as timestamp) desc, review_id
) = 1
