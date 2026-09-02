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


def build_cloud_product(
    distributor,
    product_type,
    part_number,
    name,
    term,
    billing,
    price,
    erp,
    segment,
    product_id="",
):
    clean_name = normalize_name_text(name)
    clean_part_number = safe_str(part_number)
    clean_product_id = safe_str(product_id)
    clean_term = safe_str(term)
    clean_billing = safe_str(billing)
    clean_segment = safe_str(segment)

    # Exclude Charity / NonProfit products
    seg_upper = clean_segment.upper()
    name_upper = clean_name.upper()
    if (
        "CHARITY" in seg_upper
        or "NONPROFIT" in seg_upper
        or "NFP" in seg_upper
        or "NON-PROFIT" in name_upper
        or "NONPROFIT" in name_upper
    ):
        return None

    # Normalize segment names to Commercial or Education
    if "EDU" in seg_upper or "FACULTY" in seg_upper or "STUDENT" in seg_upper:
        normalized_segment = "Education"
    else:
        normalized_segment = "Commercial"

    if product_type == "PERPETUO":
        clean_term = "OneTime"
        clean_billing = "OneTime"
        normalized_term = "onetime"
        normalized_billing = "onetime"
        strict_period_key = "onetime_onetime"
    else:
        normalized_term = canonicalize_term(clean_term, clean_part_number, clean_name)
        normalized_billing = canonicalize_billing(clean_billing, clean_part_number, clean_name)
        strict_period_key = get_strict_period_key(normalized_term, normalized_billing)

    return {
        "area": "cloud",
        "distributor": distributor,
        "type": product_type,
        "partNumber": clean_part_number,
        "productId": clean_product_id,
        "name": clean_name,
        "term": clean_term,
        "billing": clean_billing,
        "price": price,
        "erp": erp,
        "segment": normalized_segment,
        "canonicalName": get_canonical_product_name(clean_name),
        "normalizedTerm": normalized_term,
        "normalizedBilling": normalized_billing,
        "strictPeriodKey": strict_period_key,
    }


def extract_lol(path):
    items = []
    with readable_excel_path(path) as readable_path:
        xl = pd.ExcelFile(readable_path)
        sheet_names = xl.sheet_names

        for sheet in sheet_names:
            s_lower = sheet.lower()
            df = pd.read_excel(readable_path, sheet_name=sheet)

            erp_col = resolve_column(df.columns, "ERP Price", "ERP", "ERP_Price")
            product_id_col = resolve_column(df.columns, "ProductId", "Product Id", "ProductID")
            part_col = resolve_column(
                df.columns,
                "NUMERO DE PARTE",
                "Numero Parte",
                "Part Number",
                "ProductId",
                "Product Id",
                "ProductID",
            )
            name_col = resolve_column(
                df.columns,
                "SkuTitle",
                "Descripción",
                "Descripcion",
                "Product Title",
                "Title",
                "ProductTitle",
            )
            term_col = resolve_column(df.columns, "TermDuration", "Term")
            billing_col = resolve_column(df.columns, "BillingPlan", "Billing Plan", "Billing")
            price_col = resolve_column(
                df.columns,
                "PARTNER PRICE",
                "Partner Price",
                "UnitPrice",
                "Unit Price",
                "Unit_Price",
                "Price",
            )
            segment_col = resolve_column(df.columns, "Segment")

            # Determine default type from sheet or filename
            default_type = "NCE"
            if "perpetu" in s_lower:
                default_type = "PERPETUO"
            elif "suscrip" in s_lower or "subscript" in s_lower or "software" in s_lower:
                default_type = "SUSCRIPCION"
            elif "nce" in s_lower:
                default_type = "NCE"
            elif "perpetu" in path.name.lower():
                default_type = "SUSCRIPCION"
            else:
                default_type = "NCE"

            for _, row in df.iterrows():
                name = safe_str(row.get(name_col)) if name_col else ""
                price = safe_float(row.get(price_col, 0)) if price_col else 0.0

                if not name or price <= 0:
                    continue

                product_id = safe_str(row.get(product_id_col)) if product_id_col else ""
                part_number = (
                    safe_str(row.get(part_col)) if part_col else product_id
                ) or product_id
                raw_term = safe_str(row.get(term_col)) if term_col else ""
                raw_billing = safe_str(row.get(billing_col)) if billing_col else ""
                raw_segment = safe_str(row.get(segment_col)) if segment_col else ""
                erp = safe_float(row.get(erp_col, 0)) if erp_col else 0.0

                # Fine-grained classification into NCE, SUSCRIPCION (Software Subscriptions), or PERPETUO
                row_type = default_type
                if default_type == "PERPETUO":
                    row_type = "PERPETUO"
                elif "perpetu" in path.name.lower() or "perpetual" in path.name.lower():
                    if raw_billing.lower() == "onetime" or raw_term.lower() == "onetime":
                        row_type = "PERPETUO"
                    else:
                        row_type = "SUSCRIPCION"
                elif "software" in s_lower:
                    row_type = "SUSCRIPCION"
                elif (
                    "server" in name.lower()
                    and ("1 year" in name.lower() or "3 year" in name.lower())
                    and ("azure" in name.lower() or "esu" in name.lower() or "sql" in name.lower())
                ):
                    row_type = "SUSCRIPCION"

                prod = build_cloud_product(
                    distributor="LOL",
                    product_type=row_type,
                    part_number=part_number,
                    name=name,
                    term=raw_term or ("OneTime" if row_type == "PERPETUO" else ""),
                    billing=raw_billing
                    or ("OneTime" if row_type == "PERPETUO" else ""),
                    price=price,
                    erp=erp,
                    segment=raw_segment,
                    product_id=product_id,
                )
                if prod:
                    items.append(prod)

    return items


def build_cloud_catalog(base_dir=None):
    root_dir = Path(base_dir or Path(__file__).resolve().parent.parent)
    catalog = []

    data_dir = root_dir / "data"
    all_excel = [f for f in data_dir.glob("*.xlsx") if not f.name.startswith("~$")]

    # Prefer newest / current month files (SEP26 -> AGO26 -> etc.)
    sep_files = [f for f in all_excel if "SEP26" in f.name.upper() or "SEPTIEMBRE" in f.name.upper()]
    ago_files = [f for f in all_excel if "AGO26" in f.name.upper() or "AGOSTO" in f.name.upper()]

    if sep_files:
        target_files = sep_files
    elif ago_files:
        target_files = ago_files
    else:
        target_files = sorted(all_excel, key=lambda f: f.stat().st_mtime)[-2:] if all_excel else []

    seen_keys = set()
    for f in target_files:
        for item in extract_lol(f):
            key = (
                item["type"],
                item["partNumber"],
                item["normalizedTerm"],
                item["normalizedBilling"],
                item["segment"],
            )
            if key not in seen_keys:
                seen_keys.add(key)
                catalog.append(item)

    return catalog
