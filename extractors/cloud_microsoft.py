from pathlib import Path
import re

import pandas as pd

from extractors.common import (
    canonicalize_billing,
    canonicalize_term,
    get_canonical_product_name,
    get_strict_period_key,
    normalize_name_text,
    readable_excel_path,
    resolve_column,
    safe_float,
    safe_str,
)

FILES = {
    "LOL": "data/Lista de precios Marzo 2026-LOL.xlsx",
    "INGRAM": "data/Lista de precios Marzo 2026-INGRAM.xlsx",
}

FILE_PATTERNS = {
    "LOL": ["Lista de precios *-LOL.xlsx"],
    "INGRAM": ["Lista de precios *-INGRAM.xlsx"],
}

MONTHS_ES = {
    "enero": 1,
    "febrero": 2,
    "marzo": 3,
    "abril": 4,
    "mayo": 5,
    "junio": 6,
    "julio": 7,
    "agosto": 8,
    "septiembre": 9,
    "setiembre": 9,
    "octubre": 10,
    "noviembre": 11,
    "diciembre": 12,
}


def parse_price_list_period(path):
    match = re.search(
        r"Lista\s+de\s+precios\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)\s+(\d{4})",
        path.stem,
        re.IGNORECASE,
    )
    if not match:
        return (0, 0)

    month = MONTHS_ES.get(match.group(1).lower())
    year = int(match.group(2))
    return (year, month or 0)


def resolve_source_file(root_dir, distributor):
    configured_path = root_dir / FILES[distributor]
    candidates = []

    if configured_path.exists():
        candidates.append(configured_path)

    for pattern in FILE_PATTERNS.get(distributor, []):
        candidates.extend(root_dir.glob(f"data/{pattern}"))

    unique_candidates = sorted(
        {path.resolve() for path in candidates},
        key=lambda path: (*parse_price_list_period(path), path.stat().st_mtime),
    )
    return unique_candidates[-1] if unique_candidates else configured_path


def build_cloud_product(distributor, product_type, part_number, name, term, billing, price, erp, segment):
    clean_name = normalize_name_text(name)
    clean_part_number = safe_str(part_number)
    clean_term = safe_str(term)
    clean_billing = safe_str(billing)
    clean_segment = safe_str(segment)

    normalized_term = canonicalize_term(clean_term, clean_part_number, clean_name)
    normalized_billing = canonicalize_billing(clean_billing, clean_part_number, clean_name)
    strict_period_key = get_strict_period_key(normalized_term, normalized_billing)
    normalized_price = price

    # Ingram publishes annual-monthly subscriptions as a monthly installment,
    # while the other wholesalers expose the full annual amount.
    if distributor == "INGRAM" and strict_period_key == "anual_mensual":
        normalized_price = price * 12

    return {
        "area": "cloud",
        "distributor": distributor,
        "type": product_type,
        "partNumber": clean_part_number,
        "name": clean_name,
        "term": clean_term,
        "billing": clean_billing,
        "price": normalized_price,
        "erp": erp,
        "segment": clean_segment,
        "canonicalName": get_canonical_product_name(clean_name),
        "normalizedTerm": normalized_term,
        "normalizedBilling": normalized_billing,
        "strictPeriodKey": strict_period_key,
    }


def extract_lol(path):
    items = []
    with readable_excel_path(path) as readable_path:
        xl = pd.ExcelFile(readable_path)
        sheet_types = [
            ("NCE", "NCE"),
            ("SUSCRIPCION", "SUSCRIPCION"),
            ("Subscription", "SUSCRIPCION"),
            ("PERPETUO", "PERPETUO"),
            ("Perpetual", "PERPETUO"),
        ]

        if not any(sheet in xl.sheet_names for sheet, _ in sheet_types) and "Lista de precios" in xl.sheet_names:
            sheet_types.append(("Lista de precios", "NCE"))

        for sheet, product_type in sheet_types:
            if sheet not in xl.sheet_names:
                continue

            df = pd.read_excel(readable_path, sheet_name=sheet)
            erp_col = resolve_column(df.columns, "ERP Price", "ERP")
            part_col = resolve_column(df.columns, "NUMERO DE PARTE")
            name_col = resolve_column(df.columns, "SkuTitle")
            term_col = resolve_column(df.columns, "TermDuration")
            billing_col = resolve_column(df.columns, "BillingPlan")
            price_col = resolve_column(df.columns, "UnitPrice", "PARTNER PRICE")
            segment_col = resolve_column(df.columns, "Segment")

            for _, row in df.iterrows():
                name = safe_str(row.get(name_col))
                price = safe_float(row.get(price_col, 0))

                if not name or price == 0:
                    continue

                items.append(
                    build_cloud_product(
                        distributor="LOL",
                        product_type=product_type,
                        part_number=safe_str(row.get(part_col)),
                        name=name,
                        term=safe_str(row.get(term_col)) or "OneTime",
                        billing=safe_str(row.get(billing_col)) or ("OneTime" if product_type == "PERPETUO" else ""),
                        price=price,
                        erp=safe_float(row.get(erp_col, 0)),
                        segment=safe_str(row.get(segment_col)),
                    )
                )

    return items


def extract_ingram(path):
    items = []
    sheet_map = {
        "Microsoft NCE (Excluido IVA)": {
            "type": "NCE",
            "header_row": 4,
            "name_candidates": ("Connect SKU Title", "SkuTitle", "Descripción", "Descripcion"),
            "part_candidates": ("MPN ID",),
            "term_candidates": ("Permanencia",),
            "billing_candidates": ("Facturacion", "Facturación", "BillingPlan"),
            "price_candidates": ("Precio Unitario Canal",),
            "segment_candidates": ("Segment",),
        },
        "MSFT SW SUBS (Excluido IVA) ": {
            "type": "SUSCRIPCION",
            "header_row": 4,
            "name_candidates": ("SkuTitle",),
            "part_candidates": ("MPN ID",),
            "term_candidates": ("Permanencia",),
            "billing_candidates": ("BillingPlan", "Facturacion", "Facturación"),
            "price_candidates": ("Precio Unitario Canal",),
            "segment_candidates": ("Segment",),
        },
        "MSFT SW PERP (+IVA) ": {
            "type": "PERPETUO",
            "header_row": 4,
            "name_candidates": ("SkuTitle",),
            "part_candidates": ("VPN",),
            "term_candidates": (),
            "billing_candidates": (),
            "price_candidates": ("Precio Unitario Canal",),
            "segment_candidates": ("Segment",),
        },
        "MSFT OV OVS S   ": {
            "type": "PERPETUO",
            "header_row": 4,
            "name_candidates": ("Item Name",),
            "part_candidates": ("Part Number",),
            "term_candidates": (),
            "billing_candidates": (),
            "price_candidates": ("Precio unitario canal",),
            "segment_candidates": ("Segment",),
        },
    }

    with readable_excel_path(path) as readable_path:
        xl = pd.ExcelFile(readable_path)

        for sheet, config in sheet_map.items():
            if sheet not in xl.sheet_names:
                continue

            df = pd.read_excel(readable_path, sheet_name=sheet, header=config["header_row"])
            name_col = resolve_column(df.columns, *config["name_candidates"])
            part_col = resolve_column(df.columns, *config["part_candidates"])
            term_col = resolve_column(df.columns, *config["term_candidates"]) if config["term_candidates"] else None
            billing_col = (
                resolve_column(df.columns, *config["billing_candidates"]) if config["billing_candidates"] else None
            )
            price_col = resolve_column(df.columns, *config["price_candidates"])
            segment_col = (
                resolve_column(df.columns, *config["segment_candidates"]) if config["segment_candidates"] else None
            )

            if not name_col and len(df.columns) > 2:
                name_col = list(df.columns)[2]

            if not name_col or not price_col:
                continue

            for _, row in df.iterrows():
                name = safe_str(row.get(name_col))
                price = safe_float(row.get(price_col, 0))

                if not name or price == 0:
                    continue

                items.append(
                    build_cloud_product(
                        distributor="INGRAM",
                        product_type=config["type"],
                        part_number=safe_str(row.get(part_col)),
                        name=name,
                        term=safe_str(row.get(term_col)) or "OneTime",
                        billing=safe_str(row.get(billing_col)) or ("OneTime" if config["type"] == "PERPETUO" else ""),
                        price=price,
                        erp=0.0,
                        segment=safe_str(row.get(segment_col)),
                    )
                )

    return items


def build_cloud_catalog(base_dir=None):
    root_dir = Path(base_dir or Path(__file__).resolve().parent.parent)
    catalog = []

    file_map = {key: resolve_source_file(root_dir, key) for key in FILES}

    if file_map["LOL"].exists():
        catalog.extend(extract_lol(file_map["LOL"]))

    if file_map["INGRAM"].exists():
        catalog.extend(extract_ingram(file_map["INGRAM"]))

    return catalog
