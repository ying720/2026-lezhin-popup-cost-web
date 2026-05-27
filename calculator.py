import json
import math
from pathlib import Path
from typing import Any, Dict, List


BASE_DIR = Path(__file__).resolve().parent
CATALOG_PATH = BASE_DIR / "data" / "products.json"


def load_catalog(path: Path = CATALOG_PATH) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _to_number(value: Any, default: float = 0.0) -> float:
    try:
        if value in (None, ""):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_int(value: Any, default: int = 0) -> int:
    try:
        if value in (None, ""):
            return default
        return max(0, int(float(value)))
    except (TypeError, ValueError):
        return default


def _event_meta(catalog: Dict[str, Any], event_name: str) -> Dict[str, Any]:
    for event in catalog.get("events", []):
        if event.get("name") == event_name:
            return event
    return {}


def estimate_rewards(event_name: str, currency: str, subtotal_original: float) -> List[Dict[str, Any]]:
    """依照 Excel 裡看得到的滿額文字做保守估算；實際以官方公告為準。"""
    rewards: List[Dict[str, Any]] = []

    if "SPAKLZ 2026 WORLD TOUR 台北場" in event_name or "0606-0621" in event_name:
        rewards.append({
            "label": "NT$1,000 滿贈 Skinship 明信片",
            "count": 1 if subtotal_original >= 1000 else 0,
            "note": "Excel 備註寫每人每日入場限兌換 1 張，不累贈。"
        })
        rewards.append({
            "label": "NT$2,000 滿贈小卡",
            "count": int(subtotal_original // 1000) if subtotal_original >= 2000 else 0,
            "note": "Excel 備註寫 2,000 贈 2 張，其後每滿 1,000 再贈 1 張。"
        })
    elif "韓國" in event_name:
        rewards.append({
            "label": "₩50,000 滿贈親密互動畫面相卡",
            "count": 1 if subtotal_original >= 50000 else 0,
            "note": "Excel 備註寫線下每人每場最多 1 張。"
        })
        rewards.append({
            "label": "₩100,000 滿贈透卡＋小卡組",
            "count": min(7, int(subtotal_original // 100000)),
            "note": "Excel 備註寫可累贈，每人每場上限 70 萬韓幣，也就是最多 7 組。"
        })
    elif "白夜" in event_name:
        rewards.append({
            "label": "每消費滿 NT$1,000 贈滿額小卡",
            "count": int(subtotal_original // 1000),
            "note": "白夜滿額禮：每消費滿 1,000 元贈 1 張滿額小卡，可累積贈送。"
        })

    return rewards


def calculate_summary(catalog: Dict[str, Any], payload: Dict[str, Any]) -> Dict[str, Any]:
    event_name = payload.get("event") or (catalog.get("events") or [{}])[0].get("name")
    products = catalog.get("products_by_event", {}).get(event_name, [])
    meta = _event_meta(catalog, event_name)
    currency = meta.get("currency") or (products[0].get("currency") if products else "TWD")

    default_rate = _to_number(meta.get("default_exchange_rate"), 1.0)
    exchange_rate = _to_number(payload.get("exchange_rate"), default_rate)
    if exchange_rate <= 0:
        exchange_rate = default_rate or 1.0

    quantities = payload.get("quantities") or {}

    selected_items = []
    subtotal_original = 0.0
    warnings = []

    for p in products:
        pid = p.get("id")
        qty = _to_int(quantities.get(pid, p.get("default_qty", 0)))
        if qty <= 0:
            continue

        price = _to_number(p.get("price"))
        line_total = price * qty
        subtotal_original += line_total

        limit = p.get("limit")
        if isinstance(limit, int) and limit > 0 and qty > limit:
            warnings.append(f"{p.get('item')} {p.get('variant') or ''} 數量 {qty} 可能超過官方備註限購 {limit}。")

        selected_items.append({
            "id": pid,
            "item": p.get("item"),
            "variant": p.get("variant"),
            "price": price,
            "qty": qty,
            "line_total": line_total,
            "currency": currency,
            "note": p.get("note"),
            "limit": limit
        })

    subtotal_twd = subtotal_original * exchange_rate

    extras_input = payload.get("extras") or {}
    extras = {
        "交通費": _to_number(extras_input.get("transport")),
        "餐飲費": _to_number(extras_input.get("food")),
        "住宿費": _to_number(extras_input.get("lodging")),
        "入場/票券": _to_number(extras_input.get("ticket")),
        "代購/服務費": _to_number(extras_input.get("proxy_fee")),
        "付款/轉帳手續費": _to_number(extras_input.get("payment_fee")),
        "其他雜費": _to_number(extras_input.get("other")),
    }

    service_rate_percent = _to_number(extras_input.get("service_rate_percent"))
    service_rate_amount = subtotal_twd * service_rate_percent / 100
    if service_rate_amount:
        extras[f"商品金額加成 {service_rate_percent:g}%"] = service_rate_amount

    extras_total = sum(extras.values())

    reserve_rate_percent = _to_number(extras_input.get("reserve_rate_percent"), 0)
    reserve_amount = (subtotal_twd + extras_total) * reserve_rate_percent / 100

    grand_total_twd = subtotal_twd + extras_total + reserve_amount
    cash_suggestion = math.ceil(grand_total_twd / 100) * 100 if grand_total_twd > 0 else 0

    budget = _to_number(payload.get("budget"))
    remaining = budget - grand_total_twd if budget > 0 else None

    return {
        "event": event_name,
        "currency": currency,
        "exchange_rate": exchange_rate,
        "selected_count": len(selected_items),
        "subtotal_original": round(subtotal_original, 2),
        "subtotal_twd": round(subtotal_twd),
        "extras": {k: round(v) for k, v in extras.items()},
        "extras_total": round(extras_total),
        "reserve_rate_percent": reserve_rate_percent,
        "reserve_amount": round(reserve_amount),
        "grand_total_twd": round(grand_total_twd),
        "cash_suggestion": round(cash_suggestion),
        "budget": round(budget) if budget > 0 else 0,
        "remaining": round(remaining) if remaining is not None else None,
        "selected_items": selected_items,
        "warnings": warnings,
        "rewards": estimate_rewards(event_name, currency, subtotal_original),
    }
