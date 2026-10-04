select
    p.product_id,
    p.product_category_name                                        as category_pt,
    coalesce(t.product_category_name_english, p.product_category_name, 'unknown') as category,
    cast(p.product_weight_g as integer)                             as weight_g,
    cast(p.product_photos_qty as integer)                           as photos_qty
from {{ source('raw', 'products') }} p
left join {{ source('raw', 'category_translation') }} t using (product_category_name)
