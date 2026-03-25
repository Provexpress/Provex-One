from pathlib import Path

import pandas as pd

from extractors.common import normalize_location_label, readable_excel_path, resolve_column, safe_int, safe_str

FILE_PATH = "data/Cisco Ingram.xlsx"


def derive_cisco_family(description, part_number):
    normalized_description = safe_str(description).lower()
    normalized_part = safe_str(part_number).upper()

    if normalized_part.startswith("CON-"):
        return "Servicios"

    if "catalyst" in normalized_description or "switch" in normalized_description:
        return "Switching"

    if "router" in normalized_description:
        return "Routing"

    if "wireless" in normalized_description or "wifi" in normalized_description:
        return "Wireless"

    return "General"


def build_networking_cisco_catalog(base_dir=None):
    root_dir = Path(base_dir or Path(__file__).resolve().parent.parent)
    source_path = root_dir / FILE_PATH
    if not source_path.exists():
        return []

    items = []
    with readable_excel_path(source_path) as readable_path:
        df = pd.read_excel(readable_path, sheet_name=0)
        material_col = resolve_column(df.columns, "Material")
        sku_col = resolve_column(df.columns, "Numero de Parte", "NÃºmero de Parte")
        description_col = resolve_column(df.columns, "Descripcion", "DescripciÃ³n")
        stock_col = resolve_column(df.columns, "Qty en Stock")
        availability_col = resolve_column(df.columns, "Disponibilidad")
        link_col = resolve_column(df.columns, "Compra ahora en Xvantage!")

        for _, row in df.iterrows():
            sku = safe_str(row.get(sku_col))
            description = safe_str(row.get(description_col))
            if not sku or not description:
                continue

            family = derive_cisco_family(description, sku)
            item_type = "Servicio" if safe_str(sku).upper().startswith("CON-") else "Hardware"

            items.append(
                {
                    "area": "networking",
                    "brand": "Cisco",
                    "source": "INGRAM",
                    "sheet": "Hoja1",
                    "material": safe_str(row.get(material_col)),
                    "sku": sku,
                    "family": family,
                    "type": item_type,
                    "stock": safe_int(row.get(stock_col)),
                    "availability": safe_str(row.get(availability_col)),
                    "location": normalize_location_label("COLOMBIA"),
                    "leadTime": safe_str(row.get(availability_col)),
                    "description": description,
                    "buyUrl": safe_str(row.get(link_col)),
                    "searchText": " ".join(
                        filter(
                            None,
                            [
                                "cisco",
                                family.lower(),
                                item_type.lower(),
                                safe_str(row.get(material_col)).lower(),
                                sku.lower(),
                                description.lower(),
                            ],
                        )
                    ),
                }
            )

    return items
