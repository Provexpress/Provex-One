from pathlib import Path

import pandas as pd

from extractors.common import resolve_column, safe_int, safe_str

FILE_PATH = "data/Inventario Fortinet - TD SYNNEX.xlsx"


def build_networking_fortinet_catalog(base_dir=None):
    root_dir = Path(base_dir or Path(__file__).resolve().parent.parent)
    source_path = root_dir / FILE_PATH
    if not source_path.exists():
        return []

    xl = pd.ExcelFile(source_path)
    items = []

    for sheet_name in xl.sheet_names:
        header_preview = pd.read_excel(source_path, sheet_name=sheet_name, header=None, nrows=1)
        lead_time = safe_str(header_preview.iat[0, 0]) if not header_preview.empty else ""
        df = pd.read_excel(source_path, sheet_name=sheet_name, header=2)

        location_col = resolve_column(df.columns, "Ubicación", "Ubicacion")
        type_col = resolve_column(df.columns, "TIPO")
        family_col = resolve_column(df.columns, "FAMILIA")
        sku_col = resolve_column(df.columns, "SKU")
        stock_col = resolve_column(df.columns, "Unidades Disp.")
        description_col = resolve_column(df.columns, "Descripción", "Descripcion")

        for _, row in df.iterrows():
            sku = safe_str(row.get(sku_col))
            description = safe_str(row.get(description_col))
            if not sku or not description:
                continue

            location = safe_str(row.get(location_col))
            item_type = safe_str(row.get(type_col))
            family = safe_str(row.get(family_col))

            items.append(
                {
                    "area": "networking",
                    "brand": "Fortinet",
                    "source": "TD SYNNEX",
                    "sheet": sheet_name,
                    "material": "",
                    "sku": sku,
                    "family": family,
                    "type": item_type,
                    "stock": safe_int(row.get(stock_col)),
                    "price": 0.0,
                    "currency": "",
                    "priceText": "",
                    "availability": lead_time,
                    "location": location,
                    "leadTime": lead_time,
                    "description": description,
                    "buyUrl": "",
                    "searchText": " ".join(
                        filter(
                            None,
                            [
                                "fortinet",
                                sheet_name.lower(),
                                location.lower(),
                                item_type.lower(),
                                family.lower(),
                                sku.lower(),
                                description.lower(),
                            ],
                        )
                    ),
                }
            )

    return items
