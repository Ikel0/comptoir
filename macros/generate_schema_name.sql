{# Schémas lisibles (staging, marts) plutôt que main_staging, main_marts. #}
{% macro generate_schema_name(custom_schema_name, node) -%}
    {{ custom_schema_name if custom_schema_name else target.schema }}
{%- endmacro %}
