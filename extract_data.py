#!/usr/bin/env python3
"""
Genera products.json desde los Excel de mayoristas.

Uso:
  uv run --with pandas --with openpyxl python extract_data.py
"""

import json
import os
import re
import unicodedata
from collections import Counter

import pandas as pd

OUTPUT = "products.json"

FILES = {
    "LOL": "data/Lista de precios Marzo 2026-LOL.xlsx",
    "INTCOMEX": "data/Lista de precios Marzo 2026-INTCOMEX.xlsx",
    "INGRAM": "data/Lista de precios Marzo 2026-INGRAM.xlsx",
}

NAME_SPACE_RE = re.compile(r"\s+")
NAME_DASH_RE = re.compile(r"(?:Ã¢â‚¬â€œ|â€“|–)")

all_products = []


def safe_float(value):
    try:
        parsed = float(value)
        return 0.0 if parsed != parsed else parsed
    except (TypeError, ValueError):
        return 0.0


def safe_str(value):
    if value is None:
        return ""

    if isinstance(value, float) and value != value:
        return ""

    return str(value).strip()


def normalize_text(value):
    return safe_str(value).lower()


def normalize_header(value):
    normalized = unicodedata.normalize("NFKD", safe_str(value))
    normalized = normalized.encode("ascii", "ignore").decode("ascii")
    normalized = normalized.replace("\u00a0", " ")
    return NAME_SPACE_RE.sub(" ", normalized).strip().lower()


def resolve_column(columns, *candidates):
    normalized_columns = {normalize_header(column): column for column in columns}

    for candidate in candidates:
        normalized_candidate = normalize_header(candidate)
        if normalized_candidate in normalized_columns:
            return normalized_columns[normalized_candidate]

    return None


def normalize_name_text(value):
    normalized = safe_str(value).replace("\u00a0", " ")
    normalized = NAME_DASH_RE.sub("-", normalized)
    return NAME_SPACE_RE.sub(" ", normalized).strip()


def get_canonical_product_name(value):
    normalized = normalize_name_text(value)
    normalized = re.sub(r"\s+\((?:NCE|CSP)[^)]+\)$", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\s+NCE\s+[A-Z]{3}\s+(?:ANN|MTH|TRI)$", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(
        r"\s*-\s*(?:1|3)\s*year(?:\s+subscription)?$",
        "",
        normalized,
        flags=re.IGNORECASE,
    )
    normalized = re.sub(
        r"\s+(?:1|3)\s*year(?:\s+subscription)?$",
        "",
        normalized,
        flags=re.IGNORECASE,
    )
    normalized = re.sub(r"\s*-\s*$", "", normalized)
    return NAME_SPACE_RE.sub(" ", normalized).strip()


def has_any_suffix(value, suffixes):
    return any(value.endswith(suffix) for suffix in suffixes)


def canonicalize_term(term, part_number, name):
    normalized_term = normalize_text(term)
    normalized_part = normalize_text(part_number)
    normalized_name = normalize_text(normalize_name_text(name))

    if has_any_suffix(normalized_part, ("p3yt", "p3ya", "p3ym", ":p3y")):
        return "trianual"

    if has_any_suffix(normalized_part, ("p1ya", "p1ym", ":p1y")):
        return "anual"

    if has_any_suffix(normalized_part, ("p1mm", ":p1m")):
        return "mensual"

    if (
        "p3y" in normalized_term
        or "trianual" in normalized_term
        or "trien" in normalized_term
        or re.search(r"3\s*year", normalized_name)
    ):
        return "trianual"

    if "p1y" in normalized_term or "anual" in normalized_term or re.search(r"1\s*year", normalized_name):
        return "anual"

    if "p1m" in normalized_term or "mensual" in normalized_term or "month" in normalized_term:
        return "mensual"

    if "onetime" in normalized_term or "one time" in normalized_term:
        return "onetime"

    return ""


def canonicalize_billing(billing, part_number, name):
    normalized_billing = normalize_text(billing)
    normalized_part = normalize_text(part_number)
    normalized_name = normalize_text(normalize_name_text(name))

    if has_any_suffix(normalized_part, ("p3yt",)):
        return "trianual"

    if has_any_suffix(normalized_part, ("p3ya", "p1ya")):
        return "anual"

    if has_any_suffix(normalized_part, ("p3ym", "p1ym", "p1mm", ":p1m")):
        return "mensual"

    if re.search(r"\b(?:nce|csp)\s+(?:com|edu|nfp)\s+tri\b|\((?:nce|csp)\s+(?:com|edu|nfp)\s+tri\)", normalized_name):
        return "trianual"

    if re.search(r"\b(?:nce|csp)\s+(?:com|edu|nfp)\s+ann\b|\((?:nce|csp)\s+(?:com|edu|nfp)\s+ann\)", normalized_name):
        return "anual"

    if re.search(r"\b(?:nce|csp)\s+(?:com|edu|nfp)\s+mth\b|\((?:nce|csp)\s+(?:com|edu|nfp)\s+mth\)", normalized_name):
        return "mensual"

    if "trien" in normalized_billing or "trianual" in normalized_billing:
        return "trianual"

    if "annual" in normalized_billing or "anual" in normalized_billing:
        return "anual"

    if "monthly" in normalized_billing or "mensual" in normalized_billing:
        return "mensual"

    if "onetime" in normalized_billing or "one time" in normalized_billing:
        return "onetime"

    return ""


def get_strict_period_key(normalized_term, normalized_billing):
    combo = f"{normalized_term}|{normalized_billing}"

    strict_map = {
        "mensual|mensual": "mensual_mensual",
        "anual|anual": "anual_anual",
        "anual|mensual": "anual_mensual",
        "trianual|anual": "trianual_anual",
        "trianual|trianual": "trianual_trianual",
        "trianual|mensual": "trianual_mensual",
        "onetime|onetime": "onetime_onetime",
    }

    return strict_map.get(combo, "")


def build_product(distributor, product_type, part_number, name, term, billing, price, erp, segment):
    clean_name = normalize_name_text(name)
    clean_part_number = safe_str(part_number)
    clean_term = safe_str(term)
    clean_billing = safe_str(billing)
    clean_segment = safe_str(segment)

    normalized_term = canonicalize_term(clean_term, clean_part_number, clean_name)
    normalized_billing = canonicalize_billing(clean_billing, clean_part_number, clean_name)

    return {
        "distributor": distributor,
        "type": product_type,
        "partNumber": clean_part_number,
        "name": clean_name,
        "term": clean_term,
        "billing": clean_billing,
        "price": price,
        "erp": erp,
        "segment": clean_segment,
        "canonicalName": get_canonical_product_name(clean_name),
        "normalizedTerm": normalized_term,
        "normalizedBilling": normalized_billing,
        "strictPeriodKey": get_strict_period_key(normalized_term, normalized_billing),
    }


def append_product(**kwargs):
    all_products.append(build_product(**kwargs))


def extract_lol(path):
    xl = pd.ExcelFile(path)
    count = 0

    for sheet, product_type in (("NCE", "NCE"), ("SUSCRIPCION", "SUSCRIPCION"), ("PERPETUO", "PERPETUO")):
        if sheet not in xl.sheet_names:
            continue

        df = pd.read_excel(path, sheet_name=sheet)
        erp_col = resolve_column(df.columns, "ERP Price", "ERP")
        part_col = resolve_column(df.columns, "NUMERO DE PARTE")
        name_col = resolve_column(df.columns, "SkuTitle")
        term_col = resolve_column(df.columns, "TermDuration")
        billing_col = resolve_column(df.columns, "BillingPlan")
        price_col = resolve_column(df.columns, "PARTNER PRICE")
        segment_col = resolve_column(df.columns, "Segment")

        for _, row in df.iterrows():
            name = safe_str(row.get(name_col))
            price = safe_float(row.get(price_col, 0))

            if not name or price == 0:
                continue

            append_product(
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
            count += 1

    print(f"  LOL: {count} productos")


def extract_intcomex(path):
    xl = pd.ExcelFile(path)
    count = 0

    for sheet, product_type in (("NCE", "NCE"), ("PERPETUAL+SW SUBSC", "PERPETUO")):
        if sheet not in xl.sheet_names:
            continue

        df = pd.read_excel(path, sheet_name=sheet)
        erp_col = resolve_column(df.columns, "ERP Price", "ERP")
        pid_col = resolve_column(df.columns, "ProductId")
        sid_col = resolve_column(df.columns, "SkuId")
        name_col = resolve_column(df.columns, "SkuTitle")
        term_col = resolve_column(df.columns, "TermDuration")
        billing_col = resolve_column(df.columns, "BillingPlan")
        price_col = resolve_column(df.columns, "UnitPrice")
        segment_col = resolve_column(df.columns, "Segment")

        for _, row in df.iterrows():
            name = safe_str(row.get(name_col))
            price = safe_float(row.get(price_col, 0))

            if not name or price == 0:
                continue

            product_id = safe_str(row.get(pid_col))
            sku_id = safe_str(row.get(sid_col))

            append_product(
                distributor="INTCOMEX",
                product_type=product_type,
                part_number=f"{product_id}:{sku_id}" if product_id else sku_id,
                name=name,
                term=safe_str(row.get(term_col)) or "OneTime",
                billing=safe_str(row.get(billing_col)) or ("OneTime" if product_type == "PERPETUO" else ""),
                price=price,
                erp=safe_float(row.get(erp_col, 0)),
                segment=safe_str(row.get(segment_col)),
            )
            count += 1

    print(f"  INTCOMEX: {count} productos")


def extract_ingram(path):
    xl = pd.ExcelFile(path)
    count = 0
    sheet_map = {
        "Microsoft NCE (Excluido IVA)": {
            "type": "NCE",
            "header_row": 4,
            "name_candidates": ("Connect SKU Title", "SkuTitle"),
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

    for sheet, config in sheet_map.items():
        if sheet not in xl.sheet_names:
            continue

        df = pd.read_excel(path, sheet_name=sheet, header=config["header_row"])
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

            append_product(
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
            count += 1

    print(f"  INGRAM: {count} productos")


if __name__ == "__main__":
    print("Extrayendo datos...")
    lol_path = FILES["LOL"]
    int_path = FILES["INTCOMEX"]
    ing_path = FILES["INGRAM"]

    if not os.path.exists("data"):
        print("  Carpeta data/ no encontrada. Usando rutas hardcoded.")
        lol_path = "Lista_de_precios_Marzo_2026-LOL.xlsx"
        int_path = "Lista_de_precios_Marzo_2026-INTCOMEX.xlsx"
        ing_path = "Lista_de_precios_Marzo_2026-INGRAM.xlsx"

    if os.path.exists(lol_path):
        extract_lol(lol_path)
    if os.path.exists(int_path):
        extract_intcomex(int_path)
    if os.path.exists(ing_path):
        extract_ingram(ing_path)

    with open(OUTPUT, "w", encoding="utf-8") as file_obj:
        json.dump(all_products, file_obj, ensure_ascii=False, separators=(",", ":"))

    print(f"\n{len(all_products)} productos guardados en {OUTPUT}")
    for distributor, count in Counter(product["distributor"] for product in all_products).items():
        print(f"   {distributor}: {count}")
