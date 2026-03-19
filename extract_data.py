#!/usr/bin/env python3
"""
extract_data.py — Genera products.json desde los Excel de mayoristas
Uso: python3 extract_data.py
"""

import pandas as pd
import json
import os

OUTPUT = 'products.json'

FILES = {
    'LOL':      'data/Lista de precios Marzo 2026-LOL.xlsx',
    'INTCOMEX': 'data/Lista de precios Marzo 2026-INTCOMEX.xlsx',
    'INGRAM':   'data/Lista de precios Marzo 2026-INGRAM.xlsx',
}

all_products = []

def safe_float(v):
    try:
        f = float(v)
        return 0.0 if (f != f) else f  # nan check
    except:
        return 0.0

def safe_str(v):
    if v is None or (isinstance(v, float) and v != v):
        return ''
    return str(v).strip()

# ─── LOL ───────────────────────────────────────────────────────────────────
def extract_lol(path):
    xl = pd.ExcelFile(path)
    count = 0
    for sheet, tipo in [('NCE','NCE'), ('SUSCRIPCION','SUSCRIPCION'), ('PERPETUO','PERPETUO')]:
        if sheet not in xl.sheet_names:
            continue
        df = pd.read_excel(path, sheet_name=sheet)
        erp_col = 'ERP Price' if 'ERP Price' in df.columns else 'ERP'
        for _, r in df.iterrows():
            name = safe_str(r.get('SkuTitle'))
            price = safe_float(r.get('PARTNER PRICE', 0))
            if not name or price == 0:
                continue
            term = safe_str(r.get('TermDuration', 'OneTime'))
            all_products.append({
                'distributor': 'LOL',
                'type': tipo,
                'partNumber': safe_str(r.get('NUMERO DE PARTE')),
                'name': name,
                'term': term if term else 'OneTime',
                'billing': safe_str(r.get('BillingPlan', 'OneTime')),
                'price': price,
                'erp': safe_float(r.get(erp_col, 0)),
                'segment': safe_str(r.get('Segment')),
            })
            count += 1
    print(f'  LOL: {count} productos')

# ─── INTCOMEX ───────────────────────────────────────────────────────────────
def extract_intcomex(path):
    xl = pd.ExcelFile(path)
    count = 0
    for sheet, tipo in [('NCE','NCE'), ('PERPETUAL+SW SUBSC','PERPETUO')]:
        if sheet not in xl.sheet_names:
            continue
        df = pd.read_excel(path, sheet_name=sheet)
        erp_col = 'ERP Price' if 'ERP Price' in df.columns else 'ERP'
        for _, r in df.iterrows():
            name = safe_str(r.get('SkuTitle'))
            price = safe_float(r.get('UnitPrice', 0))
            if not name or price == 0:
                continue
            pid = safe_str(r.get('ProductId', ''))
            sid = safe_str(r.get('SkuId', ''))
            term = safe_str(r.get('TermDuration', 'OneTime'))
            all_products.append({
                'distributor': 'INTCOMEX',
                'type': tipo,
                'partNumber': f'{pid}:{sid}' if pid else sid,
                'name': name,
                'term': term if term else 'OneTime',
                'billing': safe_str(r.get('BillingPlan', 'OneTime')),
                'price': price,
                'erp': safe_float(r.get(erp_col, 0)),
                'segment': safe_str(r.get('Segment')),
            })
            count += 1
    print(f'  INTCOMEX: {count} productos')

# ─── INGRAM ─────────────────────────────────────────────────────────────────
def extract_ingram(path):
    xl = pd.ExcelFile(path)
    count = 0
    sheet_map = {
        'Microsoft NCE (Excluido IVA)': ('NCE', 4, 'Connect SKU Title', 'MPN ID', 'Permanencia', 'Facturación'),
        'MSFT SW SUBS (Excluido IVA) ': ('SUSCRIPCION', 4, 'SkuTitle', 'MPN ID', 'Permanencia', 'BillingPlan'),
        'MSFT SW PERP (+IVA) ':         ('PERPETUO', 4, 'SkuTitle', 'VPN', None, None),
        'MSFT OV OVS S   ':             ('PERPETUO', 4, 'Item Name', 'Part Number', None, None),
    }
    for sheet, (tipo, hrow, name_col, pn_col, term_col, bill_col) in sheet_map.items():
        if sheet not in xl.sheet_names:
            continue
        df = pd.read_excel(path, sheet_name=sheet, header=hrow)
        # find actual name column
        actual_name = name_col if name_col in df.columns else (list(df.columns)[2] if len(df.columns) > 2 else None)
        if not actual_name:
            continue
        for _, r in df.iterrows():
            name = safe_str(r.get(actual_name))
            price = safe_float(r.get('Precio Unitario Canal', 0))
            if not name or price == 0:
                continue
            term = safe_str(r.get(term_col, 'OneTime')) if term_col and term_col in df.columns else 'OneTime'
            billing = safe_str(r.get(bill_col, 'OneTime')) if bill_col and bill_col in df.columns else 'OneTime'
            all_products.append({
                'distributor': 'INGRAM',
                'type': tipo,
                'partNumber': safe_str(r.get(pn_col, '')) if pn_col and pn_col in df.columns else '',
                'name': name,
                'term': term if term else 'OneTime',
                'billing': billing if billing else 'OneTime',
                'price': price,
                'erp': 0.0,
                'segment': safe_str(r.get('Segment', '')),
            })
            count += 1
    print(f'  INGRAM: {count} productos')

# ─── MAIN ───────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print('Extrayendo datos...')
    lol_path = FILES['LOL']
    int_path = FILES['INTCOMEX']
    ing_path = FILES['INGRAM']

    # Use uploaded files if data/ folder doesn't exist
    if not os.path.exists('data'):
        print('  ⚠️  Carpeta data/ no encontrada. Usando rutas hardcoded.')
        lol_path = 'Lista_de_precios_Marzo_2026-LOL.xlsx'
        int_path = 'Lista_de_precios_Marzo_2026-INTCOMEX.xlsx'
        ing_path = 'Lista_de_precios_Marzo_2026-INGRAM.xlsx'

    if os.path.exists(lol_path): extract_lol(lol_path)
    if os.path.exists(int_path): extract_intcomex(int_path)
    if os.path.exists(ing_path): extract_ingram(ing_path)

    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(all_products, f, ensure_ascii=False, separators=(',',':'))

    print(f'\n✅ {len(all_products)} productos guardados en {OUTPUT}')
    by_dist = {}
    for p in all_products:
        by_dist[p['distributor']] = by_dist.get(p['distributor'], 0) + 1
    for d, c in by_dist.items():
        print(f'   {d}: {c}')
