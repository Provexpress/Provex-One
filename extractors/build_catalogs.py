from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from extractors.cloud_microsoft import build_cloud_catalog
from extractors.acronis import build_acronis_catalog
from extractors.kaspersky import build_kaspersky_catalog
from extractors.common import dump_json


def build_manifest(cloud_catalog, acronis_catalog, kaspersky_catalog):
    return {
        "areas": [
            {
                "id": "cloud",
                "label": "Licencias Microsoft",
                "kind": "comparison",
                "catalog": "cloud_products.json",
                "records": len(cloud_catalog),
            },
            {
                "id": "acronis",
                "label": "Calculadora Acronis",
                "kind": "calculator",
                "catalog": "acronis_products.json",
                "records": len(acronis_catalog["solution"]) + len(acronis_catalog["service"]),
            },
            {
                "id": "kaspersky",
                "label": "Licencias Kaspersky",
                "kind": "comparison",
                "catalog": "kaspersky_products.json",
                "records": len(kaspersky_catalog),
            },
        ]
    }


def main():
    catalogs_dir = ROOT_DIR / "catalogs"
    cloud_catalog = build_cloud_catalog(ROOT_DIR)
    acronis_catalog = build_acronis_catalog(ROOT_DIR)
    kaspersky_catalog = build_kaspersky_catalog(ROOT_DIR)
    manifest = build_manifest(cloud_catalog, acronis_catalog, kaspersky_catalog)

    dump_json(catalogs_dir / "cloud_products.json", cloud_catalog)
    dump_json(catalogs_dir / "acronis_products.json", acronis_catalog)
    dump_json(catalogs_dir / "kaspersky_products.json", kaspersky_catalog)
    dump_json(catalogs_dir / "catalog_manifest.json", manifest)

    # Keep compatibility with the current cloud app.
    dump_json(ROOT_DIR / "products.json", cloud_catalog)

    print("Catalogos generados:")
    print(f"  Cloud Microsoft: {len(cloud_catalog)} registros")
    print(
        "  Acronis: "
        f"{len(acronis_catalog['solution']) + len(acronis_catalog['service'])} registros"
    )
    print(f"  Kaspersky: {len(kaspersky_catalog)} registros")
    print(f"  Productos root compatibles: {len(cloud_catalog)} registros")


if __name__ == "__main__":
    main()
