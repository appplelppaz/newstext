#!/usr/bin/env python3
"""中国語記事に、漢字1字ごとのルビ用ピンインと文全体のピンインを付ける。

UI は ruby 配列を <ruby> に組み立てて表示する。冪等なので何度流してもよい。

  python3 tools/add_pinyin.py                     # data/articles/zh/*.json すべて
  python3 tools/add_pinyin.py path/to/one.json
  python3 tools/add_pinyin.py --force             # 既存の ruby も上書き
"""

import argparse
import glob
import json
import os
import re
import sys

try:
    from pypinyin import pinyin, Style
except ImportError:
    sys.exit("pypinyin が要る:  pip install pypinyin --break-system-packages")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZH_DIR = os.path.join(ROOT, "data", "articles", "zh")
HAN = re.compile(r"[一-鿿]")


def build_ruby(text):
    """[[文字, ピンイン], ...] を返す。漢字以外はピンインを空にする。

    連結すると必ず元の原文に戻ること（build.py がそれを検証する）。
    """
    readings = pinyin(text, style=Style.TONE, heteronym=False, errors=lambda x: [""] * len(x))

    ruby, i = [], 0
    for chunk in readings:
        reading = chunk[0] if chunk else ""
        # pypinyin は非漢字をまとめて1要素で返すことがあるので原文と突き合わせて進める
        if HAN.match(text[i]):
            ruby.append([text[i], reading])
            i += 1
        else:
            span = len(reading) if reading and text[i:i + len(reading)] == reading else 1
            for ch in text[i:i + span]:
                ruby.append([ch, ""])
            i += span

    for ch in text[i:]:                       # 取りこぼしの保険
        ruby.append([ch, ""])
    return ruby


def sentence_pinyin(text):
    words = pinyin(text, style=Style.TONE, heteronym=False, errors=lambda x: [""] * len(x))
    return " ".join(w[0] for w in words if w and w[0]).strip()


def process(path, force=False):
    with open(path, encoding="utf-8") as f:
        art = json.load(f)

    if art.get("metadata", {}).get("language") != "zh":
        return None

    # 文法コーナーの例文にもピンインが要る（build.py が必須にしている）
    lesson = art.get("lesson")
    if lesson:
        n = 0
        for block in lesson.get("blocks", []):
            for ex in block.get("examples", []):
                if not ex.get("reading") or force:
                    ex["reading"] = sentence_pinyin(ex["text"]); n += 1
        for row in lesson.get("contrast", []):
            for side in ("a", "b"):
                key = side + "Reading"
                if not row.get(key) or force:
                    row[key] = sentence_pinyin(row[side]); n += 1
        with open(path, "w", encoding="utf-8") as f:
            json.dump(art, f, ensure_ascii=False, indent=2)
            f.write("\n")
        return n

    if not art.get("segments"):
        return 0                              # buzzword 面は segments を持たない

    changed = 0
    for seg in art["segments"]:
        # 語注のピンインは執筆時に手で書かないので、ここでまとめて補う
        for w in seg.get("words", []):
            if not w.get("reading") or force:
                w["reading"] = sentence_pinyin(w["word"])

        if seg.get("ruby") and not force:
            continue
        text = seg.get("original", "")
        if not text:
            continue
        ruby = build_ruby(text)
        assert "".join(ch for ch, _ in ruby) == text, f"{path} seg {seg.get('id')}: ルビが原文に戻らない"
        seg["ruby"] = ruby
        seg["pinyin"] = sentence_pinyin(text)
        changed += 1

    with open(path, "w", encoding="utf-8") as f:
        json.dump(art, f, ensure_ascii=False, indent=2)
        f.write("\n")
    return changed


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paths", nargs="*", help="対象JSON（既定: data/articles/zh/*.json）")
    ap.add_argument("--force", action="store_true", help="既存の ruby も付け直す")
    args = ap.parse_args()

    paths = args.paths or sorted(glob.glob(os.path.join(ZH_DIR, "*.json")))
    if not paths:
        print("対象なし。")
        return

    for path in paths:
        n = process(path, args.force)
        name = os.path.relpath(path, ROOT)
        if n is None:
            print(f"- {name}: 中国語記事ではない。スキップ")
        elif n:
            print(f"✓ {name}: {n}セグメントにピンインを付与")
        else:
            print(f"= {name}: 変更なし")


if __name__ == "__main__":
    main()
