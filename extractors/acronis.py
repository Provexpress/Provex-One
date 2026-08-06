"""Extract the Acronis calculator catalog from its XLSX source.

The workbook is Open XML, so this extractor intentionally uses only Python's
standard library. It keeps the web calculator data auditable and makes future
monthly price updates repeatable without depending on Excel being installed.
"""

from __future__ import annotations

from collections import defaultdict
from pathlib import Path
import re
import xml.etree.ElementTree as ET
import zipfile

from extractors.common import dump_json


ROOT_DIR = Path(__file__).resolve().parent.parent
CATALOG_PATH = ROOT_DIR / "catalogs" / "acronis_products.json"
MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
CELL_REF_RE = re.compile(r"([A-Z]+)")
SPACE_RE = re.compile(r"\s+")


def _cell_column(reference: str) -> int:
    letters = CELL_REF_RE.match(reference).group(1)
    value = 0
    for letter in letters:
        value = value * 26 + ord(letter) - 64
    return value - 1


def _clean_text(value) -> str:
    return SPACE_RE.sub(" ", str(value or "").replace("\u00a0", " ")).strip()


def _lookup_key(value) -> str:
    return _clean_text(value).casefold()


class XlsxReader:
    def __init__(self, path: Path):
        self.archive = zipfile.ZipFile(path)
        self.shared_strings = self._read_shared_strings()
        self.sheet_paths = self._read_sheet_paths()

    def close(self):
        self.archive.close()

    def _xml(self, name: str):
        return ET.fromstring(self.archive.read(name))

    def _read_shared_strings(self):
        try:
            root = self._xml("xl/sharedStrings.xml")
        except KeyError:
            return []

        strings = []
        for item in root.findall(f"{{{MAIN_NS}}}si"):
            strings.append("".join(node.text or "" for node in item.iter(f"{{{MAIN_NS}}}t")))
        return strings

    def _read_sheet_paths(self):
        workbook = self._xml("xl/workbook.xml")
        relationships = self._xml("xl/_rels/workbook.xml.rels")
        relation_targets = {
            relation.attrib["Id"]: relation.attrib["Target"]
            for relation in relationships.findall(f"{{{PKG_REL_NS}}}Relationship")
        }
        result = {}
        for sheet in workbook.findall(f".//{{{MAIN_NS}}}sheet"):
            target = relation_targets[sheet.attrib[f"{{{REL_NS}}}id"]].lstrip("/")
            if not target.startswith("xl/"):
                target = f"xl/{target}"
            result[sheet.attrib["name"]] = target
        return result

    def rows(self, sheet_name: str):
        root = self._xml(self.sheet_paths[sheet_name])
        parsed_rows = []
        for row in root.findall(f".//{{{MAIN_NS}}}sheetData/{{{MAIN_NS}}}row"):
            values = {}
            for cell in row.findall(f"{{{MAIN_NS}}}c"):
                column = _cell_column(cell.attrib["r"])
                value_node = cell.find(f"{{{MAIN_NS}}}v")
                value = value_node.text if value_node is not None else ""
                cell_type = cell.attrib.get("t")
                if cell_type == "s" and value != "":
                    value = self.shared_strings[int(value)]
                elif cell_type == "inlineStr":
                    value = "".join(
                        node.text or "" for node in cell.iter(f"{{{MAIN_NS}}}t")
                    )
                elif cell_type not in {"str", "b"} and value != "":
                    try:
                        value = float(value)
                        if value.is_integer():
                            value = int(value)
                    except ValueError:
                        pass
                values[column] = value
            parsed_rows.append((int(row.attrib["r"]), values))
        return parsed_rows


def _find_source(root_dir: Path) -> Path:
    candidates = sorted(
        root_dir.glob("Calculadora Acronis*.xlsx"),
        key=lambda item: item.stat().st_mtime,
        reverse=True,
    )
    if not candidates:
        raise FileNotFoundError("No se encontro un archivo 'Calculadora Acronis*.xlsx'.")
    return candidates[0]


def _price_index(rows):
    commitments = []
    prices = defaultdict(dict)
    skus = defaultdict(dict)

    for row_number, cells in rows:
        if row_number == 2:
            commitments = [float(cells.get(column, 0) or 0) for column in range(6, 13)]
            commitments = [int(value) if value.is_integer() else value for value in commitments]
            continue
        if row_number < 3:
            continue

        description = _clean_text(cells.get(14))
        dc_group = _clean_text(cells.get(4))
        if not description or dc_group not in {"All", "G1", "G2"}:
            continue

        tier_prices = [float(cells.get(column, 0) or 0) for column in range(6, 13)]
        key = _lookup_key(description)
        prices[key][dc_group] = tier_prices
        skus[key][dc_group] = _clean_text(cells.get(5))

    return commitments, prices, skus


def _items(rows, prices, skus, start_row, end_row, skipped_rows, prefix):
    items = []
    category = ""
    subcategory = ""

    for row_number, cells in rows:
        if row_number < start_row or row_number > end_row or row_number in skipped_rows:
            continue

        description = _clean_text(cells.get(2))
        if not description:
            continue

        row_category = _clean_text(cells.get(0))
        row_subcategory = _clean_text(cells.get(1))
        if row_category:
            category = row_category
            subcategory = row_subcategory
        elif row_subcategory:
            subcategory = row_subcategory

        key = _lookup_key(description)
        item_prices = prices.get(key, {})
        if not item_prices:
            continue

        note = _clean_text(cells.get(3))
        if note.casefold() == "yes":
            note = "Disponible de forma independiente"
        note = {
            "Requires Security+RMM or Ultimate Protection": "Requiere Security + RMM o Ultimate Protection",
            "Requires BDR or Ultimate Protection": "Requiere BDR o Ultimate Protection",
            "Requires EDR/XDR": "Requiere EDR o XDR",
            "Requires Backup": "Requiere Backup",
        }.get(note, note)

        items.append(
            {
                "id": f"{prefix}-{row_number}",
                "category": category or "Otros",
                "subcategory": subcategory,
                "description": description,
                "note": note,
                "prices": item_prices,
                "skus": skus.get(key, {}),
            }
        )
    return items


def _datacenters(rows):
    groups = {"G1": [], "G2": []}
    for row_number, cells in rows:
        if row_number < 3:
            continue
        group = _clean_text(cells.get(2))
        country = _clean_text(cells.get(3))
        city = _clean_text(cells.get(4))
        if group in groups and city:
            groups[group].append(
                {
                    "label": f"{city}, {country}" if country else city,
                    "city": city,
                    "country": country,
                }
            )
    return groups


def build_acronis_catalog(root_dir: Path = ROOT_DIR):
    source = _find_source(root_dir)
    reader = XlsxReader(source)
    try:
        commitments, prices, skus = _price_index(reader.rows("Pricelist USD"))
        solution = _items(
            reader.rows("Solution-based"), prices, skus, 8, 49, {22, 36}, "solution"
        )
        service = _items(
            reader.rows("Service-based"), prices, skus, 6, 72, {59}, "service"
        )
        datacenters = _datacenters(reader.rows("Cloud DCs"))
    finally:
        reader.close()

    return {
        "source": source.name,
        "currency": "USD",
        "priceList": "C26/09",
        "commitments": commitments,
        "datacenters": datacenters,
        "solution": solution,
        "service": service,
    }


def main():
    catalog = build_acronis_catalog()
    dump_json(CATALOG_PATH, catalog)
    print(
        "Catalogo Acronis generado: "
        f"{len(catalog['solution'])} productos por solucion, "
        f"{len(catalog['service'])} productos por servicio"
    )


if __name__ == "__main__":
    main()
