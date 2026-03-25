import json
import re
import unicodedata
from pathlib import Path

NAME_SPACE_RE = re.compile(r"\s+")


def safe_float(value):
    try:
        parsed = float(value)
        return 0.0 if parsed != parsed else parsed
    except (TypeError, ValueError):
        return 0.0


def safe_int(value):
    return int(round(safe_float(value)))


def safe_str(value):
    if value is None:
        return ""

    if isinstance(value, float) and value != value:
        return ""

    return str(value).strip()


def normalize_text(value):
    return safe_str(value).lower()


def normalize_header(value):
    normalized = unicodedata.normalize("NFKD", safe_str(value))
    normalized = normalized.encode("ascii", "ignore").decode("ascii")
    normalized = normalized.replace("\u00a0", " ")
    return NAME_SPACE_RE.sub(" ", normalized).strip().lower()


def resolve_column(columns, *candidates):
    normalized_columns = {normalize_header(column): column for column in columns}

    for candidate in candidates:
        normalized_candidate = normalize_header(candidate)
        if normalized_candidate in normalized_columns:
            return normalized_columns[normalized_candidate]

    return None


def normalize_name_text(value):
    normalized = safe_str(value).replace("\u00a0", " ")
    for dash_variant in ("ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“", "Ã¢â‚¬â€œ", "â€“", "–"):
        normalized = normalized.replace(dash_variant, "-")
    return NAME_SPACE_RE.sub(" ", normalized).strip()


def has_any_suffix(value, suffixes):
    return any(value.endswith(suffix) for suffix in suffixes)


def get_canonical_product_name(value):
    normalized = normalize_name_text(value)
    normalized = re.sub(r"\s+\((?:NCE|CSP)[^)]+\)$", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(r"\s+NCE\s+[A-Z]{3}\s+(?:ANN|MTH|TRI)$", "", normalized, flags=re.IGNORECASE)
    normalized = re.sub(
        r"\s*-\s*(?:1|3)\s*year(?:\s+subscription)?$",
        "",
        normalized,
        flags=re.IGNORECASE,
    )
    normalized = re.sub(
        r"\s+(?:1|3)\s*year(?:\s+subscription)?$",
        "",
        normalized,
        flags=re.IGNORECASE,
    )
    normalized = re.sub(r"\s*-\s*$", "", normalized)
    return NAME_SPACE_RE.sub(" ", normalized).strip()


def canonicalize_term(term, part_number, name):
    normalized_term = normalize_text(term)
    normalized_part = normalize_text(part_number)
    normalized_name = normalize_text(normalize_name_text(name))

    if has_any_suffix(normalized_part, ("p3yt", "p3ya", "p3ym", ":p3y")):
        return "trianual"

    if has_any_suffix(normalized_part, ("p1ya", "p1ym", ":p1y")):
        return "anual"

    if has_any_suffix(normalized_part, ("p1mm", ":p1m")):
        return "mensual"

    if (
        "p3y" in normalized_term
        or "trianual" in normalized_term
        or "trien" in normalized_term
        or re.search(r"3\s*year", normalized_name)
    ):
        return "trianual"

    if "p1y" in normalized_term or "anual" in normalized_term or re.search(r"1\s*year", normalized_name):
        return "anual"

    if "p1m" in normalized_term or "mensual" in normalized_term or "month" in normalized_term:
        return "mensual"

    if "onetime" in normalized_term or "one time" in normalized_term:
        return "onetime"

    return ""


def canonicalize_billing(billing, part_number, name):
    normalized_billing = normalize_text(billing)
    normalized_part = normalize_text(part_number)
    normalized_name = normalize_text(normalize_name_text(name))

    if has_any_suffix(normalized_part, ("p3yt",)):
        return "trianual"

    if has_any_suffix(normalized_part, ("p3ya", "p1ya")):
        return "anual"

    if has_any_suffix(normalized_part, ("p3ym", "p1ym", "p1mm", ":p1m")):
        return "mensual"

    if re.search(r"\b(?:nce|csp)\s+(?:com|edu|nfp)\s+tri\b|\((?:nce|csp)\s+(?:com|edu|nfp)\s+tri\)", normalized_name):
        return "trianual"

    if re.search(r"\b(?:nce|csp)\s+(?:com|edu|nfp)\s+ann\b|\((?:nce|csp)\s+(?:com|edu|nfp)\s+ann\)", normalized_name):
        return "anual"

    if re.search(r"\b(?:nce|csp)\s+(?:com|edu|nfp)\s+mth\b|\((?:nce|csp)\s+(?:com|edu|nfp)\s+mth\)", normalized_name):
        return "mensual"

    if "trien" in normalized_billing or "trianual" in normalized_billing:
        return "trianual"

    if "annual" in normalized_billing or "anual" in normalized_billing:
        return "anual"

    if "monthly" in normalized_billing or "mensual" in normalized_billing:
        return "mensual"

    if "onetime" in normalized_billing or "one time" in normalized_billing:
        return "onetime"

    return ""


def get_strict_period_key(normalized_term, normalized_billing):
    combo = f"{normalized_term}|{normalized_billing}"
    strict_map = {
        "mensual|mensual": "mensual_mensual",
        "anual|anual": "anual_anual",
        "anual|mensual": "anual_mensual",
        "trianual|anual": "trianual_anual",
        "trianual|trianual": "trianual_trianual",
        "trianual|mensual": "trianual_mensual",
        "onetime|onetime": "onetime_onetime",
    }
    return strict_map.get(combo, "")


def ensure_directory(path):
    Path(path).mkdir(parents=True, exist_ok=True)


def dump_json(path, payload):
    output_path = Path(path)
    ensure_directory(output_path.parent)
    with output_path.open("w", encoding="utf-8") as file_obj:
        json.dump(payload, file_obj, ensure_ascii=False, separators=(",", ":"))


def parse_localized_number(value):
    text = safe_str(value).replace(" ", "")
    if not text:
        return 0.0

    if "," in text and "." in text:
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
        return safe_float(text)

    if "," in text:
        if re.search(r",\d{1,2}$", text):
            return safe_float(text.replace(".", "").replace(",", "."))
        return safe_float(text.replace(",", ""))

    if "." in text:
        if re.search(r"\.\d{1,2}$", text):
            return safe_float(text.replace(",", ""))
        return safe_float(text.replace(".", ""))

    return safe_float(text)


def parse_price_cell(value):
    price_text = safe_str(value)
    if not price_text:
        return {"price": 0.0, "currency": "", "priceText": ""}

    match = re.match(r"^([A-Za-z$]{2,4})\s*(.+)$", price_text)
    if match:
        currency = match.group(1).upper()
        raw_amount = match.group(2)
    else:
        currency = ""
        raw_amount = price_text

    return {
        "price": parse_localized_number(raw_amount),
        "currency": currency,
        "priceText": price_text,
    }
