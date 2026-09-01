---
name: weekly-issue
description: >
  週刊多言語マガジン NEWSTEXT の新しい号を組む。RSS からその週の話題を集め、
  英語・中国語・スペイン語・フランス語の7コーナーぶんの記事を
  日本語訳・語注・文法解説つきで書き、ビルドしてコミットする。
  Use this skill whenever the user says anything like "今週号を作って",
  "ニュースを更新して", "新しい号を出して", "NEWSTEXT を更新", "最新号を作成",
  "make this week's issue", "update the magazine", or asks to continue /
  resume building an issue. Also trigger when data/raw に今週分の JSON があるのに
  data/articles に対応する記事がないとき。
---

# NEWSTEXT 週刊号の作り方

毎週1号。**その週（月〜日）に配信された記事だけ**を題材にする。
1回の実行で **1言語（7コーナー）** まで。残りは「続けて」で継続する。

---

## 0. 号を決める

```bash
python3 -c "import sys; sys.path.insert(0,'tools'); from weekutil import *; \
  i=current_issue(); print(i, issue_label(i), issue_dates_label(i))"
```

`data/articles/<lang>/<issue>-*.json` がすでに7本揃っている言語は**スキップ**する。
4言語すべて揃っていれば、その号は完成しているのでユーザーにそう伝える。

## 1. 素材を集める

```bash
python3 tools/fetch_feeds.py              # 全言語。--lang fr で1言語だけ
```

`pubDate` が号の週から外れた記事は自動で捨てられる。
ある言語が0件なら `--limit` を上げるか、`tools/feeds.py` に補助フィードを足す。
出力は `data/raw/<lang>-<issue>.json`。

## 2. 話題を選ぶ

`data/raw/<lang>-<issue>.json` を読み、その国で**その週いちばん話題になったこと**と、
**暮らしが見える軽い話題**を両方拾う。硬いニュースだけの号にしない。

## 3. 7コーナーを書く

| section | kind | 内容 | 分量 |
|---|---|---|---|
| `cover-story` | news | 今週一番の話題。**複数紙の配信要約**を集めて構成 | 8〜12文 |
| `news-brief` | news | 短信3本ぶんの配信要約 | 5〜7文 |
| `street-talk` | dialogue | その話題を現地の友人同士が話す会話。口語・相槌・略語込み | 10〜14往復 |
| `life-column` | blog | 暮らし・習慣・世相のエッセイ（書き下ろし） | 8〜12文 |
| `buzzword` | buzzword | 流行語・時事キーワード5語（`entries`） | 5語 |
| `grammar` | grammar | **その号の記事に実際に出た**文法を1点、深く掘る（`lesson`） | 3ブロック |
| `culture` | culture | 料理・音楽・映画・行事など（書き下ろし） | 6〜10文 |

### 素材の扱い（重要）

- `news` の `original` は、**RSS の見出しと要約から取った文だけ**を使う。
  記事本文をサイトから取ってきて載せてはいけない。
  `metadata.sources[]` に使った媒体をすべて `{name, url}` で書く。
- `dialogue` / `blog` / `culture` は**その週の話題をもとにした書き下ろし**。
  実在の人物に発言を捏造させない。会話の話者は架空の人物にする。

### 書き方

`tools/authoring.py` の `seg()` / `write()` を使う。`seg()` は
`surface` が原文にあるかをその場で検査するので、書き間違いがすぐ分かる。

```python
import sys; sys.path.insert(0, "tools")
from authoring import seg, write

write(dict(issue="2026-W37", language="fr", country="フランス",
           publishDate="2026-09-08", targetLanguage="ja",
           id="fr-2026-W37-street-talk", section="street-talk", kind="dialogue",
           title="原語タイトル", titleJa="日本語タイトル",
           leadJa="誌面のリード文。日本語2〜3文。",
           category="生活", level="中級",
           trivia="欄外の豆知識。日本語1〜2文。"),
 [
  seg(1, "原文1文", "自然な日本語訳",
      [("見出し語", "文中の表記", "意味", "品詞"),   # 表記が同じなら3要素でよい
       ("rentrée", "新学期", "名詞")],
      "文法解説を1点だけ。単純な文は空文字列。",
      speaker="Léa"),                                # dialogue のみ
 ])
```

### 文法コーナー（`grammar`）の書き方

**その号の記事に実際に登場した文法**を選ぶこと。ここが要で、
「今週読んだあの文はこういう仕組みだった」とつながるから雑誌の文法特集になる。
`examples` の `note` で、どの記事のどの文から採ったかを示す。

```python
write(dict(..., section="grammar", kind="grammar", category="文法"),
 lesson={
   "point":   "原語での文法形（en + participe présent など）",
   "pointJa": "日本語の項目名",
   "summary": "一言でいうと何ができる形か。2〜3文",
   "blocks": [                       # 3ブロック程度。段階的に深める
     {"heading": "見出し", "body": "説明文",
      "examples": [{"text": "例文", "ja": "訳", "note": "補足（任意）"}]},
   ],
   "contrast": [                     # 紛らわしい対比。任意だが入れると誌面が締まる
     {"label": "見出し", "a": "例文A", "aJa": "訳A", "b": "例文B", "bJa": "訳B",
      "note": "どう違うのか"},
   ],
   "mistakes": [                     # 日本語話者がやりがちな誤り。任意
     {"wrong": "誤った文", "right": "正しい文", "rightJa": "訳", "note": "なぜ誤りか"},
   ],
   "pitfall": "日本語との発想の違いを最後に一段落",
 })
```

中国語の場合、例文と対比のピンインは手で書かず `add_pinyin.py` が埋める。

### 注釈のルール（podcast-json スキルと共通）

- **訳** — 逐語訳しない。自然な日本語にする。固有名詞はそのまま。
- **語注** — 1文あたり **3〜6語**。ニュース特有表現・慣用句・専門語・
  知っておくべき口語を優先。短い相槌だけの文は `[]`。
- **文法** — 注目点を**1つだけ**日本語で。単純な文は `""`。
- **カタカナ読みは付けない**。`reading` は中国語ピンイン専用で、手では書かず
  次の手順のツールに任せる。
- `level` は 初級 / 中級 / 上級 のいずれか。`category` は 政治・経済・社会・生活・文化・スポーツ・国際・語彙 など。

## 4. 中国語にピンインを付ける

```bash
python3 tools/add_pinyin.py       # 原文のルビ・語注・文法コーナーの例文にピンインを補う
```

中国語の記事を書いたら**必ず**実行する。冪等なので何度流してもよい。

## 5. 号の扉を書く（その号で最初の1回だけ）

`data/issues/<issue>/issue.json`:

```json
{
  "coverTitle": "表紙の特集コピー（短く）",
  "coverCopy": "その週を4か国横断でまとめた2〜3文",
  "editorNote": "編集室から。読者への短い案内",
  "worldRoundup": [
    {"language": "en", "country": "イギリス", "flag": "🇬🇧", "text": "今週の動きを日本語で2〜3文"},
    {"language": "zh", "country": "中国",     "flag": "🇨🇳", "text": "..."},
    {"language": "es", "country": "スペイン", "flag": "🇪🇸", "text": "..."},
    {"language": "fr", "country": "フランス", "flag": "🇫🇷", "text": "..."}
  ]
}
```

## 6. ビルドして確認する

```bash
python3 tools/build.py
```

検証が通ると `data/magazine.js` が更新される。エラーが出たら、
該当ファイルと理由が表示されるので直してから進む。よくあるのは:

- `surface が原文中にない` — 活用形の書き間違い。原文をそのままコピーする
- `中国語の語注に reading がない` — `add_pinyin.py` を流し忘れている
- `publishDate が号の週の外` — 先週の記事を拾っている

## 7. 突き合わせ（毎回必ず）

**最も多い重大ミスは訳のズレ**。書いた言語ごとに、中盤と終盤から
最低3セグメント抜き取り、`original` と `translation` が対応しているか、
1つずれていないかを目で確認する。

## 8. コミットして報告

言語ごとに1コミット。処理した言語・コーナー数と、残っている言語を報告し、
「続けて」で続行できることを伝える。
