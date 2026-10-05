PY := .venv/bin/python
DBT := DBT_PROFILES_DIR=. .venv/bin/dbt

all: data build analysis check test

.venv:
	python3 -m venv .venv
	.venv/bin/pip install -q -r requirements.txt

data: .venv
	$(PY) ingest.py

build:
	$(DBT) build

analysis:
	$(PY) analysis.py

check:
	$(PY) check_numbers.py

test:
	$(PY) -m unittest -v test_backtest

serve:
	python3 -m http.server 8000 -d site

.PHONY: all data build analysis check test serve
