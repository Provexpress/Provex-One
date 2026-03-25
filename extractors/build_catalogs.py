from collections import Counter
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from extractors.cloud_microsoft import build_cloud_catalog
from extractors.common import dump_json
from extractors.networking_aruba import build_networking_aruba_catalog
from extractors.networking_cisco import build_networking_cisco_catalog
from extractors.networking_fortinet import build_networking_fortinet_catalog


def build_manifest(cloud_catalog, networking_catalog):
    return {
        "areas": [
            {
                "id": "cloud",
                "label": "Cloud",
                "kind": "comparison",
                "catalog": "cloud_products.json",
                "records": len(cloud_catalog),
            },
            {
                "id": "networking",
                "label": "Networking",
                "kind": "inventory",
                "catalog": "networking_inventory.json",
                "records": len(networking_catalog),
                "brands": sorted({item["brand"] for item in networking_catalog}),
            },
        ]
    }


def main():
    catalogs_dir = ROOT_DIR / "catalogs"
    cloud_catalog = build_cloud_catalog(ROOT_DIR)
    networking_catalog = []
    networking_catalog.extend(build_networking_cisco_catalog(ROOT_DIR))
    networking_catalog.extend(build_networking_fortinet_catalog(ROOT_DIR))
    networking_catalog.extend(build_networking_aruba_catalog(ROOT_DIR))

    networking_catalog.sort(
        key=lambda item: (
            item.get("brand", ""),
            item.get("family", ""),
            item.get("sku", ""),
        )
    )

    manifest = build_manifest(cloud_catalog, networking_catalog)

    dump_json(catalogs_dir / "cloud_products.json", cloud_catalog)
    dump_json(catalogs_dir / "networking_inventory.json", networking_catalog)
    dump_json(catalogs_dir / "catalog_manifest.json", manifest)

    # Keep compatibility with the current cloud app while the frontend migrates.
    dump_json(ROOT_DIR / "products.json", cloud_catalog)

    print("Catalogos generados:")
    print(f"  Cloud: {len(cloud_catalog)} registros")
    print(f"  Networking: {len(networking_catalog)} registros")
    print(f"  Productos root compatibles: {len(cloud_catalog)} registros")

    by_brand = Counter(item["brand"] for item in networking_catalog)
    if by_brand:
        print("  Networking por marca:")
        for brand, count in sorted(by_brand.items()):
            print(f"    {brand}: {count}")


if __name__ == "__main__":
    main()
