#!/usr/bin/env python3
"""
Wrapper compatible para generar todos los catalogos.

Uso:
  uv run --with pandas --with openpyxl python extract_data.py
"""

from extractors.build_catalogs import main


if __name__ == "__main__":
    main()
