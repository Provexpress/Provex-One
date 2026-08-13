from pathlib import Path
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
            name_lower = path.name.lower()
            if "perpetual" in name_lower or "perpetuo" in name_lower:
                sheet_types.append(("Lista de precios", "PERPETUO"))
            else:
                sheet_types.append(("Lista de precios", "NCE"))

        for sheet, product_type in sheet_types:
            if sheet not in xl.sheet_names:
                continue

            df = pd.read_excel(readable_path, sheet_name=sheet)
            erp_col = resolve_column(df.columns, "ERP Price", "ERP")
            part_col = resolve_column(df.columns, "NUMERO DE PARTE", "Numero Parte", "Part Number")
            name_col = resolve_column(df.columns, "SkuTitle", "Descripción", "Descripcion")
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


def build_cloud_catalog(base_dir=None):
    root_dir = Path(base_dir or Path(__file__).resolve().parent.parent)
    catalog = []

    data_dir = root_dir / "data"
    lol_files = list(data_dir.glob("*LOL.xlsx"))
    
    ago_files = [f for f in lol_files if "AGO26" in f.name.upper()]
    if ago_files:
        target_files = ago_files
    else:
        if lol_files:
            target_files = sorted(lol_files, key=lambda f: f.stat().st_mtime)[-1:]
        else:
            target_files = []

    for f in target_files:
        catalog.extend(extract_lol(f))

    return catalog
