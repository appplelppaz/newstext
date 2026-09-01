#!/usr/bin/env python3
"""RSS を取得し、指定した号の週（月〜日）に出た記事だけを data/raw に残す。

週刊誌なので「その週の話題」であることが命。pubDate が号の週から外れた記事は捨てる。
標準ライブラリのみで動く。

  python3 tools/fetch_feeds.py                # 今週号を全言語ぶん取得
  python3 tools/fetch_feeds.py --lang fr      # フランス語だけ
  python3 tools/fetch_feeds.py --list         # 保存せず件数だけ表示
"""

import argparse
import datetime as dt
import html
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from feeds import FEEDS, COUNTRY
from weekutil import current_issue, issue_range, in_issue_week

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_DIR = os.path.join(ROOT, "data", "raw")
UA = "Mozilla/5.0 (compatible; NEWSTEXT/1.0; language-learning magazine)"

# RSS 1.0 / Atom も混ざるので名前空間を張っておく
NS = {"dc": "http://purl.org/dc/elements/1.1/", "atom": "http://www.w3.org/2005/Atom"}


def clean(text):
    """HTML タグと実体参照を落として1行にする。"""
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def parse_date(item):
    """pubDate / dc:date / atom:updated のどれかから date を取り出す。"""
    for path in ("pubDate", "dc:date", "atom:updated", "updated", "date"):
        raw = item.findtext(path, namespaces=NS)
        if not raw:
            continue
        raw = raw.strip()
        try:
            return parsedate_to_datetime(raw).date()
        except (TypeError, ValueError):
            pass
        try:
            return dt.datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
        except ValueError:
            pass
        m = re.search(r"(\d{4})-(\d{2})-(\d{2})", raw)
        if m:
            return dt.date(*map(int, m.groups()))
    return None


def fetch_feed(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return ET.fromstring(resp.read())


def collect(lang, issue, limit):
    """1言語ぶん取得して、その週の記事だけ返す。"""
    kept, skipped_old, skipped_undated = [], 0, 0
    seen_titles = set()

    for source, url, genre in FEEDS[lang]:
        try:
            root = fetch_feed(url)
        except Exception as exc:                      # フィード1本の失敗で号を落とさない
            print(f"  ! {source}: 取得失敗 ({exc})", file=sys.stderr)
            continue

        items = root.findall(".//item") or root.findall(".//atom:entry", NS)
        n_kept = 0
        for item in items:
            date = parse_date(item)
            if date is None:
                skipped_undated += 1
                continue
            if not in_issue_week(date, issue):
                skipped_old += 1
                continue

            title = clean(item.findtext("title", namespaces=NS))
            if not title or title in seen_titles:
                continue
            seen_titles.add(title)

            link = (item.findtext("link", namespaces=NS) or "").strip()
            if not link:
                el = item.find("atom:link", NS)
                link = el.get("href", "") if el is not None else ""

            summary = clean(item.findtext("description", namespaces=NS)
                            or item.findtext("atom:summary", namespaces=NS))

            kept.append({
                "source": source, "genre": genre, "date": date.isoformat(),
                "title": title, "summary": summary, "url": link,
            })
            n_kept += 1
            if n_kept >= limit:
                break
        print(f"  {source}: {n_kept}件")

    kept.sort(key=lambda a: a["date"], reverse=True)
    return kept, skipped_old, skipped_undated


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--issue", default=current_issue(), help="号ID（既定: 今週）")
    ap.add_argument("--lang", choices=sorted(FEEDS), help="1言語だけ取得")
    ap.add_argument("--limit", type=int, default=40, help="1フィードあたりの上限")
    ap.add_argument("--list", action="store_true", help="保存せず件数だけ表示")
    args = ap.parse_args()

    monday, sunday = issue_range(args.issue)
    print(f"■ {args.issue} 号 — 対象期間 {monday} 〜 {sunday}")

    langs = [args.lang] if args.lang else list(FEEDS)
    os.makedirs(RAW_DIR, exist_ok=True)
    total = 0

    for lang in langs:
        print(f"\n[{lang}] {COUNTRY[lang]}")
        articles, old, undated = collect(lang, args.issue, args.limit)
        total += len(articles)
        print(f"  → 今週分 {len(articles)}件（週外 {old}件 / 日付なし {undated}件 を除外）")
        if not articles:
            print("  ! 今週分が0件。--limit を上げるか feeds.py に補助フィードを足す。",
                  file=sys.stderr)

        if not args.list:
            path = os.path.join(RAW_DIR, f"{lang}-{args.issue}.json")
            payload = {
                "issue": args.issue, "language": lang, "country": COUNTRY[lang],
                "weekStart": monday.isoformat(), "weekEnd": sunday.isoformat(),
                "fetchedAt": dt.datetime.now().isoformat(timespec="seconds"),
                "articles": articles,
            }
            with open(path, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            print(f"  ✓ {os.path.relpath(path, ROOT)}")

    print(f"\n合計 {total}件")


if __name__ == "__main__":
    main()
