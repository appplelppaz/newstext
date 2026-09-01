#!/usr/bin/env python3
"""記事JSONを検証し、誌面が読み込む data/magazine.js を生成する。

file:// で開けることを要件にしているので、記事は fetch() せず
window.NEWSTEXT に埋め込んだ1本の JS として配る。

  python3 tools/build.py            # 検証してビルド
  python3 tools/build.py --check    # 検証だけ（書き出さない）
"""

import argparse
import datetime as dt
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from weekutil import issue_label, issue_dates_label, issue_range, in_issue_week

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTICLES_DIR = os.path.join(ROOT, "data", "articles")
ISSUES_DIR = os.path.join(ROOT, "data", "issues")
OUT = os.path.join(ROOT, "data", "magazine.js")

LANGS = ["en", "zh", "es", "fr"]

# 誌面の背骨。毎号この6コーナーが4か国ぶん揃う。
SECTIONS = [
    {"id": "cover-story",  "name": "カバーストーリー", "kind": "news",     "blurb": "今週その国で一番の話題"},
    {"id": "news-brief",   "name": "今週の短信",       "kind": "news",     "blurb": "短いニュース3本"},
    {"id": "street-talk",  "name": "街の会話",         "kind": "dialogue", "blurb": "現地の友人同士の日常会話"},
    {"id": "life-column",  "name": "暮らしのコラム",   "kind": "blog",     "blurb": "生活・習慣・世相"},
    {"id": "buzzword",     "name": "今週のことば",     "kind": "buzzword", "blurb": "流行語と時事キーワード"},
    {"id": "culture",      "name": "カルチャー案内",   "kind": "culture",  "blurb": "料理・音楽・映画・行事"},
]
SECTION_IDS = [s["id"] for s in SECTIONS]

META_REQUIRED = ["id", "issue", "section", "language", "country", "kind", "title",
                 "titleJa", "leadJa", "publishDate", "category", "level"]

errors = []
warnings = []


def err(path, msg):
    errors.append(f"{os.path.relpath(path, ROOT)}: {msg}")


def warn(path, msg):
    warnings.append(f"{os.path.relpath(path, ROOT)}: {msg}")


def validate_article(path, art):
    meta = art.get("metadata")
    if not isinstance(meta, dict):
        return err(path, "metadata がない")

    for key in META_REQUIRED:
        if not meta.get(key):
            err(path, f"metadata.{key} が空")

    lang, issue, section = meta.get("language"), meta.get("issue"), meta.get("section")
    if lang not in LANGS:
        err(path, f"language が不正: {lang!r}")
    if section not in SECTION_IDS:
        err(path, f"section が不正: {section!r}")

    # 週刊誌なので「その週の話題」であることを機械的に担保する
    if issue and meta.get("publishDate"):
        try:
            date = dt.date.fromisoformat(meta["publishDate"])
            if not in_issue_week(date, issue):
                mon, sun = issue_range(issue)
                err(path, f"publishDate {date} が {issue} の週({mon}〜{sun})の外")
        except ValueError:
            err(path, f"publishDate が日付として読めない: {meta['publishDate']!r}")

    if meta.get("kind") == "news" and not meta.get("sourceUrl"):
        err(path, "kind=news なのに sourceUrl がない（出典の明示は必須）")

    # カバーストーリーは同じ話題を複数紙の配信要約から組む。全部の出典を明示する。
    for i, src in enumerate(meta.get("sources", []), 1):
        if not src.get("name") or not src.get("url"):
            err(path, f"sources[{i}] に name / url が揃っていない")

    if section == "buzzword":
        validate_entries(path, art)
    else:
        validate_segments(path, art, lang)


def validate_entries(path, art):
    entries = art.get("entries")
    if not entries:
        return err(path, "buzzword なのに entries が空")
    for i, e in enumerate(entries, 1):
        for key in ("term", "meaning", "note", "example", "exampleJa"):
            if not e.get(key):
                err(path, f"entries[{i}].{key} が空")


def validate_segments(path, art, lang):
    segs = art.get("segments")
    if not segs:
        return err(path, "segments が空")

    for i, seg in enumerate(segs, 1):
        if seg.get("id") != i:
            err(path, f"segments[{i}] の id が {seg.get('id')!r}（連番でない）")

        original = seg.get("original", "")
        if not original:
            err(path, f"segment {i}: original が空")
        if not seg.get("translation"):
            err(path, f"segment {i}: translation が空（訳の付け忘れ）")

        # 語注を原文に当てるための実表記。ここがズレると UI でハイライトできない
        for w in seg.get("words", []):
            for key in ("word", "meaning", "pos"):
                if not w.get(key):
                    err(path, f"segment {i}: words の {key} が空 ({w.get('word')!r})")
            surface = w.get("surface") or w.get("word", "")
            if surface and surface not in original:
                err(path, f"segment {i}: surface {surface!r} が原文中にない")
            if lang == "zh" and not w.get("reading"):
                err(path, f"segment {i}: 中国語の語注 {w.get('word')!r} に reading がない")

        if lang == "zh":
            if not seg.get("ruby"):
                err(path, f"segment {i}: 中国語なのに ruby がない（add_pinyin.py 未実行）")
            elif "".join(ch for ch, _ in seg["ruby"]) != original:
                err(path, f"segment {i}: ruby を連結しても原文に戻らない")


def load_issue(issue_id):
    path = os.path.join(ISSUES_DIR, issue_id, "issue.json")
    if not os.path.exists(path):
        errors.append(f"data/issues/{issue_id}/issue.json がない")
        return None
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="検証だけして書き出さない")
    args = ap.parse_args()

    articles = []
    for path in sorted(glob.glob(os.path.join(ARTICLES_DIR, "*", "*.json"))):
        try:
            with open(path, encoding="utf-8") as f:
                art = json.load(f)
        except json.JSONDecodeError as exc:
            err(path, f"JSON として読めない: {exc}")
            continue
        validate_article(path, art)
        articles.append(art)

    if not articles:
        print("記事が1本もない。data/articles/<lang>/ に JSON を置く。", file=sys.stderr)
        return 1

    # 号ごとにまとめ、コーナーの欠けを警告する
    issues = {}
    for art in articles:
        meta = art["metadata"]
        issues.setdefault(meta.get("issue"), []).append(art)

    built = []
    for issue_id in sorted(issues, reverse=True):
        info = load_issue(issue_id)
        if info is None:
            continue
        have = {(a["metadata"]["language"], a["metadata"]["section"]) for a in issues[issue_id]}
        for lang in LANGS:
            missing = [s for s in SECTION_IDS if (lang, s) not in have]
            if missing:
                warnings.append(f"{issue_id} [{lang}]: 未掲載のコーナー {', '.join(missing)}")

        info.update({
            "id": issue_id,
            "label": issue_label(issue_id),
            "dates": issue_dates_label(issue_id),
        })
        mon, sun = issue_range(issue_id)
        info["weekStart"], info["weekEnd"] = mon.isoformat(), sun.isoformat()
        built.append({"issue": info, "articles": issues[issue_id]})

    for w in warnings:
        print(f"warn: {w}", file=sys.stderr)
    if errors:
        for e in errors:
            print(f"ERROR {e}", file=sys.stderr)
        print(f"\n{len(errors)}件のエラーで中止。", file=sys.stderr)
        return 1

    total = sum(len(b["articles"]) for b in built)
    if args.check:
        print(f"✓ 検証OK — {len(built)}号 / {total}本")
        return 0

    payload = {
        "sections": SECTIONS,
        "languages": LANGS,
        "builtAt": dt.datetime.now().isoformat(timespec="seconds"),
        "issues": built,
    }
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// tools/build.py が生成。直接編集しない。\n")
        f.write("window.NEWSTEXT = ")
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")

    size = os.path.getsize(OUT) / 1024
    print(f"✓ {len(built)}号 / {total}本 → data/magazine.js ({size:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
