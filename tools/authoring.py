"""記事JSONを書き出す補助。執筆用スクリプトから使う。

surface が原文にあるか等は build.py が検証するが、書いた直後に落とした方が直しやすい。
"""

import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def seg(i, original, translation, words=(), grammar="", speaker=None):
    """1セグメント分の dict を組む。words は (見出し語, 文中表記, 意味, 品詞) のタプル。

    見出し語と文中表記が同じときは (見出し語, 意味, 品詞) の3要素でもよい。
    """
    out = []
    for w in words:
        if len(w) == 3:
            word, meaning, pos = w
            surface = word
        else:
            word, surface, meaning, pos = w
        assert surface in original, f"seg {i}: surface {surface!r} が原文にない\n  {original}"
        out.append({"word": word, "surface": surface, "meaning": meaning, "pos": pos})

    d = {"id": i, "original": original}
    if speaker:
        d["speaker"] = speaker
    d.update({"translation": translation, "words": out, "grammar": grammar})
    return d


def write(meta, segments=None, entries=None):
    art = {"metadata": meta}
    if entries is not None:
        art["entries"] = entries
    else:
        art["segments"] = segments

    path = os.path.join(ROOT, "data", "articles", meta["language"],
                        f"{meta['issue']}-{meta['section']}.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(art, f, ensure_ascii=False, indent=2)
        f.write("\n")
    n = len(entries) if entries is not None else len(segments)
    print(f"✓ {os.path.relpath(path, ROOT)}  ({n})")
