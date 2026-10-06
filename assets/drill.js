// 日文中訳ドリル：中国語の原文 → Claude が日本語の問題文を作る → スクリブルで中国語に訳す → Claude が朱筆で添削する
// Claude とのやりとりは、共有シートで依頼文を Claude アプリに送り、返ってきた JSON を貼り付けて読み込む
// 原文ストックと添削の記録は IndexedDB（level1 / jz）、下書き・表現ノートは localStorage（jz）
window.Drill = function Drill(ctx) {
  'use strict';

  const { app, store, esc, toast, todayS, LEFT, ST } = ctx;
  const PASS = 80;
  const GENRES = ['论说・评论', '时事', '经济', '公式文書', '随笔・散文', '文学'];
  const SITES = [
    ['人民網 观点', 'http://opinion.people.com.cn/', '人民時評・評論員文章。硬い書き言葉の宝庫'],
    ['光明網 時評', 'https://guancha.gmw.cn/', '短めの評論。200〜300字を切り出しやすい'],
    ['新華網', 'https://www.news.cn/', '時事・経済の定番表現'],
    ['人民日報 電子版', 'http://paper.people.com.cn/', '副刊「大地」は随筆（散文）対策に'],
    ['中国政府網', 'https://www.gov.cn/', '政府工作報告など規範的な公文書'],
    ['国務院新聞弁公室（白書）', 'http://www.scio.gov.cn/', '白書。公式の日本語版がある分野も'],
    ['維基文庫', 'https://zh.wikisource.org/', '魯迅・朱自清・老舍などの文学作品'],
  ];
  const TABS = [['practice', '練習'], ['stock', '原文ストック'], ['notes', '表現ノート'], ['log', '記録']];
  const LV = { error: '誤り', improve: '改善', ok: '別解OK' };
  // 添削の分類を、アプリ共通の弱点タグ（Progress の Writing・Today の Writing focus）に読み替える
  const CAT2TAG = { 誤訳: 'meaning', 脱落: 'omit', 文法: 'grammar', 語彙: 'meaning', コロケーション: 'colloc', 文体: 'style', 誤字: 'char' };

  // ---------- 保存 ----------
  // st = { cur: {ex, answer, hints, question, attemptId} | {make: {src, meta}} | null, exprs: [], len, srcMode }
  let st = Object.assign({ cur: null, exprs: [], len: 150, srcMode: 'stock' }, store.get('jz', {}));
  const save = () => store.set('jz', st);
  const DB = { corpus: [], attempts: [] };
  let ready = false;
  const onReady = [];
  const uid = () => `j${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  async function loadAll() {
    try {
      const d = await window.Ink.db();
      await new Promise((res) => {
        const q = d.transaction('jz').objectStore('jz').getAll();
        q.onsuccess = () => { q.result.forEach((x) => (x.kind === 'corpus' ? DB.corpus : DB.attempts).push(x)); res(); };
        q.onerror = () => res();
      });
    } catch (e) { /* IndexedDB が使えない環境では、この回だけ保存する */ }
    DB.corpus.sort((a, b) => b.at - a.at);
    DB.attempts.sort((a, b) => b.at - a.at);
    ready = true;
    onReady.splice(0).forEach((f) => f());
  }
  async function put(rec) {
    const list = rec.kind === 'corpus' ? DB.corpus : DB.attempts;
    const i = list.findIndex((x) => x.id === rec.id);
    if (i >= 0) list[i] = rec; else list.unshift(rec);
    try {
      const d = await window.Ink.db();
      await new Promise((res, rej) => { const tx = d.transaction('jz', 'readwrite'); tx.objectStore('jz').put(rec); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    } catch (e) { toast('Saved for this session only'); }
  }
  async function remove(rec) {
    const list = rec.kind === 'corpus' ? DB.corpus : DB.attempts;
    const i = list.findIndex((x) => x.id === rec.id);
    if (i >= 0) list.splice(i, 1);
    try { const d = await window.Ink.db(); d.transaction('jz', 'readwrite').objectStore('jz').delete(rec.id); } catch (e) { /* なし */ }
  }

  const nchars = (s) => String(s || '').replace(/\s/g, '').length;
  const zh = (t) => `<span lang="zh-CN" class="serif">${esc(t)}</span>`;
  const fmtAt = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  // ---------- 学習の記録から ----------
  function weaknesses() {
    const m = new Map();
    DB.attempts.forEach((a) => (a.result.sentences || []).forEach((s) => (s.issues || []).forEach((i) => {
      if (i.level !== 'error' || !i.weakness_tag) return;
      const t = String(i.weakness_tag).trim();
      m.set(t, (m.get(t) || 0) + 1);
    })));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }
  const reviewExprs = () => st.exprs.filter((e) => !e.mastered).slice(0, 8).map((e) => e.zh);

  // ---------- 依頼文 ----------
  const OUT_PROBLEM = '{"title":"内容を表す日本語の短い題","source_sentences":["原文の第1文","原文の第2文"],"ja_text":"日本語の問題文全体","sentences":[{"id":1,"ja":"日本語の1文","src":[1]}],"key_points":[{"zh":"原文の表現","ja":"問題文での表現","why":"1級で問われる理由（日本語で簡潔に）"}],"difficulty":"1級標準|1級やや易|1級やや難"}';
  function makeSteps(len) {
    const rev = reviewExprs();
    return [
      '## 手順',
      `1. 原文の切り出し：原文が ${len}字（±50字）より長ければ、内容が完結する連続した部分を選ぶ。1級レベルの語彙・成語・書き言葉の構文（「以…为…」「之所以…是因为…」、四字句の対句など）を含む部分を優先する。${rev.length ? `次の復習表現を含む部分があれば優先する：${rev.join('、')}。` : ''}切り出した原文は一字も変えない。`,
      '2. 切り出した原文を文（。！？で終わる単位）に分け、source_sentences に順に入れる（番号は1から）。',
      '3. 日本語の問題文（最重要）：日本人の記者・評論家・随筆家が最初から日本語で書いたような自然な日本語にする。中国語の語順や文の切り方をなぞらず、必要なら文を分けたりつなげたりする。漢語を直輸入しない（例：「加大力度」→「力を入れる」）。成語は自然な日本語に言い換え、中国語が透けて見えないようにする。意味の省略・追加はしない。文体はジャンルに合わせる。',
      '4. 日本語の問題文を文ごとに分け、各文が対応する原文の番号を src に入れる。すべての原文がどれかの文に入るようにする。',
      '5. 1級で問いたい採点ポイントを3〜6個挙げる。',
    ];
  }
  function promptMake(src, genre, len) {
    return [
      'あなたは中国語検定1級（日本中国語検定協会）の日文中訳問題を作る出題者です。中国語の原文から、受験者が中国語に訳し戻すための「日本語の問題文」を作ります。',
      '',
      ...makeSteps(len),
      '',
      `## 原文（ジャンル：${genre}）`,
      '<<<', String(src).slice(0, 6000), '>>>',
      '',
      '## 出力',
      '```json のコードブロック1つだけを出力する（説明の文は不要）：',
      OUT_PROBLEM,
    ].join('\n');
  }
  function promptGenerate(genre, theme, len) {
    const rev = reviewExprs();
    return [
      'あなたは中国の新聞・雑誌の熟練した書き手であり、中国語検定1級（日本中国語検定協会）の日文中訳問題の出題者です。',
      '',
      '## 1. 原文を書く',
      `日文中訳の練習素材として、ネイティブが書いたと区別できない自然で規範的な中国語（簡体字）の文章を1本書く。ジャンル：${genre}。テーマ：${theme || 'ジャンルにふさわしい現代中国の話題から自由に選ぶ'}。長さ：${len}字前後（±40字）。1級レベルの書き言葉の語彙、成語、四字句、関連詞を自然に含める。実在の人物の発言をねつ造しない。統計値は「約」「数」などでぼかしてよい。${rev.length ? `可能なら次の表現のうち1〜2個を自然に使う：${rev.join('、')}` : ''}`,
      '',
      '## 2. その原文から問題を作る（原文は全文を使う）',
      ...makeSteps(len).slice(2),
      '',
      '## 出力',
      '```json のコードブロック1つだけを出力する（説明の文は不要）：',
      OUT_PROBLEM,
    ].join('\n');
  }
  // 添削の依頼文（中検1級の日文中訳の採点基準）
  function promptGrade(c) {
    const ex = c.ex;
    const weak = weaknesses().slice(0, 6).map(([t]) => t);
    return `【中検1級 日文中訳ドリル：添削依頼】
あなたは中国語検定1級の日文中訳を採点する、経験豊富な採点者であり中国語教師です。受験者は日本語母語話者です。厳密かつ建設的に添削してください。

## 基本方針
- 原文は「正解の一つ」にすぎない。原文と違っても、意味が正確で自然な中国語なら減点しない。
- 指摘は次の3段階に分ける。
  - 【誤り】減点する。誤訳・脱落・余計な追加・文法の誤り・語の誤用・中国語として成立しない表現
  - 【改善】正しいが、より良い表現がある。減点は0〜1点
  - 【別解OK】原文と違うが良い訳。減点せず評価する
- 説明は日本語で書く。中国語の改善案には拼音を添える。
- 受験者の訳を文に分け、問題文の各文に対応付ける。訳されていない文は脱落として扱う。
- 受験者の訳は Apple Pencil の手書きを iPad のスクリブルで文字にしたもの。形の似た別の字は「読み取りミス？」と指摘し、減点は控えめにする。

## 減点の目安
100点満点。各文の配点は、その文の原文の字数に比例させる。
- 意味の取り違え・脱落：3〜6点
- 文法（語順・補語・了・量詞・介詞など）：2〜3点
- 語の選び方・コロケーション：1〜3点
- 文体の不統一（書き言葉に口語が混じる等）：1〜2点
- 誤字・簡体字の誤り：0.5〜1点
- ヒント1回につき2点（今回 ${c.hints} 回）
0点未満にはしない。

## 特に見る点
- 日本語の漢語をそのまま流用していないか（同形異義語。例：検討→×检讨、勉強→×勉强）
- 採点ポイントに挙げた点をクリアできているか
- 過去の弱点と同じ種類の誤りを繰り返していないか
  過去の弱点：${weak.length ? weak.join('、') : '記録なし'}

## 原文（番号付き）
${ex.source_sentences.map((s, i) => `[${i + 1}] ${s}`).join('\n')}

## 問題文（日本語）と原文番号の対応
${JSON.stringify(ex.sentences.map((s) => ({ id: s.id, ja: s.ja, src: s.src })))}

## 採点ポイント
${JSON.stringify((ex.key_points || []).map((k) => ({ ja: k.ja, why: k.why })))}

## 受験者の訳
<<<
${c.answer.trim()}
>>>

## 受験者からの追加の質問・依頼
${(c.question || '').trim() || 'なし'}

## 返答の形式
1. まず、読みやすい日本語で添削を書く。
   - 総合点（100点満点）と一言評価（合格目安80点との比較）
   - 文ごとに：問題文／受験者の訳／模範訳（受験者の訳を最小限直したもの）／原文、そして減点と指摘（【誤り】【改善】【別解OK】、該当部分→改善案、理由）
   - 覚えるべき表現（中国語・拼音・意味・使い方）
   - 良かった点と次の課題
   - 追加の質問・依頼への回答（あれば）
2. 最後に、アプリに記録するためのJSONを \`\`\`json のコードブロック1つで出力する。
{"total_score":0,"grade_comment":"一言評価","sentences":[{"id":1,"ja":"問題文","user":"受験者の訳の該当部分（なければ空文字）","original":"原文","model_answer":"模範訳","deduction":0,"issues":[{"level":"error|improve|ok","category":"誤訳|脱落|文法|語彙|コロケーション|文体|誤字","user_part":"受験者の訳から該当部分をそのまま抜き出す","better":"改善案（拼音付き）","explanation":"理由","weakness_tag":"短い弱点名（例: 結果補語、同形異義語、量詞、書き言葉）","repeat":false}]}],"expressions_to_learn":[{"ja":"日本語","zh":"中文","pinyin":"pīnyīn","note":"使い方"}],"strengths":["良かった点"],"next_focus":"次の課題"}`;
  }

  // Claude の返答から JSON を取り出す（最後の ```json ブロック → 最初の { から最後の } まで）
  function parseJSON(text) {
    const t = String(text || '');
    const cands = [...t.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]).reverse();
    const i = t.indexOf('{');
    const j = t.lastIndexOf('}');
    if (i >= 0 && j > i) cands.push(t.slice(i, j + 1));
    for (const c of cands) {
      for (const x of [c.trim(), c.trim().replace(/,\s*([}\]])/g, '$1')]) {
        try { return JSON.parse(x); } catch (e) { /* 次を試す */ }
      }
    }
    return null;
  }
  function toProblem(r, meta) {
    if (!r || !r.ja_text || !Array.isArray(r.sentences) || !r.sentences.length) return null;
    let src = Array.isArray(r.source_sentences) ? r.source_sentences.map(String).filter(Boolean) : [];
    if (!src.length && r.source_excerpt_zh) src = String(r.source_excerpt_zh).match(/[^。！？!?]+[。！？!?”」]*/g) || [String(r.source_excerpt_zh)];
    if (!src.length) return null;
    return {
      title: r.title || meta.title || '無題', srcTitle: meta.title || '', url: meta.url || '', genre: meta.genre || '', sourceId: meta.sourceId || null, generated: !!meta.generated,
      source_sentences: src, source_zh: src.join(''), ja_text: r.ja_text,
      sentences: r.sentences.map((s, k) => ({ id: s.id || k + 1, ja: String(s.ja || ''), src: Array.isArray(s.src) ? s.src.map(Number) : [], zh: s.zh || '' })),
      key_points: Array.isArray(r.key_points) ? r.key_points : [], difficulty: r.difficulty || '',
    };
  }

  // 返答を貼り付ける所（Paste ボタンでクリップボードから、または欄に直接）
  const pasteHTML = (id, ph) => `<div class="result-box"><div class="row"><span class="label">Claude の返答</span><span class="spacer"></span><button type="button" class="btn sm" data-jzp="${id}">Paste result</button></div>
      <textarea class="answer short paste" data-jzin="${id}" placeholder="${esc(ph)}"></textarea><div class="jz-msg muted small" data-jzmsg="${id}"></div></div>`;
  function bindPaste(id, take) {
    const ta = app.querySelector(`[data-jzin="${id}"]`);
    const msg = app.querySelector(`[data-jzmsg="${id}"]`);
    const run = (t) => { const err = take(t); if (err) msg.textContent = err; };
    app.querySelector(`[data-jzp="${id}"]`).addEventListener('click', async () => {
      try { const t = await navigator.clipboard.readText(); if (t) { ta.value = t; run(t); return; } } catch (e) { /* 欄に直接貼ってもらう */ }
      ta.focus(); toast('欄に貼り付けてください');
    });
    let tm;
    ta.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { if (ta.value.includes('{')) run(ta.value); }, 500); });
  }

  // ---------- 画面 ----------
  function view(tab, arg) {
    if (!ready) { onReady.push(() => view(tab, arg)); return; }
    if (!TABS.some(([k]) => k === tab)) tab = 'practice';
    const n = { stock: DB.corpus.length, notes: st.exprs.filter((e) => !e.mastered).length, log: DB.attempts.length };
    app.innerHTML = `<div class="daynav"><a class="icon-btn" href="#/translate" aria-label="Back">${LEFT}</a><div class="date">日文中訳ドリル<small>原文 → 日本語の問題 → 中国語訳 → 朱筆の添削</small></div><span style="width:36px"></span></div>
      <div class="row" style="margin:0 0 16px;flex-wrap:wrap"><div class="seg">${TABS.map(([k, l]) => `<a class="${k === tab ? 'on' : ''}" href="#/zhdrill/${k}">${l}${n[k] ? ` <span class="muted">${n[k]}</span>` : ''}</a>`).join('')}</div></div>
      <div id="jz"></div>`;
    const host = app.querySelector('#jz');
    if (tab === 'stock') vStock(host);
    else if (tab === 'notes') vNotes(host);
    else if (tab === 'log') vLog(host, arg);
    else vPractice(host);
  }
  const rerender = () => { const [, , tab, arg] = location.hash.split('/'); view(tab, arg); };
  const steps = (n) => `<div class="jz-steps">${['原文を選ぶ', '中国語に訳す', '添削を読む'].map((l, i) => `${i ? '<i></i>' : ''}<div class="${i + 1 === n ? 'on' : i + 1 < n ? 'done' : ''}"><b>${i + 1 < n ? '✓' : i + 1}</b>${l}</div>`).join('')}</div>`;

  function vPractice(host) {
    const c = st.cur;
    if (c && c.ex && c.result) return vResult(host, c, false);
    if (c && c.ex) return vAnswer(host, c);
    if (c && c.make) return vMake(host, c);
    return vChoose(host);
  }

  // 1. 原文を選ぶ
  function vChoose(host) {
    const modes = [['stock', 'ストックから'], ['paste', '貼り付け'], ['claude', 'Claude が作成']];
    const used = new Map();
    DB.attempts.forEach((a) => { if (a.ex.sourceId) used.set(a.ex.sourceId, (used.get(a.ex.sourceId) || 0) + 1); });
    let body = '';
    if (st.srcMode === 'stock') {
      body = DB.corpus.length ? `<div class="jz-list">${DB.corpus.map((x) => `<div class="jz-item"><div class="t"><b>${esc(x.title || '無題')}</b><small><span class="chip">${esc(x.genre || '—')}</span> ${nchars(x.text)}字 · ${used.get(x.id) ? `練習 ${used.get(x.id)}回` : '未練習'}</small></div><button class="btn sm primary" data-use="${x.id}">出題</button></div>`).join('')}</div>`
        : '<div class="jz-empty">ストックはまだ空です。「貼り付け」で原文を入れるか、「原文ストック」で先にまとめて登録できます。</div>';
    } else if (st.srcMode === 'paste') {
      body = pasteForm(true);
    } else {
      body = `<p class="muted small">本物の記事が手元にないときの練習用です。Claude が新聞風の中国語の原文を書き、そこから出題します。できれば実際の記事（貼り付け）を優先してください。</p>
        <div class="jz-row"><label class="field"><span class="label">ジャンル</span><select id="gGenre">${GENRES.map((g) => `<option>${g}</option>`).join('')}</select></label>
        <label class="field"><span class="label">テーマ（任意）</span><input type="text" id="gTheme" placeholder="例：少子化対策、AIと雇用、春節の帰省"></label></div>
        <div class="actions"><button class="btn primary" id="gGo">この条件で原文を作って出題</button></div>`;
    }
    host.innerHTML = `${steps(1)}
      <section class="jz-panel"><h2>原文を選ぶ</h2>
        <div class="seg" style="margin:10px 0 14px">${modes.map(([k, l]) => `<button class="${st.srcMode === k ? 'on' : ''}" data-mode="${k}">${l}</button>`).join('')}</div>
        ${body}
        <div class="jz-row" style="margin-top:14px"><label class="field"><span class="label">出題の長さ（原文）</span><select id="jzLen">${[150, 250, 350].map((n) => `<option value="${n}" ${st.len === n ? 'selected' : ''}>${n}字前後</option>`).join('')}</select></label></div>
      </section>
      ${sitesHTML()}`;
    host.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { st.srcMode = b.dataset.mode; save(); vChoose(host); }));
    host.querySelector('#jzLen').addEventListener('change', (e) => { st.len = +e.target.value; save(); });
    host.querySelectorAll('[data-use]').forEach((b) => b.addEventListener('click', () => {
      const x = DB.corpus.find((y) => y.id === b.dataset.use);
      st.cur = { make: { src: x.text, meta: { title: x.title, url: x.url, genre: x.genre, sourceId: x.id } } }; save(); vPractice(host);
    }));
    if (st.srcMode === 'paste') bindPasteForm(host, true);
    if (st.srcMode === 'claude') host.querySelector('#gGo').addEventListener('click', () => {
      st.cur = { make: { gen: { genre: host.querySelector('#gGenre').value, theme: host.querySelector('#gTheme').value.trim() }, meta: { genre: host.querySelector('#gGenre').value, generated: true } } };
      save(); vPractice(host);
    });
  }
  function pasteForm(forPractice) {
    return `<div class="jz-row"><label class="field"><span class="label">題名</span><input type="text" id="pTitle" placeholder="例：人民时评：让…"></label>
        <label class="field"><span class="label">出典URL</span><input type="url" id="pUrl" placeholder="https://…（任意）"></label>
        <label class="field"><span class="label">ジャンル</span><select id="pGenre">${GENRES.map((g) => `<option>${g}</option>`).join('')}</select></label></div>
      <label class="field"><span class="label">原文（中国語） <span id="pCnt">0字</span></span><textarea id="pText" class="answer short" lang="zh-CN" placeholder="中国語の本文を貼り付け（長い記事はそのままで OK。出題のときに適切な部分を切り出します）"></textarea></label>
      <div class="actions">${forPractice ? '<button class="btn primary" id="pGo">この原文で出題</button><label class="muted small"><input type="checkbox" id="pKeep" checked> ストックにも保存</label>' : '<button class="btn primary" id="pGo">ストックに追加</button>'}</div>`;
  }
  function bindPasteForm(host, forPractice) {
    const $ = (q) => host.querySelector(q);
    $('#pText').addEventListener('input', () => { $('#pCnt').textContent = `${nchars($('#pText').value)}字`; });
    $('#pGo').addEventListener('click', async () => {
      const t = $('#pText').value.trim();
      if (nchars(t) < 60) { toast('原文は60字以上貼り付けてください'); return; }
      const meta = { title: $('#pTitle').value.trim() || `${t.slice(0, 18)}…`, url: $('#pUrl').value.trim(), genre: $('#pGenre').value };
      let sourceId = null;
      if (!forPractice || $('#pKeep').checked) { sourceId = uid(); await put({ id: sourceId, kind: 'corpus', at: Date.now(), ...meta, text: t }); }
      if (forPractice) { st.cur = { make: { src: t, meta: { ...meta, sourceId } } }; save(); vPractice(host); } else { toast('ストックに追加しました'); rerender(); }
    });
  }
  const sitesHTML = () => `<section class="jz-sites"><h3 class="label">原文におすすめのサイト</h3>
      <p class="muted small">記事を開いて本文をコピーし、「貼り付け」に入れてください。論説4・時事経済3・随筆文学2・公文書1くらいの配分がおすすめです。</p>
      <div class="jz-grid">${SITES.map(([n, u, d]) => `<a class="jz-site" href="${u}" target="_blank" rel="noopener"><b>${esc(n)}</b><span>${esc(d)}</span></a>`).join('')}</div></section>`;

  // 1'. Claude に出題してもらう（依頼文を送り、返ってきた JSON を貼る）
  function vMake(host, c) {
    const m = c.make;
    const prompt = () => (m.gen ? promptGenerate(m.gen.genre, m.gen.theme, st.len) : promptMake(m.src, m.meta.genre, st.len));
    host.innerHTML = `${steps(1)}
      <section class="jz-panel"><h2>Claude に出題してもらう</h2>
        <p class="muted small">「Claude で出題」で依頼文を Claude アプリに送り、返ってきた返答をコピーして下に貼り付けます。</p>
        ${m.src ? `<details class="ja-det"><summary>原文（${nchars(m.src)}字）</summary><div lang="zh-CN" class="serif">${esc(m.src.slice(0, 1200))}${m.src.length > 1200 ? '…' : ''}</div></details>` : `<p class="small">ジャンル：${esc(m.gen.genre)}${m.gen.theme ? ` · テーマ：${esc(m.gen.theme)}` : ''} · ${st.len}字前後</p>`}
        ${ST.claudeHTML(prompt).replace('Claude で添削', 'Claude で出題')}
        ${pasteHTML('make', 'Claude の返答を貼り付け（```json の部分を含めて）')}
        <div class="actions"><button class="btn" id="mBack">やめる</button></div>
      </section>`;
    host.querySelector('#mBack').addEventListener('click', () => { st.cur = null; save(); vPractice(host); });
    bindPaste('make', (t) => {
      const ex = toProblem(parseJSON(t), m.meta);
      if (!ex) return '問題の JSON が読み取れません。```json のブロックを含めて、返答の全文を貼り付けてください。';
      st.cur = { ex, answer: '', hints: 0, question: '' }; save(); vPractice(host); return '';
    });
  }

  // 2. 中国語に訳す（スクリブル）→ 添削を依頼 → 返答を貼る
  function vAnswer(host, c) {
    const ex = c.ex;
    const kp = ex.key_points || [];
    host.innerHTML = `${steps(2)}
      <div class="split write">
        <div class="pane-l">
          <section class="jz-panel"><h2>${esc(ex.title)}</h2><div class="muted small">${esc([ex.genre, ex.difficulty, ex.generated ? 'Claude 作成の原文' : ex.srcTitle].filter(Boolean).join(' · '))}</div>
            <p class="jz-prob">${esc(ex.ja_text)}</p>
            <div class="jz-hints">${kp.slice(0, c.hints).map((k) => `<div class="jz-hint">「${esc(k.ja)}」→ ${zh(k.zh)}</div>`).join('')}</div>
            <div class="actions">${c.hints < kp.length ? '<button class="btn" id="aHint">ヒント（−2点）</button>' : ''}<span class="spacer"></span><button class="btn" id="aQuit">別の問題にする</button></div>
          </section>
        </div>
        <div class="pane-r">
          <div class="row wbar"><span class="label">あなたの中国語訳</span><span class="spacer"></span><span class="muted small" id="aCnt"></span></div>
          <div id="aIn"></div>
          <label class="field" style="margin-top:12px"><span class="label">追加の質問・依頼（任意）</span><textarea id="aQ" class="answer short" placeholder="例：「〜」の訳し方に迷った。ほかの言い方も知りたい">${esc(c.question || '')}</textarea></label>
          <div id="aGrade"></div>
        </div>
      </div>`;
    const $ = (q) => host.querySelector(q);
    const target = nchars(ex.source_zh);
    const cnt = () => { $('#aCnt').textContent = `${nchars(c.answer)}字 ／ 原文 ${target}字`; };
    const gradeBox = () => {
      $('#aGrade').innerHTML = nchars(c.answer) ? `${ST.claudeHTML(() => promptGrade(c)).replace('Claude で添削', '提出して添削')}${pasteHTML('grade', 'Claude の添削を貼り付け（最後の ```json を含めて全文）')}` : '<p class="muted small">訳を書くと、添削の依頼ができます。</p>';
      if (nchars(c.answer)) bindPaste('grade', (t) => takeGrade(host, c, t));
    };
    ST.scribbleInput($('#aIn'), { text: () => c.answer || '', setText: (v) => { const had = !!nchars(c.answer); c.answer = v; save(); cnt(); if (had !== !!nchars(v)) gradeBox(); }, placeholder: 'ここに中国語訳を Apple Pencil で書く（スクリブル）' });
    cnt();
    gradeBox();
    $('#aQ').addEventListener('input', (e) => { c.question = e.target.value; save(); });
    if ($('#aHint')) $('#aHint').addEventListener('click', () => { c.hints++; save(); vAnswer(host, c); });
    $('#aQuit').addEventListener('click', () => { if (!nchars(c.answer) || confirm('この問題と下書きを破棄しますか？')) { st.cur = null; save(); vPractice(host); } });
  }
  function takeGrade(host, c, text) {
    const r = parseJSON(text);
    if (!r || typeof r.total_score !== 'number' || !Array.isArray(r.sentences)) return '添削の JSON が読み取れません。最後の ```json ブロックを含めて、返答の全文を貼り付けてください。';
    r.total_score = Math.max(0, Math.min(100, Math.round(r.total_score)));
    c.result = r;
    const id = c.attemptId || uid();
    c.attemptId = id;
    save();
    put({ id, kind: 'attempt', at: Date.now(), d: todayS(), ex: c.ex, answer: c.answer, hints: c.hints, question: c.question || '', score: r.total_score, result: r });
    // アプリ共通の弱点の記録（Progress の Writing・Today の Writing focus）にも入れる
    const tags = {};
    r.sentences.forEach((s) => (s.issues || []).forEach((i) => {
      if (i.level !== 'error') return;
      const t = /同形異義|和製|日本語/.test(i.weakness_tag || '') ? 'wasei' : CAT2TAG[i.category];
      if (t) tags[t] = (tags[t] || 0) + 1;
    }));
    ST.addFb(`jz|${id}`, { d: todayS(), score: r.total_score, max: 100, tags, weak: r.next_focus || '', kind: '日文中訳', title: c.ex.title });
    toast('添削を記録しました');
    vPractice(host);
    return '';
  }

  // 3. 添削を読む
  function ringHTML(score) {
    const r = 56;
    const C = 2 * Math.PI * r;
    const a = 0.8 * 2 * Math.PI;
    return `<div class="jz-ring" role="img" aria-label="${score}点（合格目安${PASS}点）"><svg viewBox="0 0 132 132" aria-hidden="true">
        <circle cx="66" cy="66" r="${r}" fill="none" stroke="var(--line)" stroke-width="8"/>
        <circle cx="66" cy="66" r="${r}" fill="none" stroke="${score >= PASS ? 'var(--ink)' : 'var(--accent)'}" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - score / 100)}"/>
        <line x1="${66 + 48 * Math.cos(a)}" y1="${66 + 48 * Math.sin(a)}" x2="${66 + 64 * Math.cos(a)}" y2="${66 + 64 * Math.sin(a)}" stroke="var(--ink)" stroke-width="2"/></svg>
      <div class="v"><div>${score}<small>／100</small></div></div></div>`;
  }
  function highlight(text, parts) {
    if (!text) return '<span class="muted">（訳なし）</span>';
    const marks = [];
    parts.forEach((p) => { if (!p) return; const i = text.indexOf(p); if (i >= 0 && !marks.some(([s, e]) => i < e && i + p.length > s)) marks.push([i, i + p.length]); });
    marks.sort((x, y) => x[0] - y[0]);
    let pos = 0;
    let out = '';
    marks.forEach(([s, e]) => { out += esc(text.slice(pos, s)) + `<mark class="jz-hl">${esc(text.slice(s, e))}</mark>`; pos = e; });
    return `<span lang="zh-CN" class="serif">${out}${esc(text.slice(pos))}</span>`;
  }
  function exprsHTML(list) {
    const have = new Set(st.exprs.map((e) => e.zh));
    return `<div class="jz-exprs">${list.map((x, i) => `<div class="jz-ex"><span class="zh serif" lang="zh-CN">${esc(x.zh)}</span><span class="py">${esc(x.pinyin || '')}</span><span class="ja">${esc(x.ja || '')}</span>${x.note ? `<span class="jz-note">${esc(x.note)}</span>` : ''}
        <div class="tools"><button class="btn sm" data-ex="${i}" ${have.has(x.zh) ? 'disabled' : ''}>${have.has(x.zh) ? 'ノートに保存済み' : 'ノートに保存'}</button></div></div>`).join('')}</div>`;
  }
  function vResult(host, c, readOnly) {
    const r = c.result;
    const ex = c.ex;
    const all = (r.sentences || []).flatMap((s) => s.issues || []);
    const cnt = (lv) => all.filter((i) => i.level === lv).length;
    const exprs = r.expressions_to_learn || [];
    host.innerHTML = `${readOnly ? '' : steps(3)}
      <section class="jz-panel jz-score">${ringHTML(r.total_score)}
        <div class="c"><h2>${esc(ex.title)}</h2><p>${esc(r.grade_comment || '')}</p>
          <div class="chips"><span class="lv error">誤り ${cnt('error')}</span><span class="lv improve">改善 ${cnt('improve')}</span><span class="lv ok">別解OK ${cnt('ok')}</span>${c.hints ? `<span class="chip">ヒント ${c.hints}回</span>` : ''}</div></div>
      </section>
      <section class="jz-panel"><h3 class="label">文ごとの添削</h3>
        ${(r.sentences || []).map((s, k) => {
          const errs = (s.issues || []).filter((i) => i.level !== 'ok').map((i) => i.user_part);
          return `<div class="jz-sent">
            <div class="no"><span>第${s.id || k + 1}文</span>${s.deduction ? `<span class="ded">−${s.deduction}</span>` : '<span class="full">満点</span>'}</div>
            <div class="k">問題</div><div class="x ja">${esc(s.ja || '')}</div>
            <div class="k">あなた</div><div class="x">${highlight(s.user || '', errs)}</div>
            <div class="k">模範訳</div><div class="x">${zh(s.model_answer || '')}</div>
            <div class="k">原文</div><div class="x orig">${zh(s.original || '')}</div>
            ${(s.issues || []).length ? `<div class="issues">${s.issues.map((i) => `<div class="iss"><span class="lv ${LV[i.level] ? i.level : 'improve'}">${LV[i.level] || esc(i.level)}</span>
              <div class="body"><div class="pair">${i.user_part ? `<del lang="zh-CN">${esc(i.user_part)}</del>` : ''}${i.user_part && i.better ? ' → ' : ''}${i.better ? `<ins lang="zh-CN">${esc(i.better)}</ins>` : ''}</div>
                <div class="why">${esc([i.category, i.explanation].filter(Boolean).join('：'))}</div>
                ${i.weakness_tag ? `<small class="muted">弱点：${esc(i.weakness_tag)}${i.repeat ? ' <span class="rep">くり返し</span>' : ''}</small>` : ''}</div></div>`).join('')}</div>` : ''}
          </div>`;
        }).join('')}
      </section>
      ${exprs.length ? `<section><div class="row"><h3 class="label">覚えるべき表現</h3><span class="spacer"></span><button class="btn sm" id="exAll">すべてノートに保存</button></div>${exprsHTML(exprs)}</section>` : ''}
      <section class="jz-panel">
        ${(r.strengths || []).length ? `<h3 class="label">良かった点</h3><ul class="plain">${r.strengths.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${r.next_focus ? `<h3 class="label" style="margin-top:12px">次の課題</h3><p>${esc(r.next_focus)}</p>` : ''}
        <details class="ja-det"><summary>問題文と原文の全文</summary><p class="jz-prob">${esc(ex.ja_text)}</p><p lang="zh-CN" class="serif" style="line-height:2">${esc(ex.source_zh)}</p>${ex.url ? `<a href="${esc(ex.url)}" target="_blank" rel="noopener">出典を開く</a>` : ''}</details>
      </section>
      <div class="actions">${readOnly ? '<a class="btn" href="#/zhdrill/log">記録に戻る</a>' : '<button class="btn primary" id="rNext">次の問題へ</button>'}<button class="btn" id="rAgain">同じ問題をもう一度</button></div>`;
    const addExpr = (x) => { if (!st.exprs.some((e) => e.zh === x.zh)) st.exprs.unshift({ id: uid(), zh: x.zh, pinyin: x.pinyin || '', ja: x.ja || '', note: x.note || '', from: ex.title, mastered: false, at: todayS() }); };
    host.querySelectorAll('[data-ex]').forEach((b) => b.addEventListener('click', () => { addExpr(exprs[+b.dataset.ex]); save(); b.disabled = true; b.textContent = 'ノートに保存済み'; }));
    const all2 = host.querySelector('#exAll');
    if (all2) all2.addEventListener('click', () => { exprs.forEach(addExpr); save(); host.querySelectorAll('[data-ex]').forEach((b) => { b.disabled = true; b.textContent = 'ノートに保存済み'; }); toast(`${exprs.length} 件を表現ノートに保存`); });
    const nx = host.querySelector('#rNext');
    if (nx) nx.addEventListener('click', () => { st.cur = null; save(); vPractice(host); window.scrollTo(0, 0); });
    host.querySelector('#rAgain').addEventListener('click', () => { st.cur = { ex: { ...ex }, answer: '', hints: 0, question: '' }; save(); location.hash = '#/zhdrill/practice'; rerender(); window.scrollTo(0, 0); });
  }

  // ---------- 原文ストック ----------
  function vStock(host) {
    host.innerHTML = `<section class="jz-panel"><h2>原文を登録</h2><p class="muted small">気になる記事を見つけたら本文を貼って保存しておけば、あとで「練習」→「ストックから」ですぐ出題できます。</p>${pasteForm(false)}</section>
      <h3 class="label">ストック（${DB.corpus.length}本）</h3>
      ${DB.corpus.length ? `<div class="jz-list">${DB.corpus.map((x) => `<div class="jz-item"><div class="t"><b>${esc(x.title || '無題')}</b><small><span class="chip">${esc(x.genre || '—')}</span> ${nchars(x.text)}字${x.url ? ` · <a href="${esc(x.url)}" target="_blank" rel="noopener">出典</a>` : ''}</small></div>
        <div class="row"><button class="btn sm primary" data-use="${x.id}">出題</button><button class="btn sm" data-del="${x.id}">削除</button></div></div>`).join('')}</div>` : '<div class="jz-empty">まだ原文がありません。上のフォームから追加してください。</div>'}
      ${sitesHTML()}`;
    bindPasteForm(host, false);
    host.querySelectorAll('[data-use]').forEach((b) => b.addEventListener('click', () => {
      const x = DB.corpus.find((y) => y.id === b.dataset.use);
      st.cur = { make: { src: x.text, meta: { title: x.title, url: x.url, genre: x.genre, sourceId: x.id } } }; save();
      location.hash = '#/zhdrill/practice';
    }));
    host.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const x = DB.corpus.find((y) => y.id === b.dataset.del);
      if (!confirm(`「${x.title}」を削除しますか？`)) return;
      await remove(x); rerender();
    }));
  }

  // ---------- 表現ノート（日本語 → 中国語の自己テスト） ----------
  let noteAll = false;
  let noteShow = false;
  function vNotes(host) {
    const list = st.exprs.filter((e) => noteAll || !e.mastered);
    host.innerHTML = `<div class="row" style="flex-wrap:wrap;gap:10px"><div class="seg"><button class="${noteAll ? '' : 'on'}" data-f="0">未習得</button><button class="${noteAll ? 'on' : ''}" data-f="1">すべて</button></div><span class="spacer"></span>
        <label class="muted small"><input type="checkbox" id="nShow" ${noteShow ? 'checked' : ''}> 中国語を表示（オフで日本語 → 中国語の自己テスト）</label></div>
      <p class="muted small">未習得の表現は、次の出題で優先して使われます。中国語を隠して、日本語から言えるか・書けるかを確かめ、タップで答えを見ます。</p>
      ${list.length ? `<div class="jz-exprs">${list.map((x) => `<div class="jz-ex ${x.mastered ? 'done' : ''}"><span class="ja">${esc(x.ja)}</span>
          <span class="zh serif ${noteShow ? '' : 'hide'}" lang="zh-CN" data-reveal>${esc(x.zh)}</span><span class="py ${noteShow ? '' : 'hide'}">${esc(x.pinyin || '')}</span>${x.note ? `<span class="jz-note">${esc(x.note)}</span>` : ''}
          <div class="tools"><button class="btn sm" data-m="${x.id}">${x.mastered ? '未習得に戻す' : '覚えた'}</button><button class="btn sm" data-hz="${x.id}" title="Hanzi デッキで手書きの復習">✎ Hanzi</button><button class="btn sm" data-d="${x.id}">削除</button></div></div>`).join('')}</div>`
        : '<div class="jz-empty">添削結果の「覚えるべき表現」から「ノートに保存」を押すと、ここに貯まります。</div>'}`;
    host.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { noteAll = b.dataset.f === '1'; vNotes(host); }));
    host.querySelector('#nShow').addEventListener('change', (e) => { noteShow = e.target.checked; vNotes(host); });
    host.querySelectorAll('[data-reveal]').forEach((z) => z.addEventListener('click', () => { z.classList.remove('hide'); z.nextElementSibling.classList.remove('hide'); }));
    const find = (id) => st.exprs.find((e) => e.id === id);
    host.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { const x = find(b.dataset.m); x.mastered = !x.mastered; save(); vNotes(host); }));
    host.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { if (!confirm('削除しますか？')) return; st.exprs = st.exprs.filter((e) => e.id !== b.dataset.d); save(); vNotes(host); }));
    host.querySelectorAll('[data-hz]').forEach((b) => b.addEventListener('click', () => { const x = find(b.dataset.hz); ST.addHz(x.zh, `${x.pinyin} · ${x.ja}`, '中訳ノート'); toast('Added to Hanzi'); }));
  }

  // ---------- 記録 ----------
  function chartSVG(scores) {
    const W = 600; const H = 170; const L = 34; const R = 10; const T = 10; const B = 22;
    const y = (v) => T + (H - T - B) * (1 - v / 100);
    const x = (i) => (scores.length < 2 ? L + (W - L - R) / 2 : L + ((W - L - R) * i) / (scores.length - 1));
    const pts = scores.map((v, i) => `${x(i)},${y(v)}`).join(' ');
    return `<svg class="jz-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="得点の推移">
      ${[0, 50, 100].map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v}</text>`).join('')}
      <line x1="${L}" x2="${W - R}" y1="${y(PASS)}" y2="${y(PASS)}" stroke="var(--ink)" stroke-width="1.2" stroke-dasharray="5 4"/><text x="${W - R}" y="${y(PASS) - 5}" text-anchor="end" font-size="11" fill="var(--muted)">合格目安 ${PASS}</text>
      ${scores.length > 1 ? `<polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>` : ''}
      ${scores.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="${i === scores.length - 1 ? 5 : 3}" fill="var(--accent)"/>`).join('')}
      <text x="${L}" y="${H - 4}" font-size="11" fill="var(--muted)">直近${scores.length}回</text></svg>`;
  }
  function vLog(host, id) {
    const A = DB.attempts;
    if (id) { const a = A.find((x) => x.id === id); if (a) { vResult(host, { ex: a.ex, answer: a.answer, hints: a.hints, result: a.result }, true); return; } }
    if (!A.length) { host.innerHTML = '<div class="jz-empty">まだ記録がありません。「練習」で1問解いて添削を受けると、得点の推移と弱点がここに出ます。</div>'; return; }
    const sc = A.map((a) => a.score);
    const avg = (xs) => (xs.length ? Math.round(xs.reduce((s, v) => s + v, 0) / xs.length) : 0);
    const Wk = weaknesses().slice(0, 8);
    const max = Wk.length ? Wk[0][1] : 1;
    host.innerHTML = `<div class="jz-stats"><div><b>${A.length}</b><span>練習した問題</span></div><div><b>${avg(sc)}</b><span>平均点</span></div><div><b>${avg(sc.slice(0, 5))}</b><span>直近5回の平均</span></div><div><b>${Math.max(...sc)}</b><span>最高点</span></div></div>
      <section class="jz-panel">${chartSVG(sc.slice(0, 30).reverse())}</section>
      ${Wk.length ? `<section class="jz-panel"><h3 class="label">よく出る弱点（誤りの件数）</h3><div class="bars">${Wk.map(([t, n]) => `<div class="bar-row"><div class="row"><span>${esc(t)}</span><span>${n}</span></div><div class="meter"><i style="width:${Math.max(6, (100 * n) / max)}%"></i></div></div>`).join('')}</div></section>` : ''}
      <h3 class="label">これまでの添削</h3>
      <div class="jz-list">${A.map((a) => `<a class="jz-item" href="#/zhdrill/log/${a.id}"><div class="t"><b>${esc(a.ex.title || '無題')}</b><small><span class="chip">${esc(a.ex.genre || '—')}</span> ${fmtAt(a.at)}${a.hints ? ` · ヒント${a.hints}` : ''}</small></div><span class="jz-sc ${a.score >= PASS ? 'ok' : ''}">${a.score}</span></a>`).join('')}</div>`;
  }

  loadAll();

  return {
    view,
    // Progress のまとめ
    summaryHTML() {
      const A = DB.attempts;
      if (!A.length) return '';
      const sc = A.slice(0, 5).map((a) => a.score);
      const w = weaknesses().slice(0, 3).map(([t]) => t);
      return `<h2 class="section label">日文中訳ドリル</h2><div class="chips"><a class="chip" href="#/zhdrill/log">${A.length} 問</a><span class="chip ${sc.reduce((s, v) => s + v, 0) / sc.length >= PASS ? 'accent' : ''}">直近5回 ${Math.round(sc.reduce((s, v) => s + v, 0) / sc.length)} 点</span>${w.map((t) => `<span class="chip warn">${esc(t)}</span>`).join('')}</div>`;
    },
    exportData: () => ({ st, corpus: DB.corpus, attempts: DB.attempts }),
    async importData(d) {
      st = Object.assign({ cur: null, exprs: [], len: 150, srcMode: 'stock' }, (d && d.st) || {});
      save();
      for (const x of [...DB.corpus, ...DB.attempts]) await remove(x);
      for (const x of [...((d && d.corpus) || []), ...((d && d.attempts) || [])]) await put(x);
    },
  };
};
