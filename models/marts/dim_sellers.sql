select seller_id, state, city, zip_prefix
from {{ ref('stg_sellers') }}
