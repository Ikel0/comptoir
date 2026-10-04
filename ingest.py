"""Télécharge l'archive Olist, vérifie son empreinte et charge les CSV dans DuckDB (schéma raw).

Le chargement s'arrête si une colonne attendue manque : un modèle dbt construit sur une
colonne disparue produirait des KPI faux sans erreur visible.
"""
import hashlib
import sys
import urllib.request
import zipfile
from pathlib import Path

import duckdb

ROOT = Path(__file__).parent
RAW = ROOT / "data" / "raw"
DB = ROOT / "data" / "comptoir.duckdb"
URL = "https://www.kaggle.com/api/v1/datasets/download/olistbr/brazilian-ecommerce"
# Empreinte de l'archive téléchargée le 2026-10-04. Si Kaggle publie une nouvelle version,
# le chargement échoue volontairement : les chiffres de l'étude ne seraient plus comparables.
SHA256 = "967e41e04fc306fe604e2a693f488995a8b41e5047418f8a5c8e4abd6deca784"

CONTRACT = {
    "orders": ["order_id", "customer_id", "order_status", "order_purchase_timestamp", "order_approved_at",
               "order_delivered_carrier_date", "order_delivered_customer_date", "order_estimated_delivery_date"],
    "order_items": ["order_id", "order_item_id", "product_id", "seller_id", "shipping_limit_date", "price", "freight_value"],
    "order_payments": ["order_id", "payment_sequential", "payment_type", "payment_installments", "payment_value"],
    "order_reviews": ["review_id", "order_id", "review_score", "review_comment_title", "review_comment_message",
                      "review_creation_date", "review_answer_timestamp"],
    "customers": ["customer_id", "customer_unique_id", "customer_zip_code_prefix", "customer_city", "customer_state"],
    "sellers": ["seller_id", "seller_zip_code_prefix", "seller_city", "seller_state"],
    "products": ["product_id", "product_category_name", "product_name_lenght", "product_description_lenght",
                 "product_photos_qty", "product_weight_g", "product_length_cm", "product_height_cm", "product_width_cm"],
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    RAW.mkdir(parents=True, exist_ok=True)
    archive = RAW / "olist.zip"
    if not archive.exists():
        print(f"téléchargement {URL}")
        urllib.request.urlretrieve(URL, archive)
    found = sha256(archive)
    if found != SHA256:
        print(f"empreinte inattendue : {found}", file=sys.stderr)
        return 1
    with zipfile.ZipFile(archive) as zf:
        zf.extractall(RAW)

    con = duckdb.connect(str(DB))
    con.execute("create schema if not exists raw")
    con.execute("create or replace table raw._manifest (source varchar, file varchar, sha256 varchar, rows bigint, loaded_at timestamp)")
    for table, columns in CONTRACT.items():
        csv = RAW / f"olist_{table}_dataset.csv"
        # Tout en texte : le typage se fait dans dbt (staging), là où il est testé.
        con.execute(f"create or replace table raw.{table} as select * from read_csv('{csv}', header=true, all_varchar=true)")
        actual = [row[0] for row in con.execute(f"describe raw.{table}").fetchall()]
        missing = sorted(set(columns) - set(actual))
        if missing:
            print(f"{table} : colonnes manquantes {missing}", file=sys.stderr)
            return 1
        rows = con.execute(f"select count(*) from raw.{table}").fetchone()[0]
        con.execute("insert into raw._manifest values (?, ?, ?, ?, now())", [table, csv.name, sha256(csv), rows])
        print(f"raw.{table:<15} {rows:>7} lignes")
    con.execute(f"create or replace table raw.category_translation as select * from read_csv('{RAW / 'product_category_name_translation.csv'}', header=true, all_varchar=true)")
    con.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
