from pathlib import Path


def build_networking_aruba_catalog(base_dir=None):
    root_dir = Path(base_dir or Path(__file__).resolve().parent.parent)
    aruba_files = sorted((root_dir / "data").glob("*Aruba*.xlsx"))
    if not aruba_files:
        return []

    # Base scaffold for future Aruba extractor.
    return []
