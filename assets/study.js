// 過去問・チェックポイント・語彙・学習法ページ。app.js から Study(ctx) で初期化する
window.Study = function Study(ctx) {
  'use strict';

  const { app, store, esc, toast, todayS, addDays, LEFT } = ctx;
  const IDX = window.PAPERS_INDEX;
  const CH = window.CHECKS;
  const G = window.GUIDE;
  const LV = { L1: 'Level 1', P1: 'Pre-1' };
  const SEC_NAME = { L1: 'Listening 1', L2: 'Listening 2', W1: 'Written 1', W2: 'Written 2', W3: 'Written 3', W4: 'Written 4', W5: 'Written 5' };
  const TAGS = { writing: 'Writing', listening: 'Listening', reading: 'Reading', vocab: 'Vocabulary', idiom: 'Idioms', explain: 'Meaning', pinyin: 'Pinyin', grammar: 'Grammar', measure: 'Measure words', conj: 'Connectives', summary: 'Summary', zhja: 'ZH → JA', jazh: 'JA → ZH' };
  const REASONS = [['meaning', 'Meaning'], ['usage', 'Usage'], ['grammar', 'Grammar'], ['colloc', 'Collocation'], ['reading', 'Reading'], ['guess', 'Guess']];
  const CAUSES = [['unknown', "Didn't know"], ['confused', 'Confused'], ['usage', 'Usage'], ['grammar', 'Grammar'], ['colloc', 'Collocation'], ['reading', 'Reading'], ['time', 'Time']];
  const INT = [1, 2, 4, 8, 16, 32, 64, 120];

  // ---------- 保存 ----------
  let qa = store.get('qa', {}); // 問題ごとの解答履歴と復習間隔
  let scores = store.get('scores', {}); // scores[paper][sec] = [{d, s, max}]
  // 以前の版でチェックポイントの答えが Mistakes の記録（ck|…）に入っていたので取り除く（結果は cpr にある）
  Object.keys(qa).filter((k) => k.startsWith('ck|')).forEach((k) => { delete qa[k]; });
  let texts = store.get('texts', {}); // 記述問題の自分の答え
  let vsrs = store.get('vsrs', {}); // 過去問語彙カードの復習間隔
  let cpq = store.get('cpq', {}); // チェックポイントの出題（一度作ったら固定）
  let cpr = store.get('cpr', {}); // チェックポイントの結果
  let focus = store.get('focus', null); // 次のチェックポイントまでの重点
  let hz = store.get('hz', {}); // Hanzi デッキ（手で書けなかった字）
  const save = () => { store.set('qa', qa); store.set('scores', scores); store.set('texts', texts); store.set('vsrs', vsrs); store.set('cpq', cpq); store.set('cpr', cpr); store.set('focus', focus); store.set('hz', hz); };

  // ---------- 過去問データ（IndexedDB） ----------
  const PAPERS = {};
  let ready = false;
  const onReady = [];
  // 過去問と手書きの線は同じ IndexedDB（level1 v4）に入れる。開き方は ink.js にまとめる
  const idb = () => window.Ink.db();
  async function loadPapers() {
    try {
      const db = await idb();
      await new Promise((res) => {
        const req = db.transaction('papers').objectStore('papers').getAll();
        req.onsuccess = () => { req.result.forEach((p) => { PAPERS[p.id] = p; }); res(); };
        req.onerror = () => res();
      });
    } catch (e) { /* IndexedDB が使えない環境では読み込みなしで動かす */ }
    ready = true;
    onReady.splice(0).forEach((f) => f());
  }
  async function putPapers(list) {
    list.forEach((p) => { PAPERS[p.id] = p; });
    try {
      const db = await idb();
      await new Promise((res, rej) => {
        const tx = db.transaction('papers', 'readwrite');
        list.forEach((p) => tx.objectStore('papers').put(p));
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
      });
    } catch (e) { toast('Saved for this session only'); }
  }
  async function importFiles(files) {
    const list = [];
    for (const f of files) {
      try {
        const d = JSON.parse(await f.text());
        const arr = Array.isArray(d) ? d : d.papers ? d.papers : [d];
        arr.filter((p) => p && p.kind === 'chuken-paper' && p.id && p.sections).forEach((p) => list.push(p));
      } catch (e) { /* 壊れたファイルは飛ばす */ }
    }
    if (!list.length) { toast('No papers found'); return 0; }
    await putPapers(list);
    toast(`Imported ${list.length}`);
    return list.length;
  }

  // ---------- 小物 ----------
  const meta = (pid) => IDX.papers.find((p) => p.id === pid) || { id: pid, level: pid.slice(0, 2), round: +pid.slice(3) };
  const title = (pid) => { const m = meta(pid); return `${LV[m.level]} #${m.round}`; };
  const pdf = (id) => `https://drive.google.com/file/d/${id}/view`;
  const qid = (pid, sec, n) => `${pid}|${sec}|${n}`;
  const sectionOf = (pid, sec) => (PAPERS[pid] ? PAPERS[pid].sections.find((s) => s.id === sec) : null);
  const isMC = (s) => s && Array.isArray(s.items);
  const count = (t) => String(t || '').replace(/\s/g, '').length;
  const pct = (x) => `${Math.round(x * 100)}%`;
  const shuffle = (a, seed) => {
    let x = seed || 1;
    const rnd = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
    return b;
  };
  function itemByQid(id) {
    const [pid, sec, n] = id.split('|');
    if (pid === 'cg') return checkItem('grammar', +sec);
    if (pid === 'cp') return checkItem('pinyin', +sec);
    const s = sectionOf(pid, sec);
    if (!s || !s.items) return null;
    const it = s.items.find((x) => x.n === +n);
    return it ? { ...it, pid, sec, passage: (s.passages || []).find((p) => p.id === it.p), stype: s.type } : null;
  }
  function checkItem(kind, i) {
    const r = CH[kind][i];
    if (!r) return null;
    if (kind === 'grammar') return { pid: 'cg', sec: String(i), n: 0, q: r[1], opts: r[2], ans: r[3], why: r[4], tag: 'grammar', ref: r[0] };
    return { pid: 'cp', sec: String(i), n: 0, q: `“${r[0]}”の“${r[1]}”の読みは？`, opts: r[2], ans: r[3], why: r[4], tag: 'pinyin' };
  }
  function refLabel(ref) {
    if (!ref) return '';
    const B = window.BOOKS;
    const m = /^(II|III)-(\d+)$/.exec(ref);
    if (m) {
      const bk = m[1] === 'II' ? B.errors2 : B.errors3;
      const it = bk.items[+m[2] - 1];
      const next = bk.items[+m[2]];
      return it ? `Errors ${m[1]} ${String(m[2]).padStart(2, '0')} · p.${it[0]}–${next ? next[0] - 1 : bk.endPage} · ${it[1]}` : ref;
    }
    if (/^I:/.test(ref)) return `Errors I · ${ref.slice(2)}`;
    return ref;
  }

  // 解答の記録。間違い・勘での正解は復習の最初に戻す
  function record(id, ok, reason) {
    const r = qa[id] || { h: [] };
    r.h.push([todayS(), ok ? 1 : 0, reason || '', '']);
    const weak = !ok || reason === 'guess';
    if (weak) { r.b = 0; r.due = addDays(todayS(), 1); } else if (r.due) { r.b = Math.min(INT.length - 1, (r.b || 0) + 1); r.due = addDays(todayS(), INT[r.b]); }
    qa[id] = r;
    save();
  }
  function setCause(id, cause) {
    const r = qa[id];
    if (!r || !r.h.length) return;
    r.h[r.h.length - 1][3] = cause;
    save();
  }
  const dueQids = () => Object.keys(qa).filter((id) => qa[id].due && qa[id].due <= todayS() && itemByQid(id));
  function interleave(ids) {
    const by = {};
    ids.forEach((id) => { const t = (itemByQid(id) || {}).tag || 'other'; (by[t] = by[t] || []).push(id); });
    const lists = Object.values(by);
    const out = [];
    for (let i = 0; out.length < ids.length; i++) lists.forEach((l) => { if (l[i]) out.push(l[i]); });
    return out;
  }

  // ---------- 語彙カード ----------
  function vocabList() {
    const map = new Map();
    Object.values(PAPERS).sort((a, b) => a.id.localeCompare(b.id)).forEach((p) => {
      const add = (v, src) => { if (v && v.w && !map.has(v.w)) map.set(v.w, { ...v, src }); };
      (p.vocab || []).forEach((v) => add(v, p.id));
      p.sections.forEach((s) => {
        (s.passages || []).forEach((ps) => (ps.vocab || []).forEach((v) => add(v, `${p.id} ${s.id}`)));
        (s.items || []).forEach((it) => (it.vocab || []).forEach((v) => add(v, qid(p.id, s.id, it.n))));
        (s.tasks || []).forEach((t) => (t.vocab || []).forEach((v) => add(v, `${p.id} ${s.id}`)));
      });
    });
    return [...map.values()];
  }
  function groupList() {
    const out = [];
    Object.values(PAPERS).forEach((p) => (p.groups || []).forEach((g) => out.push({ ...g, src: p.id })));
    return out;
  }
  function vocabQueue() {
    const today = todayS();
    const all = vocabList();
    const due = all.filter((v) => vsrs[v.w] && vsrs[v.w].due <= today);
    const wrong = new Set(Object.keys(qa).filter((id) => qa[id].h.some((h) => !h[1])));
    const fresh = all.filter((v) => !vsrs[v.w]).sort((a, b) => (wrong.has(b.src) ? 1 : 0) - (wrong.has(a.src) ? 1 : 0));
    const newToday = Object.values(vsrs).filter((x) => x.first === today).length;
    const extra = focus && focus.items.some((f) => f.kind === 'vocab') ? 10 : 0;
    return [...due, ...fresh.slice(0, Math.max(0, 15 + extra - newToday))];
  }

  // ========== Papers 一覧 ==========
  function viewPapers() {
    if (!ready) { onReady.push(viewPapers); app.innerHTML = '<div class="empty">…</div>'; return; }
    const have = Object.keys(PAPERS).length;
    const due = dueQids().length;
    const row = (m) => {
      const loaded = !!PAPERS[m.id];
      const sc = paperScore(m.id);
      const pass = IDX.pass[m.level];
      const scoreTxt = sc.l == null && sc.w == null ? '' : `<span class="${sc.l >= pass.listening ? 'ok' : 'ng'}">L ${sc.l == null ? '–' : sc.l}</span> <span class="${sc.w >= pass.written ? 'ok' : 'ng'}">W ${sc.w == null ? '–' : sc.w}</span>`;
      return loaded
        ? `<a class="prow" href="#/papers/${m.id}"><span class="t">${title(m.id)}</span><span class="muted">${m.date}</span><span class="spacer"></span><span class="sc">${scoreTxt}</span></a>`
        : `<div class="prow off"><span class="t">${title(m.id)}</span><span class="muted">${m.date}</span><span class="spacer"></span><a class="muted" href="${pdf(m.drive.T)}" target="_blank" rel="noopener">PDF</a></div>`;
    };
    app.innerHTML = `
      <div class="row" style="margin:6px 0 14px"><span class="label">Papers</span><span class="spacer"></span><span class="chip">${have} / ${IDX.papers.length}</span></div>
      <div class="actions" style="margin:0 0 18px">
        <label class="btn primary">Import<input type="file" id="pimport" accept="application/json,.json" multiple hidden></label>
        <a class="btn" href="#/guide">Exam guide</a>
        <a class="btn" href="#/method">Method</a>
      </div>
      ${have ? '' : `<p class="muted small">Drive の <a href="${IDX.folder}" target="_blank" rel="noopener">過去問フォルダ</a> にある <b>paper-*.json</b> を選んで読み込みます（複数選択可）。データはこの端末の中にだけ保存されます。</p>`}
      <a class="task link-card" href="#/papers/review"><div class="body"><div class="name"><b>Mistakes</b><span class="min">${due} due</span></div><div class="meta">間違えた問題と勘で当たった問題を、間隔を空けて解き直す</div></div></a>
      <div class="cols2">
        <div><h2 class="section label">Level 1</h2>${IDX.papers.filter((m) => m.level === 'L1').map(row).join('')}</div>
        <div><h2 class="section label">Pre-1</h2>${IDX.papers.filter((m) => m.level === 'P1').map(row).join('')}</div>
      </div>
    `;
    app.querySelector('#pimport').addEventListener('change', async (e) => { if (await importFiles(e.target.files)) viewPapers(); });
  }

  function paperScore(pid) {
    const sc = scores[pid] || {};
    const last = (sec) => (sc[sec] && sc[sec].length ? sc[sec][sc[sec].length - 1].s : null);
    const sum = (secs) => { const v = secs.map(last); return v.every((x) => x == null) ? null : v.reduce((a, b) => a + (b || 0), 0); };
    return { l: sum(['L1', 'L2']), w: sum(['W1', 'W2', 'W3', 'W4', 'W5']) };
  }
  function saveScore(pid, sec, s, max) {
    scores[pid] = scores[pid] || {};
    (scores[pid][sec] = scores[pid][sec] || []).push({ d: todayS(), s: Math.round(s), max });
    save();
  }

  // ========== 1回分 ==========
  let timer = store.get('timer', null);
  function viewPaper(pid) {
    const p = PAPERS[pid];
    if (!ready) { onReady.push(() => viewPaper(pid)); return; }
    if (!p) { location.hash = '#/papers'; return; }
    const m = meta(pid);
    const sc = paperScore(pid);
    const pass = IDX.pass[m.level];
    const bar = (v, need) => `<div class="meter"><i style="width:${(v || 0)}%"></i><s style="left:calc(${need}% - 1px)"></s></div>`;
    const timerLeft = timer && timer.pid === pid ? Math.max(0, timer.end - Date.now()) : 0;
    app.innerHTML = `
      <div class="daynav"><a class="icon-btn" href="#/papers" aria-label="Back">${LEFT}</a><div class="date">${title(pid)}<small>${m.date}</small></div><span style="width:36px"></span></div>
      <div class="bars">
        <div class="bar-row"><div class="row"><span>Listening</span><span>${sc.l == null ? '–' : sc.l} / 100 · pass ${pass.listening}</span></div>${bar(sc.l, pass.listening)}</div>
        <div class="bar-row"><div class="row"><span>Written</span><span>${sc.w == null ? '–' : sc.w} / 100 · pass ${pass.written}</span></div>${bar(sc.w, pass.written)}</div>
      </div>
      <div class="actions"><button class="btn" id="timer">${timerLeft ? `${Math.ceil(timerLeft / 60000)} min left · Stop` : `Timer ${IDX.minutes[m.level]} min`}</button>
        <a class="btn" href="${pdf(m.drive.T)}" target="_blank" rel="noopener">PDF</a></div>
      ${p.notes ? `<div class="note-box">${esc(p.notes)}</div>` : ''}
      <div class="tasks secgrid" style="margin-top:16px">${p.sections.map((s) => {
        const h = (scores[pid] || {})[s.id] || [];
        const last = h.length ? h[h.length - 1] : null;
        return `<a class="task link-card" href="#/papers/${pid}/${s.id}"><div class="body">
          <div class="name"><b>${SEC_NAME[s.id] || s.id}</b><span class="min">${last ? `${last.s} / ${last.max}` : `${s.pts} pts`}</span></div>
          <div class="meta">${esc(s.title || '')}</div></div></a>`;
      }).join('')}</div>`;
    app.querySelector('#timer').addEventListener('click', () => {
      timer = timerLeft ? null : { pid, end: Date.now() + IDX.minutes[m.level] * 60000 };
      store.set('timer', timer);
      viewPaper(pid);
    });
  }

  // ========== 文字の入力 ==========
  // 文字を書く所はすべてスクリブル（Apple Pencil の手書きを iPadOS が文字にする）の入力欄。
  // Pencil の手書き（canvas）は、聞き取りのメモ帳にだけ使う
  const Ink = window.Ink;
  // 正解が1つの問題の照合（空白と句読点は無視する）
  const norm = (t) => Ink.chars(t).filter((c) => !/[\s，。、；：！？,.;:!?“”"'‘’（）()…—·]/.test(c)).join('');
  const same = (a, b) => norm(a) === norm(b) && norm(b).length > 0;

  // ---------- Hanzi デッキ（手で書けなかった字を、手で書いて思い出す） ----------
  const snippet = (model, i) => { const m = Ink.chars(model); return `${m.slice(Math.max(0, i - 6), i).join('')}□${m.slice(i + 1, i + 7).join('')}`; };
  const hzId = (t, prompt) => `${t}|${prompt}`;
  function addHz(t, prompt, src) {
    t = Ink.chars(t).join('');
    if (!t || !Ink.chars(t).some(Ink.isHan)) return;
    const id = hzId(t, prompt);
    if (!hz[id]) { hz[id] = { t, prompt, src: src || '', b: -1, due: todayS(), added: todayS() }; save(); }
  }
  function removeHz(t, prompt) {
    const id = hzId(t, prompt);
    if (hz[id] && hz[id].b < 0) { delete hz[id]; save(); }
  }
  const hzDue = () => Object.keys(hz).filter((id) => hz[id].due <= todayS());
  // 解答例を字ごとに押せるようにする（押した字は Hanzi デッキへ）
  function tapHTML(model, src) {
    const m = Ink.chars(model);
    return `<div class="src tapm" data-model="${esc(model)}" data-src="${esc(src)}">${m.map((c, i) => (Ink.isHan(c) ? `<span data-ti="${i}" class="${hz[hzId(c, snippet(model, i))] ? 'on' : ''}">${esc(c)}</span>` : esc(c))).join('')}</div>
      <p class="muted small hint">書けなかった字を押すと Hanzi デッキに入ります（Words › Hanzi で手書きの復習）。</p>`;
  }
  app.addEventListener('click', (e) => {
    const s = e.target.closest('.tapm [data-ti]');
    if (s) {
      const box = s.closest('.tapm');
      const model = box.dataset.model;
      const i = +s.dataset.ti;
      const ch = Ink.chars(model)[i];
      const pr = snippet(model, i);
      if (s.classList.toggle('on')) addHz(ch, pr, box.dataset.src); else removeHz(ch, pr);
      return;
    }
    const w = e.target.closest('[data-hzw]');
    if (w) {
      e.stopPropagation();
      if (w.classList.toggle('on')) { addHz(w.dataset.hzw, w.dataset.hzp, 'Vocab'); toast('Added to Hanzi'); } else removeHz(w.dataset.hzw, w.dataset.hzp);
    }
  });
  const hzBtn = (v) => (v && v.w ? `<button type="button" class="mini ${hz[hzId(v.w, `${v.py || ''} · ${v.ja || ''}`)] ? 'on' : ''}" data-hzw="${esc(v.w)}" data-hzp="${esc(`${v.py || ''} · ${v.ja || ''}`)}" aria-label="Add to Hanzi" title="Hanzi デッキに入れる">✎</button>` : '');


  // ---------- 記述問題：スクリブルで書き、Claude アプリで添削する ----------
  // 作文・中訳・要約は答えが一つではないので、Pencil の手書きをスクリブルで文字にして入れ、
  // 原文・解答例・採点の観点と一緒に Claude アプリへ送って採点してもらう
  const TRAD = new Set([...'們個來時對說會國為過還這後經與學點東書車長門見問開關樣當發現電話語讀寫錢體頭業總從無聽覺記議認論應實費氣處習變親雙愛場報難動廣歡進遠選邊際隊陽陰陳隨雜雲靜響順須預領顧顯風飛飯館馬驗鬥魚鳥麗麼黃齊龍歲歷貓萬蘇鄉產給結網線練級統細終組織綠買賣讓識聲樂藝術遊戲極構環視確計證設詞試誤課調談請謝貴資質趕跡軍輕較輪辦農運達違適遲遺鐘鐵銀錯鍵閉間陸險隻雖頁項題類顏願飲餘驚髮鬧鮮黨齒裡傳']);
  function checksHTML(text, o) {
    const n = count(text);
    const out = [];
    if (o.limit) out.push(`<span class="chip ${n >= o.limit[0] && n <= o.limit[1] ? 'accent' : ''}">${n} / ${o.limit[0]}–${o.limit[1]}</span>`);
    else if (n) out.push(`<span class="chip">${n} 字</span>`);
    (o.words || []).forEach((w) => out.push(`<span class="chip ${text.includes(w) ? 'accent' : ''}">${text.includes(w) ? '✓' : '○'} ${esc(w)}</span>`));
    if (o.lang !== 'ja') {
      const tr = [...new Set([...text].filter((c) => TRAD.has(c)))];
      if (tr.length) out.push(`<span class="chip warn">繁体字？ ${esc(tr.join('・'))}</span>`);
    }
    return out.length ? `<div class="chips">${out.join('')}</div>` : '';
  }
  // Pencil で書くとスクリブルが文字にする入力欄（キーボードでもそのまま打てる）
  function scribbleInput(host, o) {
    host.innerHTML = `<textarea class="answer scribble ${o.short ? 'short' : ''}" lang="${o.lang || 'zh-CN'}" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="${esc(o.placeholder || 'Apple Pencil で書く（スクリブル）')}">${esc(o.text())}</textarea><div class="t-checks"></div>`;
    const ta = host.querySelector('textarea');
    const ck = host.querySelector('.t-checks');
    const upd = () => { ck.innerHTML = o.noChecks ? '' : checksHTML(ta.value, o); };
    ta.addEventListener('input', () => { o.setText(ta.value); upd(); });
    upd();
    return { value: () => ta.value, el: ta };
  }

  // ---------- Claude の添削：弱点のタグ ----------
  // 添削の結果は決まったタグで返してもらい、弱点として集計して Today・Progress に生かす
  const FB_TAGS = {
    meaning: ['語義・訳語の選択', '意味のずれ、訳語・語の選び方の誤り', 'Vocab カードで語義と例文を確かめる', '#/idioms/vocab'],
    colloc: ['コロケーション', '動詞と目的語、形容詞と名詞などの組み合わせ', 'Groups で似た語の違いを確かめ、間違えた語で例文を1つ書く', '#/idioms/groups'],
    grammar: ['文法・構文', '構文・文型・品詞の使い方', '文法ドリルと誤用シリーズの該当項目を解き直す', '#/drill/grammar'],
    order: ['語順', '連用修飾・時間詞・介詞句などの位置', '文法ドリルで語順の問題を解き、正しい文を音読する', '#/drill/grammar'],
    particle: ['虚詞・補語', '了・着・过・的地得・介詞・結果補語・方向補語', '誤用シリーズの虚詞・補語の章を読み直す', '#/drill/grammar'],
    wasei: ['和製漢語・日本語の干渉', '日本語の漢語をそのまま使う、日本語の発想の直訳', 'Vocab カードの「和製漢語の罠」を見直す', '#/idioms/vocab'],
    omit: ['訳し落とし・付け足し', '原文の一部を訳していない、原文にない内容を足した', 'Translate で1題、原文と1文ずつ突き合わせて書き直す', '#/translate'],
    style: ['不自然な表現・文体', '意味は通るが不自然、書き言葉と話し言葉の混在', 'Translate の模範訳を音読し、言い回しを1つ借りて書き直す', '#/translate'],
    char: ['誤字・字体', '誤字・脱字、繁体字や日本の字体の混用', 'Hanzi デッキで書けなかった字を書く', '#/idioms/hanzi'],
    logic: ['構成・論理', '段落のつながり、接続表現、論理の飛躍', '要約の「How to build it」を読み、構成を真似て1題書く', '#/papers'],
    point: ['要点の欠落', '要約で原文の要点が抜けている', '要約を1題、要点を先に箇条書きしてから書く', '#/papers'],
    form: ['字数・形式', '字数の過不足、指定語の使い忘れ、下線など', '日文中訳ドリルで、字数を意識して1題', '#/zhdrill'],
  };
  // 添削の記録：fb[key] = [{ d, score, max, tags, weak, kind, text }]（新しいものが後ろ）
  let fb = store.get('fb', {});
  const saveFb = () => store.set('fb', fb);

  // Claude への添削依頼の文章
  function gradePrompt(o) {
    const L = [
      'あなたは中国語検定試験（日本中国語検定協会）の1級・準1級の採点者で、日本語を母語とする学習者を長く教えてきた中国語教師です。次の解答を本番の基準で採点し、学習者が次に生かせるように添削してください。',
      '',
      `■ 問題：${o.title}（${o.kind}・${o.pts}点）`,
    ];
    if (o.instr) L.push(o.instr);
    if (o.passage) L.push('', '■ 本文・原稿', o.passage);
    if (o.src) L.push('', '■ 原文', o.src);
    if (o.points && o.points.length) L.push('', '■ 押さえるべき要点', ...o.points.map((x) => `- ${x}`));
    if (o.words) L.push('', `■ 指定語：${o.words.join('、')}（${o.wordsRule}。使った語には下線を引く）`);
    if (o.limit) L.push(`■ 字数：${o.limit[0]}〜${o.limit[1]}字（句読点も1字）`);
    if (o.model) L.push('', '■ 公式の解答例（これ以外の表現も正解になりうる）', o.model);
    if (o.alt && o.alt.length) L.push('', '■ 別の解答例', ...o.alt);
    if (o.rubric) L.push('', '■ 採点の観点（配点）', ...o.rubric.map(([t, p]) => `- ${t.replace(/^\(\w+\) /, '')}：${p}点`));
    L.push(
      '',
      `■ 学習者の解答（Apple Pencil の手書きを iPad のスクリブルで文字にしたもの。答えは${o.lang === 'ja' ? '日本語' : '中国語（簡体字）'}）`,
      o.answer && o.answer.trim() ? o.answer.trim() : '（未記入）',
      '',
      '■ 次の順に、日本語で書いてください',
      '1. 総評（1〜2行）',
      '2. 誤りの一覧：1つずつ「該当箇所 → 正しい形 → なぜそうなるか」。理由は暗記ではなく理解できるように、語の成り立ち（字の意味）・文法の決まり・コロケーション・日本語との違いから説明する。各項目の最後に、下のタグを［colloc］のように付ける',
      '3. よかった点（伸ばすべき所を1〜2点）',
      '4. 弱点の診断：この解答から分かる弱い所を、重い順に3つまで。「この箇所が弱い」と具体的に',
      '5. 次の練習：弱点ごとに、何をどう練習すればよいか（例：コロケーションなら、同じ動詞と組む名詞を5つ書く）',
      '6. 覚える表現：この問題で身につけたい語・表現を3〜5個（ピンイン・意味・短い例文）',
      '7. 学習者の解答をできるだけ生かして直した全文',
      '',
      '■ タグ（誤りの分類。この中から選ぶ）',
      ...Object.entries(FB_TAGS).map(([k, v]) => `- ${k}：${v[0]}（${v[1]}）`),
      '',
      '■ 最後に、アプリに読み込むための結果を、次の形のまま付けてください（各行1行、ほかの文は入れない）',
      '=== RESULT ===',
      `SCORE: 点数/${o.pts}`,
      'TAGS: タグ=件数, タグ=件数（誤りがなければ none）',
      'WEAK: 一番の弱点を1行で',
      'WORDS: 語|ピンイン|意味; 語|ピンイン|意味（4.・6. のうち書けるようにしたい中国語を3〜5個）',
      '=== END ===',
      '',
      '解答例と言い方が違うだけなら減点しないでください。意味のずれ、文法・語彙の誤り、不自然さを減点してください。スクリブルの読み取りミスと思われる字（形の似た別の字）は「読み取りミス？」として指摘し、減点は控えめにしてください。',
    );
    return L.join('\n');
  }
  // Claude の返答から結果を読む。RESULT ブロックがなければ SCORE の行だけ拾う
  function parseResult(text) {
    const t = String(text || '').replace(/\r/g, '');
    const m = /=+\s*RESULT\s*=+([\s\S]*?)(?:=+\s*END\s*=+|$)/i.exec(t);
    const body = m ? m[1] : t;
    const line = (k) => { const r = new RegExp(`^\\s*\\**${k}\\**\\s*[:：]\\s*(.+)$`, 'im').exec(body); return r ? r[1].trim() : ''; };
    const sc = /(\d+(?:\.\d+)?)\s*[/／]\s*(\d+(?:\.\d+)?)/.exec(line('SCORE') || (/SCORE\s*[:：]\s*([^\n]+)/i.exec(t) || [])[1] || '');
    const tags = {};
    (line('TAGS') || '').split(/[,，、;；]/).forEach((x) => {
      const r = /([a-z]+)\s*(?:[=×x:：]\s*(\d+))?/i.exec(x.trim());
      if (r && FB_TAGS[r[1].toLowerCase()]) tags[r[1].toLowerCase()] = (tags[r[1].toLowerCase()] || 0) + (+r[2] || 1);
    });
    const words = (line('WORDS') || '').split(/[;；]/).map((x) => x.split(/[|｜]/).map((y) => y.trim())).filter((x) => x[0] && Ink.chars(x[0]).some(Ink.isHan));
    return { ok: !!sc, score: sc ? +sc[1] : null, max: sc ? +sc[2] : null, tags, weak: line('WEAK'), words, block: !!m };
  }
  // 添削の結果を貼り付ける所。o: { key, kind, max, title, onScore(score) }
  const results = {};
  function resultHTML(o) {
    const id = `r${++promptN}`;
    results[id] = o;
    const last = (fb[o.key] || []).slice(-1)[0];
    return `<div class="result-box" data-rbox="${id}">
        <div class="row"><span class="label">Claude result</span><span class="spacer"></span><button type="button" class="btn sm" data-paste="${id}">Paste result</button></div>
        <textarea class="answer short paste" data-rin="${id}" placeholder="Claude の返答をここに貼り付け（全文でも、=== RESULT === の部分だけでも）"></textarea>
        <div class="r-out">${last ? fbSummaryHTML(last, o.max) : ''}</div>
      </div>`;
  }
  function fbSummaryHTML(f, max) {
    const rate = f.score != null && f.max ? f.score / f.max : null;
    return `<div class="r-sum">
        ${f.score != null ? `<span class="r-score ${rate >= 0.7 ? 'ok' : 'ng'}">${f.score} / ${f.max || max}</span>` : ''}
        <span class="muted small">${esc(f.d)}</span>
        <div class="chips">${Object.entries(f.tags || {}).map(([k, n]) => `<span class="chip ${n > 1 ? 'warn' : ''}">${esc(FB_TAGS[k] ? FB_TAGS[k][0] : k)} ×${n}</span>`).join('') || '<span class="chip">no errors</span>'}</div>
        ${f.weak ? `<p class="small"><b>Weak:</b> ${esc(f.weak)}</p>` : ''}
        ${f.text ? `<details class="ja-det"><summary>添削の全文</summary><div class="fb-text">${esc(f.text)}</div></details>` : ''}
      </div>`;
  }
  function takeResult(id, text) {
    const o = results[id];
    const box = app.querySelector(`[data-rbox="${id}"]`);
    if (!o || !box) return;
    const r = parseResult(text);
    const out = box.querySelector('.r-out');
    if (!r.ok) { out.innerHTML = '<p class="muted small">SCORE が見つかりません。Claude の返答の最後の「=== RESULT ===」の部分を含めて貼り付けてください。</p>'; return; }
    const entry = { d: todayS(), score: r.score, max: r.max || o.max, tags: r.tags, weak: r.weak, kind: o.kind, title: o.title, text: String(text).slice(0, 8000) };
    const list = (fb[o.key] = fb[o.key] || []);
    // 同じ欄で貼り直したときは、追加せずに置き換える
    if (o.saved != null && list[o.saved]) list[o.saved] = entry;
    else { list.forEach((x) => { delete x.text; }); o.saved = list.push(entry) - 1; }
    saveFb();
    r.words.forEach((w) => addHz(w[0], [w[1], w[2]].filter(Boolean).join(' · '), 'Claude'));
    out.innerHTML = fbSummaryHTML(entry, o.max) + (r.words.length ? `<p class="muted small">${r.words.length} 語を Hanzi デッキに入れました。</p>` : '');
    if (o.onScore) o.onScore(r.score);
    toast('Result saved');
  }
  app.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-paste]');
    if (!b) return;
    const ta = app.querySelector(`[data-rin="${b.dataset.paste}"]`);
    try {
      const t = await navigator.clipboard.readText();
      if (t) { ta.value = t; takeResult(b.dataset.paste, t); return; }
    } catch (err) { /* 読めないときは欄に直接貼り付けてもらう */ }
    ta.focus();
    toast('欄に貼り付けてください');
  });
  app.addEventListener('input', (e) => {
    const ta = e.target.closest && e.target.closest('[data-rin]');
    if (!ta) return;
    clearTimeout(ta._t);
    ta._t = setTimeout(() => { if (/SCORE/i.test(ta.value)) takeResult(ta.dataset.rin, ta.value); }, 400);
  });
  // 設問ごとの最新の点数
  const lastScore = (key) => { const f = (fb[key] || []).slice(-1)[0]; return f ? f.score : null; };

  const prompts = {};
  let promptN = 0;
  function claudeHTML(build) {
    const id = `g${++promptN}`;
    prompts[id] = build;
    return `<div class="claude-box"><button type="button" class="btn accent" data-claude="${id}">Claude で添削</button><button type="button" class="btn" data-copy="${id}">Copy</button>
      <span class="muted small">共有シートで Claude を選ぶ → 返ってきた返答をコピーして、下の Paste result へ</span></div>`;
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand && document.execCommand('copy');
      ta.remove();
      return !!ok;
    }
  }
  app.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-claude], [data-copy]');
    if (!b) return;
    const text = prompts[b.dataset.claude || b.dataset.copy]();
    if (b.dataset.claude && navigator.share) {
      try { await navigator.share({ title: 'Level 1 · 添削', text }); return; } catch (err) { if (err && err.name === 'AbortError') return; }
    }
    toast((await copyText(text)) ? 'Copied — Claude に貼り付けて送信' : 'Copy failed');
  });

  // ========== 4択の練習（過去問・Mistakes・チェックポイント共通） ==========
  // 左＝本文・音声・メモ、右＝設問・解説（iPad では左右、スマホでは上下）
  // st: { list: [item], i, choice, reason, shown, ok: [], onEnd }
  let st = null;
  function startMC(list, onEnd, opts = {}) {
    st = { list, i: 0, choice: 0, reason: '', shown: false, ok: [], onEnd, opts };
  }
  const NUM = '⑴⑵⑶⑷⑸⑹⑺⑻⑼⑽';
  // 本文の空欄番号（⑴〜⑽）を囲み、今の設問の空欄を強調できるようにする
  const blanks = (zh) => esc(zh).replace(/([⑴-⑽])([ab]?)/g, (m, a, b) => `<mark class="blank" data-b="${NUM.indexOf(a) + 1}">${a}${b}</mark>`);
  function ctxKind(it) {
    if (it.write) return 'none';
    if (it.listen && it.audio) return 'audio';
    if (it.passage) return it.stype === 'listen-mc' ? 'listen' : 'read';
    return 'none';
  }
  function leftHTML(it, k) {
    if (k === 'read') return `<div class="pbox passage"><div class="label">Passage</div><div class="zh-text">${blanks(it.passage.zh)}</div><div class="ja-slot"></div></div>`;
    return `<div class="pbox"><div class="row"><button class="btn sm" data-tts="passage">▶ Play</button><button class="btn sm" data-stop>■</button>${rateSel()}<span class="spacer"></span>${k === 'listen' ? '<button class="btn sm" id="script">Script</button>' : ''}</div></div>
      ${k === 'listen' ? '<div class="memo"><div class="label">Memo</div><div class="memo-pad"></div></div>' : ''}
      <div class="script-slot"></div>`;
  }

  function qHTML(it) {
    const optHTML = (it.opts || []).map((o, k) => {
      const n = k + 1;
      let cls = 'opt';
      if (st.choice === n) cls += ' picked';
      if (st.shown && n === it.ans) cls += ' right';
      if (st.shown && st.choice === n && n !== it.ans) cls += ' wrong';
      return `<button class="${cls}" data-opt="${n}" ${st.shown ? 'disabled' : ''}><span class="num">${'①②③④'[k]}</span><span>${esc(o)}</span></button>`;
    }).join('');
    const reasonHTML = st.choice && !st.shown && !st.opts.noReason && !it.write
      ? `<div class="why-pick"><div class="label">Why this answer?</div><div class="chips">${REASONS.map(([k, l]) => `<button class="chip" data-reason="${k}">${l}</button>`).join('')}</div></div>` : '';
    const writeHTML = it.write ? (st.shown
      ? `<p class="muted">あなた：<span class="serif">${esc(st.wv || '（空欄）')}</span></p>`
      : '<div class="wbox"></div><div class="actions"><span class="muted small">ピンインと意味から、Apple Pencil で書く</span><span class="spacer"></span><button class="btn primary" id="wcheck">Check</button></div>') : '';
    return `<div class="qcard">
        <div class="row"><span class="chip">${st.i + 1} / ${st.list.length}</span>${it.tag ? `<span class="chip">${TAGS[it.tag] || it.tag}</span>` : ''}<span class="spacer"></span>${st.opts.label ? `<span class="muted small">${esc(st.opts.label(it))}</span>` : ''}</div>
        ${it.listen && !it.q ? '' : `<div class="q">${esc(it.q || '')}</div>`}
        ${optHTML ? `<div class="opts">${optHTML}</div>` : ''}${writeHTML}
      </div>${reasonHTML}`;
  }
  function explHTML(it) {
    const ok = st.choice === it.ans;
    return `
      <div class="verdict ${ok ? 'ok' : 'ng'}">${ok ? (st.reason === 'guess' ? '✓ Correct — but a guess, so it will come back' : '✓ Correct') : it.write ? `✗ <span class="serif">${esc(it.write)}</span>` : `✗ Answer: ${'①②③④'[it.ans - 1]}`}</div>
      ${it.why ? `<div class="ex-block"><div class="label">Why</div><p>${esc(it.why)}</p></div>` : ''}
      ${it.opt ? `<div class="ex-block"><div class="label">Options</div>${it.opt.map((t, k) => `<p class="${k + 1 === it.ans ? 'right-t' : ''}"><b>${'①②③④'[k]} ${esc(it.opts[k])}</b> — ${esc(t)}</p>`).join('')}</div>` : ''}
      ${it.ev ? `<div class="ex-block"><div class="label">Evidence</div><p class="zh-text">${esc(it.ev)}</p></div>` : ''}
      ${it.more ? `<div class="ex-block"><div class="label">More</div><p>${esc(it.more)}</p></div>` : ''}
      ${it.vocab && it.vocab.length ? `<div class="ex-block"><div class="label">Words</div>${it.vocab.map(vocabLine).join('')}</div>` : ''}
      ${it.ref ? `<div class="ex-block"><div class="label">Study</div><p>${esc(refLabel(it.ref))}</p></div>` : ''}
      ${!ok && !st.opts.noCause && !it.write ? `<div class="why-pick"><div class="label">Cause</div><div class="chips">${CAUSES.map(([k, l]) => `<button class="chip ${st.cause === k ? 'on' : ''}" data-cause="${k}">${l}</button>`).join('')}</div></div>` : ''}
      ${!ok && it.pid !== 'ck' ? `<textarea class="answer mine" lang="zh-CN" placeholder="自分の例文（正解の語を使って）">${esc((qa[st.id] || {}).mine || '')}</textarea>` : ''}
      <div class="actions"><span class="muted small kbd">Enter</span><span class="spacer"></span><button class="btn primary" id="next">${st.i + 1 < st.list.length ? 'Next' : 'Finish'}</button></div>`;
  }

  function vocabLine(v) {
    const parts = v.parts && v.parts.length ? `<span class="parts">${v.parts.map((p) => `${esc(p[0])}＝${esc(p[1])}`).join('　')}</span>` : '';
    return `<div class="vline"><b class="serif">${esc(v.w)}</b> <span class="muted">${esc(v.py || '')}</span> ${esc(v.ja || '')}${v.en ? ` <span class="muted">(${esc(v.en)})</span>` : ''} ${hzBtn(v)}${parts}${v.note ? `<span class="vnote">${esc(v.note)}</span>` : ''}</div>`;
  }
  const rateSel = () => `<select class="rate" aria-label="Speed">${[0.7, 0.8, 0.9, 1, 1.1, 1.2].map((r) => `<option value="${r}" ${tts.rate === r ? 'selected' : ''}>${r}×</option>`).join('')}</select>`;

  function renderMC(container) {
    const it = st.list[st.i];
    st.id = it.qid || qid(it.pid, it.sec, it.n);
    const k = ctxKind(it);
    const lkey = k === 'none' ? 'none' : `${k}|${it.pid}|${it.sec}|${it.passage ? it.passage.id : st.id}`;
    if (container.dataset.lkey !== lkey || !container.querySelector('.split')) {
      container.dataset.lkey = lkey;
      container.innerHTML = `<div class="split ${k === 'none' ? 'qa' : 'ctx'}"><div class="pane-l">${k === 'none' ? '' : leftHTML(it, k)}</div><div class="pane-r"></div></div>`;
      const L0 = container.querySelector('.pane-l');
      if (k !== 'none') bindTTS(L0, { passage: it.passage && it.passage.zh, audio: it.audio });
      const sb = L0.querySelector('#script');
      if (sb) sb.addEventListener('click', () => { st.script = !st.script; renderMC(container); });
      const mp = L0.querySelector('.memo-pad');
      if (mp) Ink.pad(mp, { key: `${it.pid}|${it.sec}|${it.passage.id}|memo`, ratio: 0.7 });
    }
    const L = container.querySelector('.pane-l');
    const Rr = container.querySelector('.pane-r');
    if (k === 'none') {
      L.innerHTML = qHTML(it);
      Rr.innerHTML = st.shown ? explHTML(it) : '<div class="placeholder">Choose an answer, then say why.<br><span class="muted small">1–4 · Enter</span></div>';
    } else {
      Rr.innerHTML = qHTML(it) + (st.shown ? explHTML(it) : '');
      const slot = L.querySelector('.script-slot');
      if (slot) {
        const show = st.shown || st.script;
        const text = k === 'audio' ? it.audio : it.passage.zh;
        slot.innerHTML = show ? `<div class="pbox"><div class="label">Script</div><div class="zh-text">${esc(text)}</div>${st.shown && it.passage && it.passage.ja ? `<details class="ja-det"><summary>日本語訳</summary><div>${esc(it.passage.ja)}</div></details>${(it.passage.vocab || []).map(vocabLine).join('')}` : ''}</div>` : '';
        const sb = L.querySelector('#script');
        if (sb) sb.textContent = st.script ? 'Hide' : 'Script';
      }
      const ja = L.querySelector('.ja-slot');
      if (ja) ja.innerHTML = st.shown && it.passage.ja ? `<details class="ja-det"><summary>日本語訳</summary><div>${esc(it.passage.ja)}</div></details>${(it.passage.vocab || []).map(vocabLine).join('')}` : '';
      // 今の設問の空欄を強調し、そこまで本文をスクロールする
      let first = null;
      L.querySelectorAll('mark.blank').forEach((m) => { const on = +m.dataset.b === it.n; m.classList.toggle('cur', on); if (on && !first) first = m; });
      if (first && L.scrollHeight > L.clientHeight + 4 && !st.shown) {
        const pr = L.getBoundingClientRect();
        const mr = first.getBoundingClientRect();
        if (mr.top < pr.top + 40 || mr.bottom > pr.bottom - 40) L.scrollTo({ top: L.scrollTop + mr.top - pr.top - L.clientHeight / 3, behavior: 'smooth' });
      }
    }
    // 書く設問（チェックポイントの Writing）：スクリブルで書き、解答と自動で照合する
    const wb = container.querySelector('.wbox');
    if (wb) scribbleInput(wb, { short: true, noChecks: true, text: () => st.wv || '', setText: (v) => { st.wv = v; }, placeholder: `${Ink.chars(it.write).length} 字を書く` });
    bindQ(container, it);
  }

  function bindQ(container, it) {
    const reveal = () => {
      st.shown = true;
      const ok = st.choice === it.ans;
      st.ok.push({ it, ok, reason: st.reason });
      if (!st.opts.noRecord) record(st.id, ok, st.reason);
    };
    container.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => {
      st.choice = +b.dataset.opt;
      if (st.opts.noReason) reveal();
      renderMC(container);
    }));
    container.querySelectorAll('[data-reason]').forEach((b) => b.addEventListener('click', () => { st.reason = b.dataset.reason; reveal(); renderMC(container); }));
    container.querySelectorAll('[data-cause]').forEach((b) => b.addEventListener('click', () => { st.cause = b.dataset.cause; setCause(st.id, st.cause); renderMC(container); }));
    const wc = container.querySelector('#wcheck');
    if (wc) wc.addEventListener('click', () => {
      const good = same(st.wv || '', it.write);
      st.choice = good ? it.ans : it.ans === 1 ? 2 : 1;
      if (!good) addHz(it.write, it.q, 'Checkpoint');
      reveal();
      renderMC(container);
    });
    const mine = container.querySelector('.mine');
    if (mine) mine.addEventListener('input', () => { qa[st.id] = qa[st.id] || { h: [] }; qa[st.id].mine = mine.value; save(); });
    const nx = container.querySelector('#next');
    if (nx) nx.addEventListener('click', () => {
      tts.stop();
      if (st.i + 1 < st.list.length) {
        Object.assign(st, { i: st.i + 1, choice: 0, reason: '', shown: false, cause: '', script: false, wv: '' });
        renderMC(container);
        const top = container.querySelector('.pane-r');
        if (top && top.getBoundingClientRect().top < 0) window.scrollTo(0, 0);
      } else st.onEnd(st);
    });
  }
  // Magic Keyboard: 1〜4 で選択、Enter で次へ
  document.addEventListener('keydown', (e) => {
    if (!st || e.metaKey || e.ctrlKey || e.altKey || (e.target.matches && e.target.matches('input, textarea, select'))) return;
    const mc = app.querySelector('#mc');
    if (!mc) return;
    if (/^[1-4]$/.test(e.key)) {
      const b = mc.querySelector(`[data-opt="${e.key}"]:not(:disabled)`);
      if (b) { e.preventDefault(); b.click(); }
    } else if (e.key === 'Enter') {
      const b = mc.querySelector('#next');
      if (b) { e.preventDefault(); b.click(); }
    }
  });

  // ========== 読み上げ（中国語の音声合成） ==========
  const tts = {
    rate: store.get('rate', 0.9),
    ok: typeof window !== 'undefined' && 'speechSynthesis' in window,
    voice() { return this.ok ? speechSynthesis.getVoices().find((v) => /^zh[-_](CN|Hans)/i.test(v.lang)) || speechSynthesis.getVoices().find((v) => /^zh/i.test(v.lang)) : null; },
    speak(text, onend) {
      if (!this.ok) { toast('Speech not available'); return; }
      speechSynthesis.cancel();
      const parts = String(text).split(/(?<=[。！？!?])/).map((x) => x.trim()).filter(Boolean);
      const v = this.voice();
      parts.forEach((p, i) => {
        const u = new SpeechSynthesisUtterance(p);
        u.lang = 'zh-CN';
        u.rate = this.rate;
        if (v) u.voice = v;
        if (i === parts.length - 1 && onend) u.onend = onend;
        speechSynthesis.speak(u);
      });
    },
    stop() { if (this.ok) speechSynthesis.cancel(); },
  };
  function bindTTS(el, texts, onPlay) {
    el.querySelectorAll('[data-tts]').forEach((b) => b.addEventListener('click', () => { tts.speak(texts[b.dataset.tts]); if (onPlay) onPlay(); }));
    el.querySelectorAll('[data-stop]').forEach((b) => b.addEventListener('click', () => tts.stop()));
    el.querySelectorAll('.rate').forEach((s) => s.addEventListener('change', () => { tts.rate = +s.value; store.set('rate', tts.rate); }));
  }

  // ========== 大問の練習 ==========
  function viewSection(pid, sec) {
    if (!ready) { onReady.push(() => viewSection(pid, sec)); return; }
    const s = sectionOf(pid, sec);
    if (!s) { location.hash = `#/papers/${pid}`; return; }
    const head = `<div class="daynav"><a class="icon-btn" href="#/papers/${pid}" aria-label="Back">${LEFT}</a><div class="date">${SEC_NAME[sec]}<small>${title(pid)} · ${s.pts} pts</small></div><span style="width:36px"></span></div>
      ${s.tips ? `<details class="tips"><summary class="label">Tips</summary><p>${esc(s.tips)}</p></details>` : ''}`;
    if (isMC(s)) {
      const list = s.items.map((it) => ({ ...it, pid, sec, passage: (s.passages || []).find((p) => p.id === it.p), stype: s.type }));
      startMC(list, (res) => {
        const got = res.ok.filter((r) => r.ok).reduce((a, r) => a + (r.it.pts || 0), 0);
        saveScore(pid, sec, got, s.pts);
        app.innerHTML = `${head}<div class="complete"><div class="word">${got} / ${s.pts}</div><p class="muted">${res.ok.filter((r) => r.ok).length} / ${res.ok.length} correct · ${res.ok.filter((r) => r.ok && r.reason === 'guess').length} guessed</p></div>
          <div class="actions center"><a class="btn" href="#/papers/${pid}">Back</a><a class="btn primary" href="#/papers/review">Mistakes</a></div>`;
      });
      app.innerHTML = `${head}<div id="mc"></div>`;
      renderMC(app.querySelector('#mc'));
      return;
    }
    if (s.type === 'summary') return viewSummary(pid, s, head);
    if (s.type === 'dictation') return viewDictation(pid, s, head);
    return viewWrite(pid, s, head);
  }

  // 15分などの残り時間を表示するボタン
  function countdown(btn, label, minutes, state) {
    let iv = 0;
    const tick = () => {
      if (!btn.isConnected) { clearInterval(iv); return; }
      if (!state.end) { btn.textContent = label; btn.classList.remove('accent'); return; }
      const left = Math.max(0, state.end - Date.now());
      btn.textContent = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')} · Stop`;
      btn.classList.add('accent');
      if (!left) { state.end = null; clearInterval(iv); toast("Time's up"); tick(); }
    };
    btn.addEventListener('click', () => {
      state.end = state.end ? null : Date.now() + minutes * 60000;
      clearInterval(iv);
      if (state.end) iv = setInterval(tick, 1000);
      tick();
    });
    if (state.end) iv = setInterval(tick, 1000);
    tick();
  }

  // 要約（聞いてメモ → スクリブルで書く → Claude で添削）
  function viewSummary(pid, s, head) {
    const key = `${pid}|${s.id}`;
    const lim = s.limit || IDX.summaryChars[meta(pid).level];
    const p = (s.passages || [])[0] || {};
    let plays = 0;
    let shown = false;
    app.innerHTML = `${head}
      <div class="split write">
        <div class="pane-l">
          <div class="pbox"><div class="row"><button class="btn sm" data-tts="p">▶ Play</button><button class="btn sm" data-stop>■</button>${rateSel()}<span class="spacer"></span><span class="chip" id="plays">Played 0 / 3</span></div>
            <div class="row" style="margin-top:10px"><button class="btn sm" id="t15"></button><span class="muted small">3回聞いてメモ → 15分で書く</span></div></div>
          <div class="memo"><div class="label">Memo</div><div class="memo-pad"></div></div>
          <div id="after-l"></div>
        </div>
        <div class="pane-r">
          <div class="row wbar"><span class="label">Answer · ${lim[0]}–${lim[1]}字</span><span class="spacer"></span><button class="btn" id="show">Check</button></div>
          <div id="ans"></div>
          <div id="after-r"></div>
        </div>
      </div>`;
    const $ = (q) => app.querySelector(q);
    bindTTS(app, { p: p.zh }, () => { plays++; $('#plays').textContent = `Played ${plays} / 3`; });
    Ink.pad($('.memo-pad'), { key: `${key}|memo`, ratio: 0.9 });
    countdown($('#t15'), '15:00 Start', 15, s._t = s._t || {});
    scribbleInput($('#ans'), { limit: lim, text: () => texts[key] || '', setText: (v) => { texts[key] = v; save(); }, placeholder: `要約（${lim[0]}〜${lim[1]}字）を Apple Pencil で書く` });
    const name = `${title(pid)} ${SEC_NAME[s.id]}`;
    const prompt = () => gradePrompt({
      title: name, kind: '聞いて要約', pts: s.pts, limit: lim,
      instr: `中国語の文章を聞き、その内容を${lim[0]}字以上${lim[1]}字以内の中国語に要約する問題（15分）。`,
      passage: p.zh, points: s.guide && s.guide.points, model: s.model, rubric: SUM_RUBRIC, answer: texts[key], lang: 'zh',
    });
    $('#show').addEventListener('click', () => {
      shown = !shown;
      $('#show').textContent = shown ? 'Hide' : 'Check';
      $('#after-l').innerHTML = shown ? `<div class="pbox"><div class="label">Script</div><div class="zh-text">${esc(p.zh || '')}</div>${p.ja ? `<details class="ja-det"><summary>日本語訳</summary><div>${esc(p.ja)}</div></details>` : ''}${(p.vocab || []).map(vocabLine).join('')}</div>` : '';
      $('#after-r').innerHTML = shown ? `
        ${claudeHTML(prompt)}
        ${resultHTML({ key, kind: 'summary', max: s.pts, title: name, onScore: (v) => { const i = $('#rscore'); if (i) i.value = v; } })}
        <div class="ex-block"><div class="label">Model</div>${tapHTML(s.model || '', `${pid} ${s.id}`)}</div>
        ${s.guide ? guideHTML(s.guide) : ''}
        ${rubricHTML(SUM_RUBRIC, s.pts, lastScore(key))}` : '';
      bindRubric(pid, s.id, s.pts);
    });
  }
  function guideHTML(g) {
    return `<div class="ex-block"><div class="label">How to build it</div>
      ${g.points ? `<ol class="pts">${g.points.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
      ${g.build ? `<p>${esc(g.build)}</p>` : ''}
      ${g.phrases ? `<div class="label" style="margin-top:10px">Useful</div>${g.phrases.map((x) => `<p><b class="serif">${esc(x[0])}</b> — ${esc(x[1])}</p>`).join('')}` : ''}
      ${g.trim ? `<p class="muted">${esc(g.trim)}</p>` : ''}</div>`;
  }
  // 点数：Claude の SCORE（貼り付けると自動で入る）、自動採点の点、または観点の合計
  function rubricHTML(rows, max, preset) {
    return `<div class="ex-block rubric"><div class="label">Score</div>${rows.map(([t, p], i) => `<label class="rrow"><input type="checkbox" data-rp="${p}" data-ri="${i}"> <span>${esc(t)}</span><span class="muted">${p}</span></label>`).join('')}
      <div class="actions"><label class="score-in"><input type="number" id="rscore" min="0" max="${max}" step="1" inputmode="numeric" placeholder="0" value="${preset == null || preset === '' ? '' : preset}"> / ${max}</label><span class="muted small">Claude の SCORE・自動採点が入ります（直せます）</span><span class="spacer"></span><button class="btn primary" id="rsave">Save score</button></div></div>`;
  }
  function bindRubric(pid, sec, max) {
    const boxes = [...app.querySelectorAll('[data-rp]')];
    const inp = app.querySelector('#rscore');
    if (!inp) return;
    const sum = () => boxes.filter((b) => b.checked).reduce((a, b) => a + +b.dataset.rp, 0);
    boxes.forEach((b) => b.addEventListener('change', () => { inp.value = sum(); }));
    app.querySelector('#rsave').addEventListener('click', () => {
      const v = inp.value === '' ? sum() : Math.max(0, Math.min(max, Number(inp.value)));
      if (Number.isNaN(v)) { toast('Score?'); return; }
      saveScore(pid, sec, v, max);
      toast('Saved');
    });
  }
  // 記述問題の採点の観点（自己採点にも Claude への依頼にも使う）
  function writeRubric(s, x) {
    if (x.short) return [[`(${x.n}) 正しく書けた`, x.pts]];
    if (x.words) return [[`(${x.n}) 指定語を${wordsRule(x)}、正しい意味・用法で使った`, Math.round(x.pts * 0.375)], [`(${x.n}) 内容がテーマに合い、筋が通っている`, Math.round(x.pts * 0.25)], [`(${x.n}) 文法・語彙の誤りがない`, Math.round(x.pts * 0.25)], [`(${x.n}) 字数が範囲内、字体の混用がない`, x.pts - Math.round(x.pts * 0.375) - 2 * Math.round(x.pts * 0.25)]];
    return [[`(${x.n}) 意味が原文どおり正確（訳し落とし・誤訳がない）`, Math.round(x.pts * 0.6)], [`(${x.n}) 自然な${s.type === 'zhja' ? '日本語' : '中国語'}になっている`, Math.round(x.pts * 0.3)], [`(${x.n}) 誤字・脱字・字体の混用がない`, x.pts - Math.round(x.pts * 0.6) - Math.round(x.pts * 0.3)]];
  }
  const wordsRule = (x) => (x.words.length > 3 && x.limit[1] > 100 ? '3つ以上' : 'すべて');
  const SUM_RUBRIC = [['内容：原文の要点（話題・展開・結論）を落とさず入れた', 20], ['構成：要点のつながりが接続表現で明確', 6], ['正確さ：文法・語彙・誤字がない', 10], ['形式：字数が範囲内、字体を混用していない', 4]];

  // 1字ずつの差分。miss は解答例のうち書けていない字の位置
  function diffChars(mine, model) {
    const a = [...String(mine).replace(/\s/g, '')];
    const b = [...String(model).replace(/\s/g, '')];
    const L = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const hit = new Array(b.length).fill(false);
    for (let i = 0, j = 0; i < a.length && j < b.length;) {
      if (a[i] === b[j]) { hit[j] = true; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
    }
    const ok = hit.filter(Boolean).length;
    const extra = a.length - ok;
    return { html: b.map((c, k) => (hit[k] ? esc(c) : `<mark>${esc(c)}</mark>`)).join(''), miss: b.length - ok, extra, missIdx: b.map((c, k) => (hit[k] ? -1 : k)).filter((k) => k >= 0) };
  }
  // 書けなかった字（漢字だけ）を、前後の文脈つきで Hanzi デッキに入れる
  function hzFromDiff(d, model, src, prompt) {
    const m = Ink.chars(model);
    d.missIdx.forEach((i) => { if (Ink.isHan(m[i])) addHz(m[i], prompt || snippet(model, i), src); });
  }

  // 書き取り（全文を聞き、指定の5か所を漢字で書く）。スクリブルで書き、解答例と1字ずつ自動で照合する
  function viewDictation(pid, s, head) {
    const p = (s.passages || [])[0] || {};
    let shown = false;
    app.innerHTML = `${head}
      <div class="split write">
        <div class="pane-l">
          <div class="pbox"><div class="row"><button class="btn sm" data-tts="all">▶ Whole text</button><button class="btn sm" data-stop>■</button>${rateSel()}</div>
            <p class="muted small" style="margin:8px 0 0">本番は4回：全文 → 5か所を区切って2回 → 全文</p></div>
          <div class="memo"><div class="label">Memo</div><div class="memo-pad"></div></div>
          <div id="after-l"></div>
        </div>
        <div class="pane-r">
          <div class="row wbar"><span class="label">Apple Pencil で書く（スクリブル）</span><span class="spacer"></span><button class="btn" id="show">Check</button></div>
          ${s.tasks.map((t) => `<div class="wtask" data-t="${t.n}"><div class="row"><span class="label">(${t.n}) · ${t.pts} pts</span><span class="spacer"></span><button class="btn sm" data-tts="t${t.n}">▶</button></div>
            <div class="t-in"></div><div class="t-after"></div></div>`).join('')}
          <div id="rub"></div>
        </div>
      </div>`;
    const $ = (q) => app.querySelector(q);
    const texts2 = { all: p.zh };
    s.tasks.forEach((t) => { texts2[`t${t.n}`] = t.model; });
    bindTTS(app, texts2);
    Ink.pad($('.memo-pad'), { key: `${pid}|${s.id}|memo`, ratio: 0.6 });
    const src = `${pid} ${s.id}`;
    s.tasks.forEach((t) => {
      const key = `${pid}|${s.id}|${t.n}`;
      scribbleInput(app.querySelector(`[data-t="${t.n}"] .t-in`), { short: true, noChecks: true, text: () => texts[key] || '', setText: (v) => { texts[key] = v; save(); }, placeholder: '聞こえた文を漢字で書く' });
    });
    $('#show').addEventListener('click', () => {
      shown = !shown;
      $('#show').textContent = shown ? 'Hide' : 'Check';
      let est = 0;
      s.tasks.forEach((t) => {
        const key = `${pid}|${s.id}|${t.n}`;
        const box = app.querySelector(`[data-t="${t.n}"] .t-after`);
        if (!shown) { box.innerHTML = ''; return; }
        const mine = texts[key] || '';
        const d = diffChars(mine, t.model);
        // 1字の置き換えは「抜け1・余分1」と出るので、多い方を誤りの数とみなす
        const pts = Math.max(0, t.pts - 2 * Math.max(d.miss, d.extra));
        est += pts;
        if (norm(mine)) hzFromDiff(d, t.model, src); // 手を付けていない設問の字までは入れない
        box.innerHTML = `<div class="src diff">${d.html}</div>
          <p class="small"><span class="${d.miss || d.extra ? 'ng' : 'ok'}">${d.miss || d.extra ? '✗' : '✓'}</span> ${d.miss ? `${d.miss} 字の聞き落とし・誤り` : '全文一致'}${d.extra ? ` · 余分な字 ${d.extra}` : ''} · 目安 ${pts} / ${t.pts}${d.missIdx.length ? ' · 書けなかった字は Hanzi へ' : ''}</p>
          ${t.note ? `<p class="small">${esc(t.note)}</p>` : ''}${(t.vocab || []).map(vocabLine).join('')}`;
      });
      $('#after-l').innerHTML = shown ? `<div class="pbox"><div class="label">Script</div><div class="zh-text">${esc(p.zh || '')}</div>${p.ja ? `<details class="ja-det"><summary>日本語訳</summary><div>${esc(p.ja)}</div></details>` : ''}${(p.vocab || []).map(vocabLine).join('')}</div>` : '';
      $('#rub').innerHTML = shown ? rubricHTML(s.tasks.map((t) => [`(${t.n}) 全文正確（1字の誤り・抜け・余分ごとに2点引きの目安）`, t.pts]), s.pts, est) : '';
      bindRubric(pid, s.id, s.pts);
    });
  }

  // 翻訳（中文日訳・日文中訳）・作文・ピンインの漢字書き
  // すべてスクリブルで書く。翻訳・作文は Claude で添削し、ピンインの漢字書きは解答例と自動で照合する
  function viewWrite(pid, s, head) {
    const p = (s.passages || [])[0];
    const shown = {};
    const shortOk = {};
    const src = `${pid} ${s.id}`;
    const ja = (t) => s.type === 'zhja' && !t.short; // 日本語で答える
    const kind = (t) => (t.short ? 'ピンインを漢字に' : t.words ? '作文' : s.type === 'zhja' ? '中文日訳' : '日文中訳');
    const tkey = (t) => `${pid}|${s.id}|${t.n}`;
    const block = (t, withSrc) => `<div class="wtask" data-t="${t.n}">
        <div class="label">(${t.n}) · ${t.pts} pts</div>
        ${withSrc ? `<div class="src">${esc(t.src)}</div>` : ''}
        <div class="t-in"></div>
        <div class="actions"><span class="spacer"></span><button class="btn" data-show="${t.n}">Check</button></div>
        <div class="t-after"></div>
      </div>`;
    // 本文がある大問（W4）は左に本文、右に設問。本文がない大問（W5）は設問ごとに左＝原文・解説、右＝答え
    app.innerHTML = `${head}
      ${p ? `<div class="split write"><div class="pane-l"><div class="pbox passage"><div class="label">Passage</div><div class="zh-text">${esc(p.zh)}</div><div class="ja-slot"></div></div></div>
          <div class="pane-r">${s.tasks.map((t) => block(t, true)).join('')}</div></div>`
        : s.tasks.map((t) => `<div class="split write row-split"><div class="pane-l"><div class="label">(${t.n}) · ${t.pts} pts</div><div class="src">${esc(t.src)}</div><div class="t-after-l" data-tl="${t.n}"></div></div>
          <div class="pane-r">${block(t, false).replace(`<div class="label">(${t.n}) · ${t.pts} pts</div>`, '')}</div></div>`).join('')}
      <div id="rub"></div>`;
    const $ = (q) => app.querySelector(q);
    s.tasks.forEach((t) => {
      const host = app.querySelector(`[data-t="${t.n}"] .t-in`);
      scribbleInput(host, {
        lang: ja(t) ? 'ja' : 'zh-CN', limit: t.limit, words: t.words, short: t.short, noChecks: t.short,
        text: () => texts[tkey(t)] || '', setText: (v) => { texts[tkey(t)] = v; save(); },
        placeholder: t.short ? '漢字（簡体字）を Apple Pencil で書く' : t.words ? '作文を Apple Pencil で書く' : ja(t) ? '日本語訳を Apple Pencil で書く' : '中国語訳を Apple Pencil で書く',
      });
    });
    // 大問の点数：ピンインの漢字書きは自動採点、ほかは Claude の SCORE
    const preset = () => {
      let known = false;
      const sum = s.tasks.reduce((a, t) => {
        if (t.short) { if (t.n in shortOk) { known = true; return a + (shortOk[t.n] ? t.pts : 0); } return a; }
        const v = lastScore(tkey(t));
        if (v != null) { known = true; return a + v; }
        return a;
      }, 0);
      return known ? sum : '';
    };
    const prompt = (t) => () => gradePrompt({
      title: `${title(pid)} ${SEC_NAME[s.id]} (${t.n})`, kind: kind(t), pts: t.pts, lang: ja(t) ? 'ja' : 'zh',
      instr: t.words ? 'テーマについて、指定語を使って中国語で文章を書く問題。' : ja(t) ? '本文の下線部を日本語に訳す問題。' : '日本語を中国語に訳す問題。',
      passage: ja(t) && p ? p.zh : '', src: t.words ? '' : t.src, ...(t.words ? { instr: t.src, words: t.words, wordsRule: wordsRule(t), limit: t.limit } : {}),
      model: t.model, alt: t.alt, rubric: writeRubric(s, t), answer: texts[tkey(t)],
    });
    const after = (t) => {
      const on = shown[t.n];
      const target = app.querySelector(`[data-tl="${t.n}"]`) || app.querySelector(`[data-t="${t.n}"] .t-after`);
      const modelHTML = !ja(t) && !t.short ? tapHTML(t.model, src) : `<div class="src">${esc(t.model)}</div>`;
      let head2 = '';
      if (on && t.short) {
        const mine = texts[tkey(t)] || '';
        shortOk[t.n] = same(mine, t.model);
        if (!shortOk[t.n]) hzFromDiff(diffChars(mine, t.model), t.model, src, t.src);
        head2 = `<div class="verdict ${shortOk[t.n] ? 'ok' : 'ng'}">${shortOk[t.n] ? '✓ Correct' : `✗ <span class="serif">${esc(t.model)}</span>`}</div>${shortOk[t.n] ? '' : '<p class="muted small">書けなかった字を Hanzi デッキに入れました。</p>'}`;
      } else if (on) {
        head2 = `${claudeHTML(prompt(t))}${resultHTML({ key: tkey(t), kind: kind(t), max: t.pts, title: `${title(pid)} ${SEC_NAME[s.id]} (${t.n})`, onScore: () => { const i = $('#rscore'); if (i) i.value = preset(); } })}`;
      }
      target.innerHTML = on ? `
        ${head2}
        <div class="ex-block"><div class="label">Model</div>${modelHTML}</div>
        ${t.note ? `<div class="ex-block"><p>${esc(t.note)}</p></div>` : ''}
        ${t.steps && t.steps.length ? `<div class="ex-block"><div class="label">Step by step</div>${t.steps.map((x) => `<div class="step"><div class="serif">${esc(x[0])}</div><div>→ ${esc(x[1])}</div>${x[2] ? `<div class="muted small">${esc(x[2])}</div>` : ''}</div>`).join('')}</div>` : ''}
        ${t.alt && t.alt.length ? `<div class="ex-block"><div class="label">Other ways</div>${t.alt.map((x) => `<p>${esc(x)}</p>`).join('')}</div>` : ''}
        ${t.pit && t.pit.length ? `<div class="ex-block"><div class="label">Watch out</div>${t.pit.map((x) => `<p>${esc(x)}</p>`).join('')}</div>` : ''}
        ${t.vocab && t.vocab.length ? `<div class="ex-block"><div class="label">Words</div>${t.vocab.map(vocabLine).join('')}</div>` : ''}` : '';
      const js = app.querySelector('.ja-slot');
      if (js && p) js.innerHTML = Object.values(shown).some(Boolean) && p.ja ? `<details class="ja-det"><summary>日本語訳</summary><div>${esc(p.ja)}</div></details>${(p.vocab || []).map(vocabLine).join('')}` : '';
      const any = Object.values(shown).some(Boolean);
      $('#rub').innerHTML = any ? rubricHTML(s.tasks.flatMap((x) => writeRubric(s, x)), s.pts, preset()) : '';
      bindRubric(pid, s.id, s.pts);
    };
    app.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => {
      const t = s.tasks.find((x) => String(x.n) === b.dataset.show);
      shown[t.n] = !shown[t.n];
      b.textContent = shown[t.n] ? 'Hide' : 'Check';
      after(t);
    }));
  }

  // ========== Mistakes（間隔反復の解き直し） ==========
  function viewReview() {
    if (!ready) { onReady.push(viewReview); return; }
    const ids = interleave(dueQids());
    const head = `<div class="daynav"><a class="icon-btn" href="#/papers" aria-label="Back">${LEFT}</a><div class="date">Mistakes<small>${ids.length} due</small></div><span style="width:36px"></span></div>`;
    if (!ids.length) { app.innerHTML = `${head}<div class="complete"><span class="seal">完</span><div class="word">Done.</div></div>`; return; }
    const list = ids.map((id) => ({ ...itemByQid(id), qid: id }));
    startMC(list, () => viewReview(), { label: (it) => (it.pid === 'cg' || it.pid === 'cp' ? 'Checkpoint' : `${title(it.pid)} · ${SEC_NAME[it.sec]}`) });
    app.innerHTML = `${head}<div id="mc"></div>`;
    renderMC(app.querySelector('#mc'));
  }

  // ========== 語彙カード・語のグループ（Words タブの一部） ==========
  let vq = null;
  let vshow = false;
  function viewVocab(container, headHTML) {
    if (!ready) { onReady.push(() => viewVocab(container, headHTML)); return; }
    if (!vq) vq = vocabQueue();
    const all = vocabList();
    if (!all.length) { container.innerHTML = `${headHTML}<div class="empty">Papers タブで過去問データを読み込むと、語彙カードが作られます。</div>`; return; }
    if (!vq.length) { container.innerHTML = `${headHTML}<div class="complete"><span class="seal">完</span><div class="word">Done.</div></div>`; return; }
    const v = vq[0];
    container.innerHTML = `${headHTML}
      <div class="card" id="vcard" role="button" tabindex="0">
        <span class="chip cat">${vsrs[v.w] ? 'Review' : 'New'}</span>
        <div class="zh">${esc(v.w)}</div>
        ${vshow ? `<div class="py">${esc(v.py || '')}</div><div class="back">
          <div class="ja">${esc(v.ja || '')}${v.en ? ` <span class="muted">(${esc(v.en)})</span>` : ''}</div>
          ${v.parts && v.parts.length ? `<div class="parts-box">${v.parts.map((x) => `<div><b class="serif">${esc(x[0])}</b> ${esc(x[1])}</div>`).join('')}</div>` : ''}
          ${v.ex ? `<div class="ex">${esc(v.ex)}</div><div class="exja">${esc(v.exJa || '')}</div>` : ''}
          ${v.fam && v.fam.length ? `<div class="muted small" style="margin-top:8px">Family: ${v.fam.map(esc).join('、')}</div>` : ''}
          ${v.note ? `<div class="note">${esc(v.note)}</div>` : ''}
          <div class="row" style="margin-top:14px"><span class="spacer"></span>${hzBtn(v).replace('>✎<', '>✎ Write<')}</div></div>` : '<div class="tap">TAP</div>'}
      </div>
      ${vshow ? '<div class="grade"><button class="btn" data-g="0">Again</button><button class="btn primary" data-g="1">Good</button></div>' : ''}`;
    const card = container.querySelector('#vcard');
    card.addEventListener('click', () => { if (!vshow) { vshow = true; viewVocab(container, headHTML); } });
    container.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => {
      const ok = b.dataset.g === '1';
      const cur = vsrs[v.w] || { b: -1, first: todayS() };
      const nb = ok ? Math.min(INT.length - 1, cur.b + 1) : 0;
      vsrs[v.w] = { ...cur, b: nb, due: ok ? addDays(todayS(), INT[nb]) : todayS() };
      save();
      vq.shift();
      if (!ok) vq.push(v);
      vshow = false;
      viewVocab(container, headHTML);
    }));
  }

  // ========== Hanzi（書けなかった字を、スクリブルで書いて思い出す） ==========
  // お題（文脈の□、またはピンインと意味）を見て書き、解答と自動で照合する
  let hq = null;
  let hval = '';
  let hres = null; // null: まだ / true: 正解 / false: 不正解
  function viewHanzi(container, headHTML) {
    const ids = Object.keys(hz);
    if (!ids.length) {
      container.innerHTML = `${headHTML}<div class="empty narrow-t">書けなかった字がここに集まります。<br><span class="small">書き取り・ピンインの漢字書きで間違えた字、要約・翻訳の解答例で押した字、語彙の ✎、Claude の添削で挙がった語、チェックポイントの Writing で間違えた語。</span></div>`;
      return;
    }
    if (!hq) hq = hzDue().sort((a, b) => hz[a].due.localeCompare(hz[b].due));
    if (!hq.length) {
      const next = ids.map((id) => hz[id].due).sort()[0];
      container.innerHTML = `${headHTML}<div class="complete"><span class="seal">完</span><div class="word">Done.</div><p class="muted">${ids.length} items · next ${next}</p></div>`;
      return;
    }
    const id = hq[0];
    const x = hz[id];
    const d = hres === false ? diffChars(hval, x.t) : null;
    container.innerHTML = `${headHTML}
      <div class="card hzcard">
        <span class="chip cat">${esc(x.src || 'Hanzi')}</span>
        <div class="hz-prompt ${/□/.test(x.prompt) ? 'serif' : ''}">${esc(x.prompt)}</div>
        ${hres === null ? '<div class="hz-in"></div><div class="tap">WRITE WITH APPLE PENCIL</div>'
          : `<div class="verdict ${hres ? 'ok' : 'ng'}">${hres ? '✓ Correct' : '✗'}</div>
            <div class="hz-ans serif diff">${d ? d.html : esc(x.t)}</div>
            ${hres ? '' : `<p class="muted">あなた：<span class="serif">${esc(hval || '（空欄）')}</span></p>`}`}
      </div>
      ${hres === null ? '<div class="grade one"><button class="btn primary" id="hcheck">Check</button></div>'
        : `<div class="grade"><button class="btn" data-g="${hres ? 0 : 1}">${hres ? 'Again' : 'Count as correct'}</button><button class="btn primary" data-g="${hres ? 1 : 0}">Next</button></div>`}`;
    if (hres === null) {
      const inp = scribbleInput(container.querySelector('.hz-in'), { short: true, noChecks: true, text: () => hval, setText: (v) => { hval = v; }, placeholder: `${Ink.chars(x.t).length} 字を書く` });
      inp.el.classList.add('center');
      container.querySelector('#hcheck').addEventListener('click', () => { hres = same(hval, x.t); viewHanzi(container, headHTML); });
    }
    container.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => {
      const ok = b.dataset.g === '1';
      const nb = ok ? Math.min(INT.length - 1, x.b + 1) : 0;
      hz[id] = { ...x, b: nb, due: ok ? addDays(todayS(), INT[nb]) : todayS() };
      save();
      hq.shift();
      if (!ok) hq.push(id);
      hval = '';
      hres = null;
      viewHanzi(container, headHTML);
    }));
  }

  let gq = null;
  function viewGroups(container, headHTML) {
    if (!ready) { onReady.push(() => viewGroups(container, headHTML)); return; }
    const groups = groupList();
    if (!groups.length) { container.innerHTML = `${headHTML}<div class="empty">Papers タブで過去問データを読み込むと、紛らわしい語のグループが作られます。</div>`; return; }
    if (!gq || gq.done) {
      const g = groups[Math.floor(Math.random() * groups.length)];
      const k = Math.floor(Math.random() * g.words.length);
      gq = { g, k, pick: -1 };
    }
    const { g, k } = gq;
    container.innerHTML = `${headHTML}
      <div class="qcard"><div class="label">Which word means…</div><div class="q">${esc(g.words[k][2])}</div>
        <div class="opts">${g.words.map((w, i) => `<button class="opt ${gq.pick >= 0 && i === k ? 'right' : ''} ${gq.pick === i && i !== k ? 'wrong' : ''}" data-w="${i}" ${gq.pick >= 0 ? 'disabled' : ''}><span class="serif">${esc(w[0])}</span></button>`).join('')}</div></div>
      ${gq.pick >= 0 ? `<div class="ex-block"><div class="label">Difference</div>${g.key ? `<p><b>${esc(g.key)}</b></p>` : ''}<p>${esc(g.diff || '')}</p>
        ${g.words.map((w) => `<p><b class="serif">${esc(w[0])}</b> <span class="muted">${esc(w[1])}</span> ${esc(w[2])}</p>`).join('')}</div>
        <div class="actions"><span class="spacer"></span><button class="btn primary" id="gnext">Next</button></div>` : ''}`;
    container.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => { gq.pick = +b.dataset.w; viewGroups(container, headHTML); }));
    const nx = container.querySelector('#gnext');
    if (nx) nx.addEventListener('click', () => { gq.done = true; viewGroups(container, headHTML); });
  }

  // ========== チェックポイント ==========
  const AREA = { grammar: 'Grammar', pinyin: 'Pinyin', idioms: 'Idioms', listening: 'Listening', vocab: 'Exam Vocab', writing: 'Writing' };
  function makeCheck(n) {
    if (cpq[n]) return cpq[n];
    const used = new Set(Object.values(cpq).flat().map((q) => q.key));
    const fresh = (arr, key) => arr.filter((x) => !used.has(key(x)));
    const take = (arr, k, key, seed) => {
      const f = fresh(arr, key);
      const pool = f.length >= k ? f : arr;
      return shuffle(pool, seed).slice(0, k);
    };
    const seed = 97 + n * 31;
    const qs = [];
    // 文法: 基礎編・続編1・続編2から均等に
    const gi = CH.grammar.map((r, i) => ({ i, book: r[0].startsWith('I:') ? 'I' : r[0].startsWith('II-') ? 'II' : 'III' }));
    ['I', 'II', 'III'].forEach((b, j) => take(gi.filter((x) => x.book === b), 5, (x) => `g${x.i}`, seed + j).forEach((x) => qs.push({ key: `g${x.i}`, area: 'grammar', i: x.i })));
    take(CH.pinyin.map((r, i) => i), 6, (i) => `p${i}`, seed + 7).forEach((i) => qs.push({ key: `p${i}`, area: 'pinyin', i }));
    const I = ctx.IDIOMS;
    take(I.map((x) => x.n), 9, (k) => `i${k}`, seed + 11).forEach((k) => qs.push({ key: `i${k}`, area: 'idioms', i: k }));
    take(I.map((x) => x.n), 6, (k) => `l${k}`, seed + 13).forEach((k) => qs.push({ key: `l${k}`, area: 'listening', i: k }));
    const V = vocabList();
    if (V.length >= 8) take(V.map((v) => v.w), 6, (w) => `v${w}`, seed + 17).forEach((w) => qs.push({ key: `v${w}`, area: 'vocab', w }));
    // 手で書く力：4字の成語をピンインと意味から書く（本番の記述はすべて手書き）
    const four = I.filter((x) => { const c = Ink.chars(x.zh); return c.length === 4 && c.every(Ink.isHan); });
    take(four.map((x) => x.n), 6, (k) => `w${k}`, seed + 23).forEach((k) => qs.push({ key: `w${k}`, area: 'writing', i: k }));
    cpq[n] = shuffle(qs, seed + 19);
    save();
    return cpq[n];
  }
  function checkToItem(q, n) {
    const I = ctx.IDIOMS;
    const distract = (pool, correct, k, seed) => shuffle(pool.filter((x) => x !== correct), seed).slice(0, k);
    const pack = (correct, wrongs, seed) => {
      const opts = shuffle([correct, ...wrongs], seed);
      return { opts, ans: opts.indexOf(correct) + 1 };
    };
    if (q.area === 'grammar') { const it = checkItem('grammar', q.i); return { ...it, qid: `cg|${q.i}|0`, area: 'grammar', sub: bookOf(it.ref) }; }
    if (q.area === 'pinyin') { const it = checkItem('pinyin', q.i); return { ...it, qid: `cp|${q.i}|0`, area: 'pinyin', sub: 'Pinyin' }; }
    if (q.area === 'idioms') {
      const x = I[q.i - 1];
      const same = I.filter((y) => y.cat === x.cat).map((y) => y.ja);
      const o = pack(x.ja, distract(same, x.ja, 3, q.i + n), q.i * 7 + n);
      return { pid: 'ck', qid: `ck|i${q.i}|${n}`, q: x.zh, ...o, why: `${x.py}　${x.ja}`, more: `${x.ex}　${x.exJa}${x.note ? `　※${x.note}` : ''}`, tag: 'idiom', area: 'idioms', sub: x.cat };
    }
    if (q.area === 'listening') {
      const x = I[q.i - 1];
      const o = pack(x.exJa, distract(I.map((y) => y.exJa), x.exJa, 3, q.i + n * 3), q.i * 5 + n);
      return { pid: 'ck', qid: `ck|l${q.i}|${n}`, listen: true, audio: x.ex, q: '', ...o, why: x.ex, more: `${x.zh}：${x.ja}`, tag: 'listening', area: 'listening', sub: 'Listening' };
    }
    if (q.area === 'writing') {
      const x = I[q.i - 1];
      return { pid: 'ck', qid: `ck|w${q.i}|${n}`, write: x.zh, q: `${x.py}　${x.ja}`, opts: [], ans: 1, why: `${x.zh}（${x.py}）${x.ja}`, more: `${x.ex}　${x.exJa}`, tag: 'writing', area: 'writing', sub: 'Writing' };
    }
    const V = vocabList();
    const v = V.find((y) => y.w === q.w) || V[0];
    const o = pack(v.ja, distract(V.map((y) => y.ja), v.ja, 3, n * 11), n * 13 + v.w.length);
    return { pid: 'ck', qid: `ck|v|${n}`, q: v.w, ...o, why: `${v.py || ''}　${v.ja}`, vocab: [v], tag: 'vocab', area: 'vocab', sub: 'Exam Vocab' };
  }
  const bookOf = (ref) => `Errors ${ref.startsWith('I:') ? 'I' : ref.startsWith('II-') ? 'II' : 'III'}`;

  function viewCheck(n, retake) {
    n = +n;
    const days = ctx.checkpointDays();
    const day = days[n] ? ctx.toS(days[n]) : '';
    const target = CH.targets[n];
    const res = cpr[n];
    const head = `<div class="daynav"><a class="icon-btn" href="#/today" aria-label="Back">${LEFT}</a><div class="date">CP${n}<small>${day}${target ? ` · target ${pct(target)}` : ' · baseline'}</small></div><span style="width:36px"></span></div>`;
    if (res && !st && !retake) { viewCheckResult(n, head); return; }
    const qs = makeCheck(n);
    const list = qs.map((q) => checkToItem(q, n));
    const areas = {};
    qs.forEach((q) => { areas[q.area] = (areas[q.area] || 0) + 1; });
    if (!st || st.cp !== n) {
      app.innerHTML = `${head}
        <p class="muted">${res ? '前回の結果を上書きして解き直します。' : 'インプットの到達度を測ります。分からない問題は「Guess」を選んでください（勘での正解は分かっていないものとして扱います）。'}</p>
        <div class="stats">${Object.entries(areas).map(([a, c]) => `<span class="chip">${AREA[a]} ${c}</span>`).join('')}<span class="chip">≈ 40 min</span></div>
        <div class="actions"><button class="btn primary" id="go">Start</button>${res ? '<button class="btn" id="seeres">Last result</button>' : ''}</div>`;
      app.querySelector('#go').addEventListener('click', () => {
        startMC(list, (r) => finishCheck(n, r), { noCause: true, noRecord: true });
        st.cp = n;
        app.innerHTML = `${head}<div id="mc"></div>`;
        renderMC(app.querySelector('#mc'));
      });
      const sr = app.querySelector('#seeres');
      if (sr) sr.addEventListener('click', () => viewCheckResult(n, head));
      return;
    }
    app.innerHTML = `${head}<div id="mc"></div>`;
    renderMC(app.querySelector('#mc'));
  }

  function finishCheck(n, r) {
    const answers = r.ok.map((x) => ({ area: x.it.area, sub: x.it.sub, ref: x.it.ref || '', ok: x.ok && x.reason !== 'guess', raw: x.ok, qid: x.it.qid }));
    cpr[n] = { date: todayS(), answers };
    st = null;
    focus = makeFocus(n);
    save();
    location.hash = `#/check/${n}/result`;
  }

  // 分析: 分野別・細目別の正答率（勘での正解は不正解扱い）と、目標に届かない所
  function analyze(n) {
    const res = cpr[n];
    if (!res) return null;
    const target = CH.targets[n] || 0.7;
    const agg = (key) => {
      const m = {};
      res.answers.forEach((a) => { const k = a[key]; m[k] = m[k] || { k, n: 0, ok: 0, wrong: [] }; m[k].n++; if (a.ok) m[k].ok++; else m[k].wrong.push(a); });
      return Object.values(m).map((x) => ({ ...x, acc: x.ok / x.n })).sort((a, b) => a.acc - b.acc);
    };
    const areas = agg('area');
    const subs = agg('sub');
    const total = res.answers.filter((a) => a.ok).length / res.answers.length;
    const prev = n > 0 && cpr[n - 1] ? cpr[n - 1].answers.filter((a) => a.ok).length / cpr[n - 1].answers.length : null;
    return { target, areas, subs, total, prev, weak: subs.filter((s) => s.acc < target) };
  }

  function makeFocus(n) {
    const A = analyze(n);
    if (!A) return null;
    const days = ctx.checkpointDays();
    const from = addDays(ctx.toS(days[n]), 1);
    const to = days[n + 1] ? ctx.toS(days[n + 1]) : ctx.S().exam;
    const items = [];
    A.weak.slice(0, 5).forEach((w) => {
      const a = w.wrong[0] ? w.wrong[0].area : '';
      if (a === 'grammar') {
        const refs = [...new Set(w.wrong.map((x) => x.ref))];
        items.push({ kind: 'grammar', head: w.k, meta: `${pct(w.acc)} · re-read + exercises`, notes: refs.map(refLabel), link: '#/drill/grammar', min: 25 });
      } else if (a === 'pinyin') items.push({ kind: 'pinyin', head: 'Pinyin', meta: `${pct(w.acc)} · 多音字 drill`, notes: [], link: '#/drill/pinyin', min: 15 });
      else if (a === 'idioms') items.push({ kind: 'idioms', head: `Idioms · ${w.k}`, meta: `${pct(w.acc)} · review this type`, notes: [], link: '#/idioms', min: 15 });
      else if (a === 'listening') items.push({ kind: 'listening', head: 'Podcast dictation', meta: `${pct(w.acc)} · +15 sentences / day`, notes: ['Listen › Dictation：1文ずつ聞く → 書き取る → 原稿で確認', 'そのあと同じ文を Shadow で声に出して重ねる'], link: '#/listen/today/dictation', min: 15 });
      else if (a === 'vocab') items.push({ kind: 'vocab', head: 'Exam Vocab', meta: `${pct(w.acc)} · +10 new cards / day`, notes: [], link: '#/idioms/vocab', min: 15 });
      else if (a === 'writing') items.push({ kind: 'writing', head: 'Hanzi · Write', meta: `${pct(w.acc)} · write 10 a day with Pencil`, notes: ['語彙カードの ✎ で書けない語を Hanzi に入れ、手で書いて思い出す'], link: '#/idioms/hanzi', min: 10 });
    });
    return { cp: n, from, to, items };
  }

  function strategy(n, A) {
    const out = [];
    const g = A.areas.find((a) => a.k === 'grammar');
    const words = A.areas.filter((a) => a.k === 'idioms' || a.k === 'vocab');
    const wordAcc = words.length ? words.reduce((s, a) => s + a.ok, 0) / words.reduce((s, a) => s + a.n, 0) : null;
    if (n === 0) out.push('基準測定です。ここで低い分野は、P1（インプット期）のうちに重点的に補います。');
    if (A.total >= A.target + 0.1 && n > 0) out.push('目標を十分に上回っています。今の配分のまま、余った時間は多読と過去問の語彙カードに回してください。');
    if (A.total < A.target && n > 0) out.push(`全体 ${pct(A.total)} で目標 ${pct(A.target)} に届いていません。次の CP までの毎日の Focus に、下の弱点を入れました。`);
    if (g && g.acc < 0.7) out.push('文法の正答率が低めです。誤用シリーズは「読む」だけでなく、各項目の練習問題を解き、間違えた文を自分で直して書き写すと定着します。');
    if (wordAcc != null && wordAcc < 0.6) out.push('語彙・成語が弱点です。1級の長文は語の98%前後が分かって初めて楽に読めます。新出カードの数を増やし、字ごとの意味で覚えてください。');
    const wr = A.areas.find((a) => a.k === 'writing');
    if (wr && wr.acc < 0.7) out.push('手で書く力が弱めです。本番の記述（中訳・要約・書き取り）はすべて手書きなので、読める字でも書けないと減点されます。Hanzi デッキを毎日10字、Apple Pencil で書いてください。');
    if (n === 2 && A.total < 0.7) out.push('インプット期の終わりの時点で7割に届いていません。翻訳演習（Translate の50題）と P2 の開始を2週間遅らせ（日文中訳ドリルはそのまま続けます）、その分をインプットに回すことを勧めます。');
    const W = fbStats(30);
    if (W.tags.length) out.push(`Claude の添削で多い誤り（直近30日）：${W.tags.slice(0, 3).map(([t, n]) => `${FB_TAGS[t][0]} ${n}件`).join('、')}。Today の Writing focus で集中して直します。`);
    if (A.prev != null) out.push(`前回の CP から ${A.total >= A.prev ? '+' : ''}${Math.round((A.total - A.prev) * 100)} ポイント。`);
    return out;
  }

  function viewCheckResult(n, head) {
    n = +n;
    const A = analyze(n);
    if (!A) { location.hash = `#/check/${n}`; return; }
    if (!head) head = `<div class="daynav"><a class="icon-btn" href="#/today" aria-label="Back">${LEFT}</a><div class="date">CP${n}<small>Result</small></div><span style="width:36px"></span></div>`;
    const S = ctx.S();
    app.innerHTML = `${head}
      <div class="hero"><div><div class="count">${Math.round(A.total * 100)}<span style="font-size:.4em">%</span></div><div class="label count-unit">${CH.targets[n] ? `target ${pct(A.target)}` : 'baseline'}</div></div></div>
      <h2 class="section label">Areas</h2>
      <div class="bars">${A.areas.map((a) => `<div class="bar-row"><div class="row"><span>${AREA[a.k] || a.k}</span><span>${a.ok} / ${a.n}</span></div><div class="meter"><i style="width:${a.acc * 100}%"></i><s style="left:calc(${A.target * 100}% - 1px)"></s></div></div>`).join('')}</div>
      <h2 class="section label">Weak points</h2>
      ${A.weak.length ? `<ul class="plain">${A.weak.map((w) => `<li><b>${esc(w.k)}</b> <span class="muted">${w.ok}/${w.n}</span>${[...new Set(w.wrong.filter((x) => x.ref).map((x) => refLabel(x.ref)))].map((x) => `<div class="muted small">${esc(x)}</div>`).join('')}</li>`).join('')}</ul>` : '<p class="muted">None.</p>'}
      <h2 class="section label">Strategy</h2>
      <ul class="plain">${strategy(n, A).map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      ${n === 2 && A.total < 0.7 ? `<div class="actions"><button class="btn accent" id="extend">${S.inputShift ? `Input +${S.inputShift} days` : 'Extend input 2 weeks'}</button></div>` : ''}
      ${focus && focus.cp === n && focus.items.length ? `<h2 class="section label">Focus until next CP</h2><div class="tasks">${focus.items.map((f) => `<div class="task"><div class="body"><div class="name"><b>${esc(f.head)}</b><span class="min">${f.min} min</span></div><div class="meta">${esc(f.meta)}</div>${f.notes.length ? `<ul class="notes">${f.notes.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div></div>`).join('')}</div>` : ''}
      <div class="actions"><button class="btn" id="redo">Retake</button><a class="btn primary" href="#/today">Today</a></div>`;
    const ex = app.querySelector('#extend');
    if (ex && !S.inputShift) ex.addEventListener('click', () => { ctx.setShift(14); toast('Input phase +14 days'); viewCheckResult(n, head); });
    app.querySelector('#redo').addEventListener('click', () => { st = null; delete cpq[n]; save(); viewCheck(n, true); });
  }

  // 弱点の集中ドリル（文法・ピンイン）
  function viewDrill(kind) {
    const head = `<div class="daynav"><a class="icon-btn" href="#/today" aria-label="Back">${LEFT}</a><div class="date">${kind === 'pinyin' ? 'Pinyin' : 'Grammar'}<small>Drill</small></div><span style="width:36px"></span></div>`;
    let idx = CH[kind].map((_, i) => i);
    if (kind === 'grammar' && focus) {
      const subs = new Set(focus.items.filter((f) => f.kind === 'grammar').map((f) => f.head));
      const pick = idx.filter((i) => subs.has(bookOf(CH.grammar[i][0])));
      if (pick.length) idx = pick;
    }
    const list = shuffle(idx, Date.now() % 997).slice(0, 15).map((i) => ({ ...checkItem(kind, i), qid: `${kind === 'grammar' ? 'cg' : 'cp'}|${i}|0` }));
    startMC(list, () => { app.innerHTML = `${head}<div class="complete"><span class="seal">完</span><div class="word">Done.</div></div>`; }, { label: (it) => (it.ref ? refLabel(it.ref) : '') });
    app.innerHTML = `${head}<div id="mc"></div>`;
    renderMC(app.querySelector('#mc'));
  }

  // ========== 分析（Progress タブ用） ==========
  function analytics() {
    const byTag = {};
    const byCause = {};
    const week = { n: 0, ok: 0 };
    const weekAgo = addDays(todayS(), -7);
    Object.entries(qa).forEach(([id, r]) => {
      const it = itemByQid(id);
      const tag = it ? it.tag || 'other' : 'other';
      r.h.forEach((h) => {
        const b = (byTag[tag] = byTag[tag] || { n: 0, ok: 0 });
        b.n++;
        if (h[1] && h[2] !== 'guess') b.ok++;
        if (!h[1] && h[3]) byCause[h[3]] = (byCause[h[3]] || 0) + 1;
        if (h[0] > weekAgo) { week.n++; if (h[1]) week.ok++; }
      });
    });
    const tags = Object.entries(byTag).map(([k, v]) => ({ k, ...v, acc: v.ok / v.n })).sort((a, b) => a.acc - b.acc);
    const causes = Object.entries(byCause).sort((a, b) => b[1] - a[1]);
    const papers = IDX.papers.map((m) => ({ m, s: paperScore(m.id) })).filter((x) => x.s.l != null || x.s.w != null);
    return { tags, causes, week, papers, weakest: tags.find((t) => t.n >= 5) };
  }
  // Claude の添削の集計：直近 days 日のタグ別件数、最近の得点率、最近の弱点
  function fbStats(days = 30) {
    const from = addDays(todayS(), -days);
    const all = Object.entries(fb).flatMap(([k, list]) => list.map((x) => ({ ...x, k }))).sort((a, b) => a.d.localeCompare(b.d));
    const tags = {};
    all.filter((x) => x.d > from).forEach((x) => Object.entries(x.tags || {}).forEach(([t, n]) => { tags[t] = (tags[t] || 0) + n; }));
    const recent = all.filter((x) => x.score != null && x.max).slice(-10);
    const rate = recent.length ? recent.reduce((a, x) => a + x.score / x.max, 0) / recent.length : null;
    return { all, tags: Object.entries(tags).sort((a, b) => b[1] - a[1]), rate, weak: all.filter((x) => x.weak).slice(-3).reverse() };
  }
  function writingHTML() {
    const W = fbStats(30);
    if (!W.all.length) return '';
    const top = W.tags.length ? W.tags[0][1] : 1;
    return `<h2 class="section label">Writing · Claude</h2>
      <div class="stats"><span class="chip">${W.all.length} reviews</span>${W.rate != null ? `<span class="chip ${W.rate >= 0.7 ? '' : 'accent'}">avg ${pct(W.rate)} (last ${Math.min(10, W.all.length)})</span>` : ''}</div>
      ${W.tags.length ? `<div class="bars">${W.tags.map(([t, n]) => `<div class="bar-row"><div class="row"><span>${esc(FB_TAGS[t][0])}</span><span>${n}</span></div><div class="meter"><i style="width:${(n / top) * 100}%"></i></div></div>`).join('')}</div>` : ''}
      ${W.weak.length ? `<ul class="plain" style="margin-top:14px">${W.weak.map((x) => `<li>${esc(x.weak)} <span class="muted small">${esc(x.title || '')} · ${esc(x.d)}</span></li>`).join('')}</ul>` : ''}`;
  }
  function progressHTML() {
    const A = analytics();
    const cps = Object.keys(cpr).map(Number).sort((a, b) => a - b);
    const causeName = Object.fromEntries(CAUSES);
    return `
      <h2 class="section label">This week</h2>
      <div class="stats"><span class="chip">${A.week.n} answers</span><span class="chip">${A.week.n ? pct(A.week.ok / A.week.n) : '–'} correct</span>${A.weakest ? `<span class="chip accent">Focus: ${TAGS[A.weakest.k] || A.weakest.k}</span>` : ''}${A.causes[0] ? `<span class="chip">Top cause: ${causeName[A.causes[0][0]]}</span>` : ''}</div>
      ${cps.length ? `<h2 class="section label">Checkpoints</h2><div class="cp-line">${cps.map((n) => { const a = analyze(n); return `<a href="#/check/${n}/result" class="cp-dot ${CH.targets[n] && a.total < CH.targets[n] ? 'ng' : 'ok'}"><b>${Math.round(a.total * 100)}</b><span>CP${n}</span></a>`; }).join('')}</div>` : ''}
      ${A.papers.length ? `<h2 class="section label">Past papers</h2>${A.papers.map(({ m, s }) => { const p = IDX.pass[m.level]; return `<a class="prow" href="#/papers/${m.id}"><span class="t">${title(m.id)}</span><span class="spacer"></span><span class="${s.l >= p.listening ? 'ok' : 'ng'}">L ${s.l == null ? '–' : s.l}</span>&nbsp;<span class="${s.w >= p.written ? 'ok' : 'ng'}">W ${s.w == null ? '–' : s.w}</span></a>`; }).join('')}` : ''}
      ${A.tags.length ? `<h2 class="section label">By question type</h2><div class="bars">${A.tags.map((t) => `<div class="bar-row"><div class="row"><span>${TAGS[t.k] || t.k}</span><span>${t.ok} / ${t.n}</span></div><div class="meter"><i style="width:${t.acc * 100}%"></i></div></div>`).join('')}</div>` : ''}
      ${writingHTML()}
      ${A.causes.length ? `<h2 class="section label">Causes of mistakes</h2><div class="bars">${A.causes.map(([c, k]) => `<div class="bar-row"><div class="row"><span>${causeName[c]}</span><span>${k}</span></div><div class="meter"><i style="width:${(k / A.causes[0][1]) * 100}%"></i></div></div>`).join('')}</div>` : ''}`;
  }

  // ========== Today に入れる動的なタスク ==========
  function focusTasks(k) {
    if (!focus || !focus.items.length || k < focus.from || k >= focus.to) return [];
    const d = new Date(ctx.toT(k)).getUTCDay();
    if (d === 0 || d === 6 || ctx.S().rest.includes(d)) return [];
    const idx = Math.round((ctx.toT(k) - ctx.toT(focus.from)) / 864e5);
    const pick = [focus.items[idx % focus.items.length]];
    if (focus.items.length > 2) pick.push(focus.items[(idx + 1) % focus.items.length]);
    return pick.map((f, j) => ({ key: `focus-${j}`, track: 'focus', name: 'Focus', min: f.min, fixed: `${k}|focus-${j}`, link: f.link, lines: [{ head: f.head, meta: f.meta, notes: f.notes.slice(0, 4) }] }));
  }
  // 今日 Hanzi の復習があれば Today に入れる
  function extraTasks(k) {
    if (k !== todayS()) return [];
    const out = [];
    const n = hzDue().length;
    if (n) out.push({ key: 'hz', track: 'hz', name: 'Hanzi', min: Math.min(15, 5 + Math.ceil(n / 3)), fixed: `${k}|hz`, link: '#/idioms/hanzi', lines: [{ head: `${n} to write`, meta: 'Apple Pencil · from memory', notes: [] }] });
    // 直近14日の添削で同じ弱点が3回以上出たら、平日にその練習を入れる
    const d = new Date(ctx.toT(k)).getUTCDay();
    const top = fbStats(14).tags.find(([, c]) => c >= 3);
    if (top && d !== 0 && d !== 6 && !ctx.S().rest.includes(d)) {
      const [t, c] = top;
      const last = fbStats(14).all.filter((x) => x.tags && x.tags[t] && x.weak).slice(-1)[0];
      out.push({ key: 'wfocus', track: 'wfocus', name: 'Writing focus', min: 15, fixed: `${k}|wfocus`, link: FB_TAGS[t][3], lines: [{ head: FB_TAGS[t][0], meta: `${c}× in 14 days · Claude`, notes: [FB_TAGS[t][2], ...(last ? [last.weak] : [])] }] });
    }
    return out;
  }
  // 過去問の大問ごとの最新の得点率。低い順
  function weakSections() {
    const out = [];
    Object.entries(scores).forEach(([pid, secs]) => Object.entries(secs).forEach(([sec, h]) => {
      const last = h[h.length - 1];
      if (last && last.max) out.push({ pid, sec, rate: last.s / last.max, label: `${title(pid)} ${SEC_NAME[sec] || sec}` });
    }));
    return out.sort((a, b) => a.rate - b.rate);
  }
  // 弱点のまとめ（Progress の Weak points と日曜の Review 用）。rate は低いほど弱い
  function weakPoints() {
    const out = [];
    const cps = Object.keys(cpr).map(Number).sort((a, b) => a - b);
    if (cps.length) {
      const A = analyze(cps[cps.length - 1]);
      A.areas.filter((a) => a.acc < A.target).forEach((a) => out.push({ label: `Checkpoint · ${AREA[a.k] || a.k}`, rate: a.acc, link: `#/check/${cps[cps.length - 1]}/result` }));
    }
    weakSections().filter((x) => x.rate < 0.85).slice(0, 3).forEach((x) => out.push({ label: `Past paper · ${x.label}`, rate: x.rate, link: `#/papers/${x.pid}/${x.sec}` }));
    const A = analytics();
    A.tags.filter((t) => t.n >= 5 && t.acc < 0.75 && t.k !== 'other').slice(0, 2).forEach((t) => out.push({ label: `Question type · ${TAGS[t.k] || t.k}`, rate: t.acc, link: '#/papers/review' }));
    const W = fbStats(30);
    W.tags.slice(0, 3).filter(([, n]) => n >= 2).forEach(([t, n]) => out.push({ label: `Claude · ${FB_TAGS[t][0]}`, count: n, link: FB_TAGS[t][3], note: FB_TAGS[t][2] }));
    return out;
  }
  function taskMeta(t) {
    if (t.track === 'ppfix') { const w = weakSections().slice(0, 2); return w.length ? w.map((x) => `${x.label} ${pct(x.rate)}`).join(' · ') : 'no paper scores yet'; }
    if (t.track === 'mistakes') return `${dueQids().length} due`;
    if (t.track === 'vocab') { const v = vocabList(); return v.length ? `${vocabQueue().length} cards` : 'import papers first'; }
    return null;
  }
  function taskLink(t) {
    if (t.paper) return `#/papers/${t.paper}`;
    if (t.track === 'mistakes') return '#/papers/review';
    if (t.track === 'vocab') return '#/idioms/vocab';
    if (t.track === 'cp') return `#/check/${t.cp}`;
    if (t.track === 'weekly') return '#/progress';
    if (t.track === 'ppfix') { const w = weakSections()[0]; return w ? `#/papers/${w.pid}/${w.sec}` : '#/papers/review'; }
    if (t.link) return t.link;
    return '';
  }

  // ========== 学習法と試験ガイド ==========
  function viewMethod() {
    app.innerHTML = `<div class="daynav"><a class="icon-btn" href="#/papers" aria-label="Back">${LEFT}</a><div class="date">Method<small>why this plan works</small></div><span style="width:36px"></span></div>
      ${G.method.map((m) => `<div class="mblock"><h3>${esc(m.h)}</h3><p>${esc(m.why)}</p><p class="how">${esc(m.how)}</p></div>`).join('')}
      <h2 class="section label">References</h2><ol class="refs">${G.refs.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>`;
  }
  function viewGuide() {
    const E = G.exam;
    app.innerHTML = `<div class="daynav"><a class="icon-btn" href="#/papers" aria-label="Back">${LEFT}</a><div class="date">Exam guide<small>Level 1 · Pre-1</small></div><span style="width:36px"></span></div>
      <h2 class="section label">Format</h2><table class="tbl">${E.format.map((r) => `<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td><td class="muted">${esc(r[2])}</td></tr>`).join('')}</table>
      <p class="small">${esc(E.pass)}</p>
      <h2 class="section label">Written · 120 min</h2><table class="tbl">${E.time.map((r) => `<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td><td class="muted">${esc(r[2])}</td></tr>`).join('')}</table>
      ${Object.entries({ Listening: E.tips.listening, Written: E.tips.written, Translation: E.tips.translation }).map(([h, l]) => `<h2 class="section label">${h}</h2><ul class="plain">${l.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`).join('')}
      <h2 class="section label">On the day</h2><ul class="plain">${E.day.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  }

  loadPapers();

  return {
    viewPapers, viewPaper, viewSection, viewReview, viewVocab, viewGroups, viewHanzi, viewCheck, viewCheckResult, viewDrill,
    viewMethod, viewGuide, progressHTML, focusTasks, extraTasks, taskMeta, taskLink, importFiles, weakPoints,
    tapHTML, scribbleInput, gradePrompt, claudeHTML, resultHTML, diffChars, hzFromDiff, addHz, isTrad: (c) => TRAD.has(c), FB_TAGS,
    addFb: (key, entry) => { (fb[key] = fb[key] || []).push(entry); saveFb(); },
    hzCount: () => [hzDue().length, Object.keys(hz).length],
    stop: () => { tts.stop(); },
    resetSession: () => { st = null; vq = null; vshow = false; gq = null; hq = null; hval = ''; hres = null; },
    exportData: () => ({ qa, scores, texts, vsrs, cpq, cpr, focus, hz, fb }),
    importData: (d) => { qa = d.qa || {}; scores = d.scores || {}; texts = d.texts || {}; vsrs = d.vsrs || {}; cpq = d.cpq || {}; cpr = d.cpr || {}; focus = d.focus || null; hz = d.hz || {}; fb = d.fb || {}; save(); saveFb(); },
  };
};
