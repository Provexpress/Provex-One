"""Extract Kaspersky price lists into a standardized JSON catalog.

This extractor reads Kaspersky price sheets (like 'LISTA DE PRECIOS PROVEXPRESS SEPTIEMBRE 2026.xlsx'),
extracts product details, SKUs, MSRP, partner cost (FOB), license type, duration, node counts,
and builds catalogs/kaspersky_products.json for the Provex One quoting engine.
"""

from __future__ import annotations

from pathlib import Path
import re
import sys
import pandas as pd

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from extractors.common import dump_json

CATALOG_PATH = ROOT_DIR / "catalogs" / "kaspersky_products.json"


def find_kaspersky_file(root_dir: Path = ROOT_DIR) -> Path:
    candidates = []
    data_dir = root_dir / "data"
    
    if data_dir.exists():
        candidates.extend(data_dir.glob("*KASPERSKY*.xlsx"))
        candidates.extend(data_dir.glob("*PROVEXPRESS*.xlsx"))
    candidates.extend(root_dir.glob("*KASPERSKY*.xlsx"))
    candidates.extend(root_dir.glob("*PROVEXPRESS*.xlsx"))

    # Filter files that are not Microsoft lists
    valid_candidates = []
    for f in set(candidates):
        if f.name.startswith("~$") or "SEP26" in f.name.upper() or "AGO26" in f.name.upper() or "LOL" in f.name.upper():
            continue
        valid_candidates.append(f)

    if not valid_candidates:
        # Fallback to any file with 'PROVEXPRESS' and 'SEPTIEMBRE'
        for f in data_dir.glob("*.xlsx"):
            if "SEPTIEMBRE" in f.name.upper() and "PROVEXPRESS" in f.name.upper() and "SEP26" not in f.name.upper():
                valid_candidates.append(f)

    valid_candidates = sorted(
        valid_candidates,
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )
    if not valid_candidates:
        raise FileNotFoundError("No se encontro un archivo de lista de precios de Kaspersky en data/.")
    return valid_candidates[0]


def parse_kaspersky_row(row: pd.Series) -> dict | None:
    part = str(row.get("PartNumber", "")).strip()
    name = str(row.get("SaleItemName", "")).strip()
    name_short = str(row.get("SaleItemNameShort", "")).strip()

    if not part or not name or part.lower() == "nan" or name.lower() == "nan":
        return None

    try:
        msrp = round(float(row.get("SKUPrice", 0) or 0), 2)
        cost = round(float(row.get("FOB", 0) or 0), 2)
        ref_price = round(float(row.get("PRICE", 0) or 0), 2)
    except (ValueError, TypeError):
        return None

    if cost <= 0 and msrp <= 0:
        return None

    # License Type: Base vs Renovacion
    is_renewal = "renewal" in name.lower() or " rnl " in name_short.lower()
    license_type = "Renovación" if is_renewal else "Base (Nueva)"
    license_type_key = "renewal" if is_renewal else "base"

    # Duration
    years_m = re.search(r'(\d+)\s*(?:year|año|y)', name, re.I)
    if years_m:
        duration_years = int(years_m.group(1))
        duration = f"{duration_years} {'Año' if duration_years == 1 else 'Años'}"
    else:
        duration_years = 1
        duration = "1 Año"
    duration_key = f"p{duration_years}y"

    # Family / Category
    if "Small Office" in name or "KSOS" in name or "Small Office" in name_short:
        family = "Small Office Security"
        family_key = "ksos"
    elif "Standard" in name or "Standard" in name_short:
        family = "Kaspersky Standard"
        family_key = "standard"
    elif "Plus" in name or "Plus" in name_short:
        family = "Kaspersky Plus"
        family_key = "plus"
    elif "Premium" in name or "Premium" in name_short:
        family = "Kaspersky Premium"
        family_key = "premium"
    elif "Endpoint" in name:
        family = "Kaspersky Endpoint Security"
        family_key = "endpoint"
    else:
        family = "Otros Productos"
        family_key = "otros"

    # Device / Node count details
    nodes_info = ""
    device_count = 0
    m_user = re.search(r'(\d+)-User', name, re.I)
    m_dvc = re.search(r'(\d+)-Device', name, re.I)

    if "Small Office" in name:
        ksos_m = re.search(r'(\d+-[^.]+?)\s+\d+\s*year', name, re.I)
        if ksos_m:
            nodes_info = ksos_m.group(1).replace(";", " · ")
        else:
            nodes_info = "Equipos + Servidor + Móviles"
        if m_user:
            device_count = int(m_user.group(1))
    elif m_dvc:
        device_count = int(m_dvc.group(1))
        nodes_info = f"{device_count} {'Dispositivo' if device_count == 1 else 'Dispositivos'}"
    elif m_user:
        device_count = int(m_user.group(1))
        nodes_info = f"{device_count} {'Usuario' if device_count == 1 else 'Usuarios'}"
    else:
        nodes_info = "Multidispositivo"

    # Normalize search text without diacritics
    def normalize_str(s: str) -> str:
        s = s.lower().replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u").replace("ñ", "n")
        return re.sub(r'\s+', ' ', s).strip()

    search_text = normalize_str(f"{part} {name} {name_short} {family} {license_type} {duration} {nodes_info}")

    return {
        "area": "kaspersky",
        "distributor": "PROVEXPRESS",
        "partNumber": part,
        "name": name,
        "nameShort": name_short,
        "family": family,
        "familyKey": family_key,
        "licenseType": license_type,
        "licenseTypeKey": license_type_key,
        "duration": duration,
        "durationYears": duration_years,
        "durationKey": duration_key,
        "nodesInfo": nodes_info,
        "deviceCount": device_count,
        "msrp": msrp,
        "cost": cost,
        "refPrice": ref_price,
        "currency": "USD",
        "searchText": search_text,
    }


def build_kaspersky_catalog(root_dir: Path = ROOT_DIR) -> list[dict]:
    source_file = find_kaspersky_file(root_dir)
    df = pd.read_excel(source_file, sheet_name=0).dropna(subset=["PartNumber", "SaleItemName"])

    catalog = []
    seen_parts = set()
    for _, row in df.iterrows():
        item = parse_kaspersky_row(row)
        if item and item["partNumber"] not in seen_parts:
            seen_parts.add(item["partNumber"])
            catalog.append(item)

    # Sort catalog by family, device count, duration, license type
    catalog.sort(key=lambda x: (x["familyKey"], x["deviceCount"], x["durationYears"], x["licenseTypeKey"]))
    return catalog


def main():
    catalog = build_kaspersky_catalog()
    dump_json(CATALOG_PATH, catalog)
    print(f"Catalogo Kaspersky generado: {len(catalog)} productos guardados en {CATALOG_PATH}")


if __name__ == "__main__":
    main()
