from pathlib import Path

import pandas as pd

from extractors.common import (
    canonicalize_billing,
    canonicalize_term,
    get_canonical_product_name,
    get_strict_period_key,
    normalize_name_text,
    resolve_column,
    safe_float,
    safe_str,
)

FILES = {
    "LOL": "data/Lista de precios Marzo 2026-LOL.xlsx",
    "INTCOMEX": "data/Lista de precios Marzo 2026-INTCOMEX.xlsx",
    "INGRAM": "data/Lista de precios Marzo 2026-INGRAM.xlsx",
}


def build_cloud_product(distributor, product_type, part_number, name, term, billing, price, erp, segment):
    clean_name = normalize_name_text(name)
    clean_part_number = safe_str(part_number)
    clean_term = safe_str(term)
    clean_billing = safe_str(billing)
    clean_segment = safe_str(segment)

    normalized_term = canonicalize_term(clean_term, clean_part_number, clean_name)
    normalized_billing = canonicalize_billing(clean_billing, clean_part_number, clean_name)

    return {
        "area": "cloud",
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


def extract_lol(path):
    items = []
    xl = pd.ExcelFile(path)

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


def extract_intcomex(path):
    items = []
    xl = pd.ExcelFile(path)

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

            items.append(
                build_cloud_product(
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
            )

    return items


def extract_ingram(path):
    items = []
    xl = pd.ExcelFile(path)
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

    file_map = {key: root_dir / relative_path for key, relative_path in FILES.items()}

    if file_map["LOL"].exists():
        catalog.extend(extract_lol(file_map["LOL"]))

    if file_map["INTCOMEX"].exists():
        catalog.extend(extract_intcomex(file_map["INTCOMEX"]))

    if file_map["INGRAM"].exists():
        catalog.extend(extract_ingram(file_map["INGRAM"]))

    return catalog
