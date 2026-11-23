#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Steam 特惠雷达 —— 数据抓取脚本

职责：
  1. 调用 Steam 商店公开 Web API，获取当前「特别优惠」与「深度折扣」游戏；
  2. 规范化为前端易用的结构（价格统一换算为元 / 美元主单位）；
  3. 同时输出 data/specials.json（供外部消费）与 data/specials.js（供页面同步加载）。

设计要点：
  * 纯 Python 标准库实现，无第三方依赖，GitHub Actions 可直接运行；
  * 前端页面通过 <script src="data/specials.js"> 同步加载数据，
    因此不受浏览器 CORS 限制，本地双击 index.html 也能正常展示；
  * 抓取失败时保留上一次成功的数据，不会清空线上页面；
  * 支持多区域（中国区 / 美国区），方便后续扩展比价功能。

用法：
  python3 scripts/fetch_specials.py                  # 抓取全部区域并写入 data/
  python3 scripts/fetch_specials.py --regions CN    # 只抓中国区
  python3 scripts/fetch_specials.py --dry-run       # 只打印结果，不写文件
"""

from __future__ import annotations

import argparse
import html as html_lib
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
JSON_PATH = DATA_DIR / "specials.json"
JS_PATH = DATA_DIR / "specials.js"

FEATURED_API = "https://store.steampowered.com/api/featuredcategories"
SEARCH_API = "https://store.steampowered.com/search/results/"

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0 Safari/537.36 steam-deals-radar/1.0"
)

REGIONS = {
    "CN": {
        "cc": "cn",
        "l": "schinese",
        "currency": "CNY",
        "symbol": "¥",
        "label": "中国区",
    },
    "US": {
        "cc": "us",
        "l": "english",
        "currency": "USD",
        "symbol": "$",
        "label": "美国区",
    },
}

MAX_SEARCH_ITEMS = 45
MAX_TOTAL_ITEMS = 60


# --------------------------------------------------------------------------- #
# 基础工具
# --------------------------------------------------------------------------- #
def http_get(url: str, retries: int = 3, timeout: int = 25) -> str:
    """带重试的 GET，返回响应文本。"""
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept": "application/json, text/html, */*",
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                },
            )
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
            last_error = exc
            if attempt < retries:
                print(f"    · 第 {attempt} 次请求失败（{exc}），2 秒后重试…", file=sys.stderr)
                time.sleep(2)
    raise RuntimeError(f"请求失败：{url} -> {last_error}")


def strip_tags(raw: str) -> str:
    """去掉 HTML 标签并还原实体。"""
    return html_lib.unescape(re.sub(r"<[^>]+>", "", raw)).strip()


def parse_price(raw: str) -> float:
    """从 '¥ 198.00' / '$59.99' 之类的文本里取出数值，单位为主货币（元/美元）。"""
    match = re.search(r"[\d]+(?:[.,]\d+)?", strip_tags(raw).replace(",", ""))
    if not match:
        return 0.0
    return float(match.group(0).replace(",", ""))


def money_from_cents(value) -> float:
    """Steam featuredcategories 的价格单位是「分」，转换为主货币单位。"""
    try:
        return round(float(value) / 100.0, 2)
    except (TypeError, ValueError):
        return 0.0


def store_url(app_id: str, item_type: int = 0) -> str:
    base = "bundle" if str(item_type) == "1" else "app"
    return f"https://store.steampowered.com/{base}/{app_id}/"


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def now_local_label() -> str:
    return datetime.now(timezone(timedelta(hours=8))).strftime("%Y-%m-%d %H:%M (UTC+8)")


# --------------------------------------------------------------------------- #
# 数据源 1：featuredcategories —— 官方「特别优惠」精选，含精确结束时间
# --------------------------------------------------------------------------- #
def fetch_featured(cfg: dict) -> list[dict]:
    query = urllib.parse.urlencode({"cc": cfg["cc"], "l": cfg["l"]})
    payload = json.loads(http_get(f"{FEATURED_API}?{query}"))

    buckets = [payload.get("specials") or {}]
    # 热销榜里也常出现带折扣的商品，一并纳入以丰富列表
    buckets.append(payload.get("top_sellers") or {})

    items: list[dict] = []
    seen: set[str] = set()
    for bucket in buckets:
        for raw in bucket.get("items") or []:
            if not raw.get("discounted"):
                continue
            app_id = str(raw.get("id") or "")
            if not app_id or app_id in seen:
                continue
            seen.add(app_id)
            item_type = int(raw.get("type") or 0)
            image = raw.get("header_image") or raw.get("large_capsule_image") or ""
            items.append(
                {
                    "id": app_id,
                    "name": str(raw.get("name") or "未知游戏"),
                    "discount_percent": int(raw.get("discount_percent") or 0),
                    "original_price": money_from_cents(raw.get("original_price")),
                    "final_price": money_from_cents(raw.get("final_price")),
                    "header_image": image,
                    "store_url": store_url(app_id, item_type),
                    "expires_at": raw.get("discount_expiration") or None,
                    "source": "featured",
                    "type": "bundle" if item_type == 1 else "app",
                }
            )
    return items


# --------------------------------------------------------------------------- #
# 数据源 2：search/results —— 按折扣力度排序的深度折扣榜（补充数据）
# --------------------------------------------------------------------------- #
ROW_RE = re.compile(
    r'<a([^>]*class="[^"]*search_result_row[^"]*"[^>]*)>(.*?)</a>',
    re.S | re.I,
)
TITLE_RE = re.compile(
    r'<(?:span|div)[^>]*class="title"[^>]*>(.*?)</(?:span|div)>', re.S | re.I
)
# Steam 搜索页在不同版本中会用 <span> 或 <div> 承载折扣角标，这里做兼容
PCT_RE = re.compile(
    r'<(?:span|div)[^>]*class="discount_pct"[^>]*>(.*?)</(?:span|div)>', re.S | re.I
)
ORIGINAL_RE = re.compile(
    r'<div[^>]*class="discount_original_price"[^>]*>(.*?)</div>', re.S | re.I
)
FINAL_RE = re.compile(
    r'<div[^>]*class="discount_final_price"[^>]*>(.*?)</div>', re.S | re.I
)
IMG_RE = re.compile(r'<img[^>]*src="([^"]+)"', re.I)


def fetch_deep_discounts(cfg: dict) -> list[dict]:
    """抓取 Steam 搜索页（仅特惠、按折扣降序）并解析 HTML。"""
    params = {
        "query": "",
        "start": 0,
        "count": 50,
        "dynamic_data": "",
        "sort_by": "Discount_DESC",
        "specials": 1,
        "infinite": 1,
        "cc": cfg["cc"],
        "l": cfg["l"],
        "json": 1,
    }
    payload = json.loads(http_get(f"{SEARCH_API}?{urllib.parse.urlencode(params)}"))
    body = payload.get("results_html") or ""

    items: list[dict] = []
    for attrs, block in ROW_RE.findall(body):
        app_match = re.search(r'data-ds-appid="(\d+)"', attrs)
        if not app_match:
            continue
        app_id = app_match.group(1)

        title = TITLE_RE.search(block)
        pct = PCT_RE.search(block)
        original = ORIGINAL_RE.search(block)
        final = FINAL_RE.search(block)
        image = IMG_RE.search(block)
        if not (title and pct and final):
            continue

        pct_match = re.search(r"\d+", strip_tags(pct.group(1)))
        discount = int(pct_match.group(0)) if pct_match else 0
        if discount <= 0:
            continue

        items.append(
            {
                "id": app_id,
                "name": strip_tags(title.group(1)) or "未知游戏",
                "discount_percent": discount,
                "original_price": parse_price(original.group(1)) if original else 0.0,
                "final_price": parse_price(final.group(1)),
                "header_image": html_lib.unescape(image.group(1)) if image else "",
                "store_url": store_url(app_id),
                "expires_at": None,
                "source": "deep",
                "type": "app",
            }
        )
        if len(items) >= MAX_SEARCH_ITEMS:
            break
    return items


# --------------------------------------------------------------------------- #
# 组装
# --------------------------------------------------------------------------- #
def build_region(code: str, cfg: dict) -> dict | None:
    print(f"  → [{code}] 正在抓取 Steam 官方特惠数据…")
    featured: list[dict] = []
    deep: list[dict] = []
    try:
        featured = fetch_featured(cfg)
        print(f"    · 特别优惠 / 热销榜：{len(featured)} 条")
    except Exception as exc:  # noqa: BLE001
        print(f"    ! 精选接口失败：{exc}", file=sys.stderr)

    try:
        deep = fetch_deep_discounts(cfg)
        print(f"    · 深度折扣榜：{len(deep)} 条")
    except Exception as exc:  # noqa: BLE001
        print(f"    ! 搜索接口失败（可忽略）：{exc}", file=sys.stderr)

    if not featured and not deep:
        return None

    # 合并去重：精选数据优先（含精确结束时间），深度折扣补充其后
    merged: dict[str, dict] = {}
    for item in featured:
        merged[item["id"]] = item
    for item in deep:
        if item["id"] not in merged:
            merged[item["id"]] = item

    # 排序：优先展示折扣力度高的，其次按到手价从低到高
    items = sorted(
        merged.values(),
        key=lambda x: (-x["discount_percent"], x["final_price"], x["name"]),
    )[:MAX_TOTAL_ITEMS]

    return {
        "code": code,
        "label": cfg["label"],
        "currency": cfg["currency"],
        "symbol": cfg["symbol"],
        "count": len(items),
        "items": items,
    }


def load_existing() -> dict | None:
    try:
        return json.loads(JSON_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description="抓取 Steam 每日特惠数据")
    parser.add_argument(
        "--regions",
        default=",".join(REGIONS),
        help="要抓取的区域，逗号分隔，例如 CN,US",
    )
    parser.add_argument("--dry-run", action="store_true", help="不写入文件，仅打印摘要")
    args = parser.parse_args()

    codes = [c.strip().upper() for c in args.regions.split(",") if c.strip()]
    unknown = [c for c in codes if c not in REGIONS]
    if unknown:
        print(f"未知区域：{unknown}；可选：{list(REGIONS)}", file=sys.stderr)
        return 2

    existing = load_existing()
    regions: dict[str, dict] = {}
    for code in codes:
        result = build_region(code, REGIONS[code])
        if result:
            regions[code] = result
        elif existing and code in (existing.get("regions") or {}):
            print(f"  → [{code}] 本次抓取失败，沿用上一次成功的数据", file=sys.stderr)
            regions[code] = existing["regions"][code]

    if not regions:
        print("所有区域均抓取失败，保留原有数据文件不变。", file=sys.stderr)
        return 1

    # 未指定抓取的区域，也保留历史数据，避免页面缺区域
    if existing:
        for code, payload in (existing.get("regions") or {}).items():
            regions.setdefault(code, payload)

    data = {
        "generated_at": now_iso(),
        "generated_at_local": now_local_label(),
        "source": "Steam Store Web API",
        "api_endpoints": [FEATURED_API, SEARCH_API],
        "note": "价格单位为主货币（CNY 元 / USD 美元）；expires_at 为 Unix 秒。",
        "regions": regions,
    }

    summary = ", ".join(f"{code} {payload['count']} 条" for code, payload in regions.items())
    print(f"\n✔ 数据组装完成：{summary}")

    if args.dry_run:
        print(json.dumps(data, ensure_ascii=False, indent=2)[:1500])
        return 0

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    JSON_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    # JS 包裹：让页面可用 <script> 同步加载，规避 CORS / file:// 限制
    # 把 "</" 转义为 "<\/"，避免游戏名里出现 </script> 时提前闭合脚本标签
    js_payload = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace(
        "</", "<\\/"
    )
    JS_PATH.write_text(
        "// 本文件由 scripts/fetch_specials.py 自动生成，请勿手动编辑。\n"
        "// 更新时间：" + now_local_label() + "\n"
        "window.STEAM_DEALS_DATA = " + js_payload + ";\n",
        encoding="utf-8",
    )
    print(f"✔ 已写入 {JSON_PATH.relative_to(ROOT)} 与 {JS_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
