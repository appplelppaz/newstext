/* NEWSTEXT — 誌面の描画とルーティング。依存ライブラリなし。 */
(function () {
  "use strict";

  var DATA = window.NEWSTEXT;
  var app = document.getElementById("app");

  var FLAG = { en: "🇬🇧", zh: "🇨🇳", es: "🇪🇸", fr: "🇫🇷" };
  var LANG_NAME = { en: "英語", zh: "中国語", es: "スペイン語", fr: "フランス語" };
  var KIND_NAME = { news: "ニュース", dialogue: "会話", blog: "読み物", buzzword: "語彙", culture: "読み物" };

  /* ── 小道具 ────────────────────────────────── */

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    for (var k in attrs || {}) {
      if (attrs[k] == null) continue;
      if (k === "class") node.className = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k];
      else node.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) {
      if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function sectionInfo(id) {
    for (var i = 0; i < DATA.sections.length; i++) {
      if (DATA.sections[i].id === id) return DATA.sections[i];
    }
    return { id: id, name: id, blurb: "" };
  }

  function issueById(id) {
    for (var i = 0; i < DATA.issues.length; i++) {
      if (DATA.issues[i].issue.id === id) return DATA.issues[i];
    }
    return DATA.issues[0];
  }

  /* 号の中の記事を「言語 → コーナー」の誌面順に並べる（ページ送りに使う） */
  function orderedArticles(bundle) {
    var order = {};
    DATA.sections.forEach(function (s, i) { order[s.id] = i; });
    return bundle.articles.slice().sort(function (a, b) {
      var la = DATA.languages.indexOf(a.metadata.language);
      var lb = DATA.languages.indexOf(b.metadata.language);
      if (la !== lb) return la - lb;
      return order[a.metadata.section] - order[b.metadata.section];
    });
  }

  /* ── 原文の組み立て（語注ハイライト＋ピンインのルビ） ───────── */

  /** 語注の surface が原文のどこに掛かるかを求める。長い語を優先し、重なりは捨てる。 */
  function highlightRanges(original, words) {
    var ranges = [];
    words.map(function (w, i) { return { w: w, i: i }; })
      .sort(function (a, b) {
        return (b.w.surface || b.w.word).length - (a.w.surface || a.w.word).length;
      })
      .forEach(function (item) {
        var needle = item.w.surface || item.w.word;
        var at = -1;
        // すでに確保した範囲と重ならない最初の出現を探す
        for (var from = 0; from <= original.length - needle.length; from++) {
          var found = original.indexOf(needle, from);
          if (found === -1) break;
          var clash = ranges.some(function (r) {
            return found < r.end && found + needle.length > r.start;
          });
          if (!clash) { at = found; break; }
          from = found;
        }
        if (at !== -1) ranges.push({ start: at, end: at + needle.length, index: item.i, word: item.w });
      });
    return ranges.sort(function (a, b) { return a.start - b.start; });
  }

  /** 1文字ぶんのノード。中国語ならルビ付き。 */
  function charNode(ch, reading) {
    if (!reading) return document.createTextNode(ch);
    return el("ruby", {}, [ch, el("rt", { text: reading })]);
  }

  function renderOriginal(seg, lang) {
    var text = seg.original || "";
    var ruby = seg.ruby || null;
    var ranges = highlightRanges(text, seg.words || []);
    var frag = document.createDocumentFragment();
    var pos = 0;

    function emit(target, from, to) {
      for (var i = from; i < to; i++) {
        target.appendChild(charNode(text[i], ruby ? (ruby[i] ? ruby[i][1] : "") : ""));
      }
    }

    ranges.forEach(function (r) {
      emit(frag, pos, r.start);
      var btn = el("button", {
        type: "button", class: "w", "data-gloss": String(r.index),
        "aria-label": (r.word.surface || r.word.word) + "の語義を見る"
      });
      emit(btn, r.start, r.end);
      frag.appendChild(btn);
      pos = r.end;
    });
    emit(frag, pos, text.length);

    var p = el("p", { class: "original", lang: lang });
    p.appendChild(el("span", { class: "seg-no", text: String(seg.id) }));
    p.appendChild(frag);
    return p;
  }

  /* ── 表紙＋目次 ──────────────────────────────── */

  function renderCover(bundle) {
    var info = bundle.issue;
    var wrap = el("div", { class: "cover" });

    wrap.appendChild(el("p", { class: "cover-issue", text: info.label + " ・ 第" + info.id.split("-W")[1] + "号" }));
    wrap.appendChild(el("p", { class: "cover-dates", text: info.dates }));
    wrap.appendChild(el("h1", { class: "cover-title", text: info.coverTitle || info.label }));
    if (info.coverCopy) wrap.appendChild(el("p", { class: "cover-copy", text: info.coverCopy }));
    wrap.appendChild(el("hr", { class: "cover-rule" }));

    if (info.worldRoundup && info.worldRoundup.length) {
      wrap.appendChild(el("h2", { text: "今週の4か国" }));
      var grid = el("div", { class: "roundup" });
      info.worldRoundup.forEach(function (r) {
        grid.appendChild(el("div", { class: "roundup-item", "data-lang": r.language }, [
          el("h3", { text: (r.flag || FLAG[r.language] || "") + " " + r.country }),
          el("p", { text: r.text })
        ]));
      });
      wrap.appendChild(grid);
    }

    if (info.editorNote) {
      wrap.appendChild(el("p", { class: "editor-note" }, [
        el("strong", { text: "編集室から　" }), info.editorNote
      ]));
    }
    return wrap;
  }

  var filters = { level: null, kind: null };

  function renderToc(bundle) {
    var wrap = el("div", { class: "toc" });
    wrap.appendChild(el("h2", { text: "目次" }));

    var bar = el("div", { class: "filters" });
    bar.appendChild(el("span", { class: "filter-label", text: "レベル" }));
    ["初級", "中級", "上級"].forEach(function (lv) {
      bar.appendChild(el("button", {
        type: "button", class: "chip", "data-filter": "level", "data-value": lv,
        "aria-pressed": String(filters.level === lv), text: lv
      }));
    });
    bar.appendChild(el("span", { class: "filter-label", text: "　種別" }));
    [["news", "ニュース"], ["dialogue", "会話"], ["blog", "読み物"], ["buzzword", "語彙"]].forEach(function (k) {
      bar.appendChild(el("button", {
        type: "button", class: "chip", "data-filter": "kind", "data-value": k[0],
        "aria-pressed": String(filters.kind === k[0]), text: k[1]
      }));
    });
    wrap.appendChild(bar);

    var shown = 0;
    DATA.languages.forEach(function (lang) {
      var arts = orderedArticles(bundle).filter(function (a) {
        var m = a.metadata;
        if (m.language !== lang) return false;
        if (filters.level && m.level !== filters.level) return false;
        if (filters.kind && KIND_NAME[m.kind] !== KIND_NAME[filters.kind]) return false;
        return true;
      });
      if (!arts.length) return;
      shown += arts.length;

      var block = el("div", { class: "country-block", "data-lang": lang });
      block.appendChild(el("div", { class: "country-head" }, [
        el("span", { class: "flag", text: FLAG[lang] }),
        el("h2", { text: arts[0].metadata.country }),
        el("span", { class: "lang-tag", text: LANG_NAME[lang] })
      ]));

      var grid = el("div", { class: "card-grid" });
      arts.forEach(function (a) {
        var m = a.metadata;
        var info = sectionInfo(m.section);
        grid.appendChild(el("a", {
          class: "card", href: "#/" + m.issue + "/" + m.language + "/" + m.section
        }, [
          el("span", { class: "card-section", text: info.name }),
          el("h3", { class: "card-title", text: m.titleJa }),
          el("span", { class: "card-title-orig", lang: m.language, text: m.title }),
          el("span", { class: "card-meta" }, [
            el("span", { class: "badge", text: m.category }),
            el("span", { class: "badge badge-level", text: m.level }),
            el("span", { class: "badge", text: KIND_NAME[m.kind] || m.kind })
          ])
        ]));
      });
      block.appendChild(grid);
      wrap.appendChild(block);
    });

    if (!shown) wrap.appendChild(el("p", { class: "empty", text: "条件に合う記事がありません。" }));
    return wrap;
  }

  /* ── 記事 ───────────────────────────────────── */

  function renderGloss(seg, lang) {
    var box = el("div", { class: "gloss" });
    if ((seg.words || []).length) {
      box.appendChild(el("p", { class: "gloss-head", text: "語 注" }));
      seg.words.forEach(function (w, i) {
        box.appendChild(el("p", { class: "gloss-item", "data-gloss": String(i) }, [
          el("span", { class: "term", lang: lang, text: w.word }),
          w.reading ? el("span", { class: "reading", text: w.reading }) : null,
          el("span", { class: "pos", text: w.pos }),
          el("span", { class: "mean", text: w.meaning })
        ]));
      });
    }
    if (seg.grammar) {
      box.appendChild(el("div", { class: "grammar" }, [
        el("p", { class: "gloss-head", text: "文 法" }),
        el("p", { text: seg.grammar })
      ]));
    }
    return box;
  }

  function renderSegments(art) {
    var lang = art.metadata.language;
    var wrap = el("div", { class: "segments" });
    art.segments.forEach(function (seg) {
      var body = el("div", { class: "seg-body" });
      if (seg.speaker) body.appendChild(el("p", { class: "speaker", text: seg.speaker }));
      body.appendChild(renderOriginal(seg, lang));
      if (seg.pinyin) body.appendChild(el("p", { class: "pinyin-line", text: seg.pinyin }));
      body.appendChild(el("p", { class: "translation", text: seg.translation }));

      wrap.appendChild(el("div", { class: "segment", id: "s" + seg.id }, [body, renderGloss(seg, lang)]));
    });
    return wrap;
  }

  function renderEntries(art) {
    var lang = art.metadata.language;
    var wrap = el("div", { class: "entries" });
    art.entries.forEach(function (e) {
      wrap.appendChild(el("div", { class: "entry" }, [
        el("p", { class: "entry-term", lang: lang }, [
          e.term,
          e.reading ? el("span", { class: "entry-reading", text: " " + e.reading }) : null
        ]),
        el("p", { class: "entry-meaning", text: e.meaning }),
        el("p", { class: "entry-note", text: e.note }),
        el("div", { class: "entry-example" }, [
          el("p", { class: "ex", lang: lang, text: e.example }),
          el("p", { class: "ex-ja", text: e.exampleJa })
        ])
      ]));
    });
    return wrap;
  }

  function renderVocabTable(art) {
    var lang = art.metadata.language;
    var rows = [];
    (art.segments || []).forEach(function (seg) {
      (seg.words || []).forEach(function (w) { rows.push(w); });
    });
    if (!rows.length) return null;

    var body = el("tbody");
    rows.forEach(function (w) {
      body.appendChild(el("tr", {}, [
        el("td", { class: "t", lang: lang, text: w.word }),
        w.reading ? el("td", { text: w.reading }) : null,
        el("td", { text: w.pos }),
        el("td", { text: w.meaning })
      ]));
    });

    var head = el("tr", {}, [
      el("th", { text: "語" }),
      lang === "zh" ? el("th", { text: "ピンイン" }) : null,
      el("th", { text: "品詞" }),
      el("th", { text: "意味" })
    ]);

    return el("div", {}, [
      el("h2", { class: "block-head", text: "この記事の語彙 (" + rows.length + ")" }),
      el("div", { class: "table-wrap" }, [
        el("table", { class: "vocab-table" }, [el("thead", {}, [head]), body])
      ])
    ]);
  }

  function renderArticle(bundle, art) {
    var m = art.metadata;
    var info = sectionInfo(m.section);
    var ordered = orderedArticles(bundle);
    var idx = ordered.indexOf(art);

    var wrap = el("article", { class: "article", "data-lang": m.language });

    wrap.appendChild(el("div", { class: "section-banner" }, [
      el("span", { class: "flag", text: FLAG[m.language] }),
      el("span", { class: "name", text: info.name }),
      el("span", { class: "blurb", text: info.blurb }),
      el("span", { class: "page-no", text: m.country + " ・ " + bundle.issue.label })
    ]));

    var head = el("div", { class: "article-head" });
    head.appendChild(el("h1", { class: "article-title", text: m.titleJa }));
    head.appendChild(el("p", { class: "article-title-orig", lang: m.language, text: m.title }));
    if (m.leadJa) head.appendChild(el("p", { class: "lead", text: m.leadJa }));
    head.appendChild(el("div", { class: "article-meta" }, [
      el("span", { class: "badge", text: m.category }),
      el("span", { class: "badge badge-level", text: m.level }),
      el("span", { class: "badge", text: KIND_NAME[m.kind] || m.kind }),
      el("span", { class: "badge", text: m.publishDate })
    ]));
    wrap.appendChild(head);

    if (m.language === "zh") {
      var tools = el("div", { class: "reading-tools" });
      tools.appendChild(el("button", {
        type: "button", class: "chip", id: "ruby-toggle",
        "aria-pressed": String(rubyOn()), text: "ピンイン" + (rubyOn() ? "を隠す" : "を表示")
      }));
      wrap.appendChild(tools);
    }

    wrap.appendChild(art.entries ? renderEntries(art) : renderSegments(art));

    if (m.trivia) {
      wrap.appendChild(el("p", { class: "trivia" }, [
        el("strong", { text: "豆 知 識" }), m.trivia
      ]));
    }

    var table = renderVocabTable(art);
    if (table) wrap.appendChild(table);

    var srcs = m.sources || (m.sourceUrl ? [{ name: m.source, url: m.sourceUrl }] : []);
    if (srcs.length) {
      var list = el("ul");
      srcs.forEach(function (s) {
        list.appendChild(el("li", {}, [
          el("a", { href: s.url, target: "_blank", rel: "noopener noreferrer", text: s.name }),
          " — " + s.url
        ]));
      });
      wrap.appendChild(el("div", { class: "sources" }, [
        el("h2", { class: "block-head", text: "出典" }),
        el("p", { text: "原文の引用は各社が配信目的で公開している見出しと要約によります。著作権は各報道機関に帰属します。" }),
        list
      ]));
    } else {
      wrap.appendChild(el("div", { class: "sources" }, [
        el("p", { text: "この記事は今週の話題をもとにした本誌の書き下ろしです。" })
      ]));
    }

    var pager = el("div", { class: "pager" });
    [[-1, "前の記事"], [1, "次の記事"]].forEach(function (p) {
      var other = ordered[idx + p[0]];
      if (!other) { pager.appendChild(el("span")); return; }
      var om = other.metadata;
      pager.appendChild(el("a", {
        href: "#/" + om.issue + "/" + om.language + "/" + om.section,
        style: p[0] > 0 ? "text-align:right" : null
      }, [
        el("span", { class: "dir", text: p[1] }),
        FLAG[om.language] + " " + om.titleJa
      ]));
    });
    wrap.appendChild(pager);

    return wrap;
  }

  /* ── 語義ポップと欄外の連動 ───────────────────── */

  var openPop = null;

  function closePop() {
    if (openPop) { openPop.remove(); openPop = null; }
    var prev = document.querySelector(".w.is-open");
    if (prev) prev.classList.remove("is-open");
    Array.prototype.forEach.call(document.querySelectorAll(".gloss-item.is-lit"), function (n) {
      n.classList.remove("is-lit");
    });
  }

  function openGloss(btn) {
    var segment = btn.closest(".segment");
    var i = btn.getAttribute("data-gloss");
    var wasOpen = btn.classList.contains("is-open");
    closePop();
    if (wasOpen) return;

    btn.classList.add("is-open");
    Array.prototype.forEach.call(segment.querySelectorAll('.gloss-item[data-gloss="' + i + '"]'), function (n) {
      n.classList.add("is-lit");
    });

    var item = segment.querySelector('.gloss-item[data-gloss="' + i + '"]');
    if (!item) return;

    var term = item.querySelector(".term");
    var reading = item.querySelector(".reading");
    var pop = el("div", { class: "popover", role: "status" }, [
      el("span", { class: "term", lang: term.getAttribute("lang"), text: term.textContent }),
      reading ? el("span", { class: "reading", text: " " + reading.textContent }) : null,
      el("span", { class: "pos", text: " " + item.querySelector(".pos").textContent }),
      el("br"),
      item.querySelector(".mean").textContent
    ]);
    document.body.appendChild(pop);

    // ボタンのすぐ下に出す。右端と下端からはみ出さないよう寄せる。
    var r = btn.getBoundingClientRect();
    var top = window.scrollY + r.bottom + 6;
    var left = window.scrollX + r.left;
    left = Math.min(left, window.scrollX + document.documentElement.clientWidth - pop.offsetWidth - 12);
    pop.style.top = top + "px";
    pop.style.left = Math.max(window.scrollX + 8, left) + "px";
    openPop = pop;
  }

  /* ── ピンイン表示の記憶 ──────────────────────── */

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) { /* プライベートウィンドウなどでは保存しない */ }
    return null;
  }

  function rubyOn() { return store("newstext:ruby") !== "off"; }

  function applyRuby() {
    document.body.classList.toggle("no-ruby", !rubyOn());
  }

  /* ── テーマ ─────────────────────────────────── */

  function applyTheme() {
    var t = store("newstext:theme");
    if (t) document.documentElement.setAttribute("data-theme", t);
  }

  /* ── ルーティング ───────────────────────────── */

  function parseHash() {
    var parts = (location.hash || "").replace(/^#\/?/, "").split("/").filter(Boolean);
    return { issue: parts[0] || null, lang: parts[1] || null, section: parts[2] || null };
  }

  function render() {
    closePop();
    var route = parseHash();
    var bundle = route.issue ? issueById(route.issue) : DATA.issues[0];
    app.innerHTML = "";

    if (route.lang && route.section) {
      var found = null;
      bundle.articles.forEach(function (a) {
        if (a.metadata.language === route.lang && a.metadata.section === route.section) found = a;
      });
      if (found) {
        document.title = found.metadata.titleJa + " — NEWSTEXT " + bundle.issue.label;
        app.appendChild(renderArticle(bundle, found));
        window.scrollTo(0, 0);
        return;
      }
      app.appendChild(el("p", { class: "empty", text: "記事が見つかりません。" }));
      return;
    }

    document.title = "NEWSTEXT " + bundle.issue.label + " — 週刊 多言語ニュースマガジン";
    app.appendChild(renderCover(bundle));
    app.appendChild(renderToc(bundle));
    window.scrollTo(0, 0);
  }

  function buildIssuePicker() {
    var sel = document.getElementById("issue-picker");
    DATA.issues.forEach(function (b) {
      sel.appendChild(el("option", { value: b.issue.id, text: b.issue.label + "（" + b.issue.dates + "）" }));
    });
    sel.addEventListener("change", function () { location.hash = "#/" + sel.value; });
  }

  /* ── 起動 ───────────────────────────────────── */

  if (!DATA || !DATA.issues || !DATA.issues.length) {
    app.appendChild(el("p", { class: "empty", text: "記事データがありません。python3 tools/build.py を実行してください。" }));
    return;
  }

  applyTheme();
  applyRuby();
  buildIssuePicker();

  document.addEventListener("click", function (ev) {
    var w = ev.target.closest(".w");
    if (w) { ev.stopPropagation(); openGloss(w); return; }
    if (!ev.target.closest(".popover")) closePop();

    var chip = ev.target.closest(".chip[data-filter]");
    if (chip) {
      var f = chip.getAttribute("data-filter"), v = chip.getAttribute("data-value");
      filters[f] = filters[f] === v ? null : v;
      render();
      return;
    }

    if (ev.target.closest("#ruby-toggle")) {
      store("newstext:ruby", rubyOn() ? "off" : "on");
      applyRuby();
      var btn = document.getElementById("ruby-toggle");
      btn.setAttribute("aria-pressed", String(rubyOn()));
      btn.textContent = "ピンイン" + (rubyOn() ? "を隠す" : "を表示");
      return;
    }

    if (ev.target.closest("#theme-toggle")) {
      var root = document.documentElement;
      var now = root.getAttribute("data-theme");
      var next = now === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      store("newstext:theme", next);
    }
  });

  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") closePop(); });
  window.addEventListener("hashchange", function () {
    render();
    var sel = document.getElementById("issue-picker");
    var route = parseHash();
    if (route.issue) sel.value = route.issue;
  });

  render();
  document.getElementById("issue-picker").value = (parseHash().issue || DATA.issues[0].issue.id);
})();
