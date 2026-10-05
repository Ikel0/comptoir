"""Vérifie que chaque chiffre écrit dans site/index.html correspond à site/data/results.json.

Les valeurs du HTML sont lisibles sans JavaScript ; si l'analyse change, ce test échoue
tant que le texte n'a pas été mis à jour.
"""
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent
MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
          "septembre", "octobre", "novembre", "décembre"]


def fixed(value: float, digits: int) -> str:
    sign = "-" if value < 0 else ""
    text = f"{abs(value):,.{digits}f}".replace(",", " ").replace(".", ",")
    return sign + text


FORMATS = {
    "int": lambda v: fixed(v, 0),
    "n0": lambda v: fixed(v, 0),
    "n1": lambda v: fixed(v, 1),
    "n2": lambda v: fixed(v, 2),
    "pct": lambda v: fixed(v * 100, 1) + " %",
    "pct0": lambda v: fixed(v * 100, 0) + " %",
    "pct2": lambda v: fixed(v * 100, 2) + " %",
    "date": lambda v: f"{int(v[8:])} {MONTHS[int(v[5:7]) - 1]} {v[:4]}",
}


def lookup(data, path):
    for key in path.split("."):
        if key == "length":
            return len(data)
        data = data[int(key)] if isinstance(data, list) else data[key]
    return data


def normalise(text: str) -> str:
    return re.sub(r"[\s\u00a0\u202f]+", " ", html.unescape(text)).replace("\u2212", "-").strip()


def main() -> int:
    page = (ROOT / "site" / "index.html").read_text(encoding="utf-8")
    data = json.loads((ROOT / "site" / "data" / "results.json").read_text(encoding="utf-8"))
    errors, count = [], 0
    for key, fmt, shown in re.findall(r'data-k="([^"]+)" data-f="([^"]+)">([^<]*)<', page):
        count += 1
        expected = FORMATS[fmt](lookup(data, key))
        if normalise(shown) != normalise(expected):
            errors.append(f"{key} : la page affiche « {shown} », les données donnent « {expected} »")
    # La mention « mise à jour le … » n'a de sens que si les chiffres ont changé depuis la
    # publication : elle doit être là si et seulement si les deux dates diffèrent.
    has_update = 'class="updated"' in page
    if has_update != (data["generated_on"] != data["published_on"]):
        errors.append("mise à jour : la page " + ("l'affiche" if has_update else "ne l'affiche pas")
                      + f", publiée le {data['published_on']}, chiffres du {data['generated_on']}")
    for error in errors:
        print(error)
    print(f"{count} chiffres vérifiés, {len(errors)} écart(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
