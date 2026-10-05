// 過去問・チェックポイント・語彙・学習法ページ。app.js から Study(ctx) で初期化する
window.Study = function Study(ctx) {
  'use strict';

  const { app, store, esc, toast, todayS, addDays, LEFT, RIGHT } = ctx;
  const IDX = window.PAPERS_INDEX;
  const CH = window.CHECKS;
  const G = window.GUIDE;
  const LV = { L1: 'Level 1', P1: 'Pre-1' };
  const SEC_NAME = { L1: 'Listening 1', L2: 'Listening 2', W1: 'Written 1', W2: 'Written 2', W3: 'Written 3', W4: 'Written 4', W5: 'Written 5' };
  const TAGS = { listening: 'Listening', reading: 'Reading', vocab: 'Vocabulary', idiom: 'Idioms', explain: 'Meaning', pinyin: 'Pinyin', grammar: 'Grammar', measure: 'Measure words', conj: 'Connectives', summary: 'Summary', zhja: 'ZH → JA', jazh: 'JA → ZH' };
  const REASONS = [['meaning', 'Meaning'], ['usage', 'Usage'], ['grammar', 'Grammar'], ['colloc', 'Collocation'], ['reading', 'Reading'], ['guess', 'Guess']];
  const CAUSES = [['unknown', "Didn't know"], ['confused', 'Confused'], ['usage', 'Usage'], ['grammar', 'Grammar'], ['colloc', 'Collocation'], ['reading', 'Reading'], ['time', 'Time']];
  const INT = [1, 2, 4, 8, 16, 32, 64, 120];

  // ---------- 保存 ----------
  let qa = store.get('qa', {}); // 問題ごとの解答履歴と復習間隔
  let scores = store.get('scores', {}); // scores[paper][sec] = [{d, s, max}]
  let texts = store.get('texts', {}); // 記述問題の自分の答え
  let vsrs = store.get('vsrs', {}); // 過去問語彙カードの復習間隔
  let cpq = store.get('cpq', {}); // チェックポイントの出題（一度作ったら固定）
  let cpr = store.get('cpr', {}); // チェックポイントの結果
  let focus = store.get('focus', null); // 次のチェックポイントまでの重点
  const save = () => { store.set('qa', qa); store.set('scores', scores); store.set('texts', texts); store.set('vsrs', vsrs); store.set('cpq', cpq); store.set('cpr', cpr); store.set('focus', focus); };

  // ---------- 過去問データ（IndexedDB） ----------
  const PAPERS = {};
  let ready = false;
  const onReady = [];
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('level1', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('papers', { keyPath: 'id' });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
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
      <h2 class="section label">Level 1</h2>${IDX.papers.filter((m) => m.level === 'L1').map(row).join('')}
      <h2 class="section label">Pre-1</h2>${IDX.papers.filter((m) => m.level === 'P1').map(row).join('')}
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
      <div class="tasks" style="margin-top:16px">${p.sections.map((s) => {
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

  // ========== 4択の練習（過去問・Mistakes・チェックポイント共通） ==========
  // st: { list: [item], i, choice, reason, shown, ok: [], onEnd }
  let st = null;
  function startMC(list, onEnd, opts = {}) {
    st = { list, i: 0, choice: 0, reason: '', shown: false, ok: [], onEnd, opts };
  }

  function itemHTML(it) {
    const passage = it.passage;
    const listen = it.stype === 'listen-mc' || it.listen;
    const showScript = st.shown || st.script;
    let ctxHTML = '';
    if (passage) {
      ctxHTML = listen
        ? `<div class="pbox"><div class="row"><button class="btn sm" data-tts="passage">▶ Play</button><button class="btn sm" data-stop>■</button>${rateSel()}<span class="spacer"></span><button class="btn sm" id="script">${showScript ? 'Hide' : 'Script'}</button></div>
            ${showScript ? `<div class="zh-text">${esc(passage.zh)}</div>${st.shown && passage.ja ? `<details class="ja-det"><summary>日本語訳</summary><div>${esc(passage.ja)}</div></details>` : ''}` : ''}</div>`
        : `<details class="pbox" ${st.i === 0 || !st.shown ? 'open' : ''}><summary class="label">Passage</summary><div class="zh-text">${esc(passage.zh)}</div>${st.shown && passage.ja ? `<details class="ja-det"><summary>日本語訳</summary><div>${esc(passage.ja)}</div></details>` : ''}</details>`;
    }
    if (it.listen && it.audio) ctxHTML = `<div class="pbox"><div class="row"><button class="btn sm" data-tts="audio">▶ Play</button><button class="btn sm" data-stop>■</button>${rateSel()}</div>${st.shown ? `<div class="zh-text">${esc(it.audio)}</div>` : ''}</div>`;
    const optHTML = it.opts.map((o, k) => {
      const n = k + 1;
      let cls = 'opt';
      if (st.choice === n) cls += ' picked';
      if (st.shown && n === it.ans) cls += ' right';
      if (st.shown && st.choice === n && n !== it.ans) cls += ' wrong';
      return `<button class="${cls}" data-opt="${n}" ${st.shown ? 'disabled' : ''}><span class="num">${'①②③④'[k]}</span><span>${esc(o)}</span></button>`;
    }).join('');
    const reasonHTML = st.choice && !st.shown && !st.opts.noReason
      ? `<div class="why-pick"><div class="label">Why this answer?</div><div class="chips">${REASONS.map(([k, l]) => `<button class="chip" data-reason="${k}">${l}</button>`).join('')}</div></div>` : '';
    const ok = st.choice === it.ans;
    const expl = st.shown ? `
      <div class="verdict ${ok ? 'ok' : 'ng'}">${ok ? (st.reason === 'guess' ? '✓ Correct — but a guess, so it will come back' : '✓ Correct') : `✗ Answer: ${'①②③④'[it.ans - 1]}`}</div>
      ${it.why ? `<div class="ex-block"><div class="label">Why</div><p>${esc(it.why)}</p></div>` : ''}
      ${it.opt ? `<div class="ex-block"><div class="label">Options</div>${it.opt.map((t, k) => `<p class="${k + 1 === it.ans ? 'right-t' : ''}"><b>${'①②③④'[k]} ${esc(it.opts[k])}</b> — ${esc(t)}</p>`).join('')}</div>` : ''}
      ${it.ev ? `<div class="ex-block"><div class="label">Evidence</div><p class="zh-text">${esc(it.ev)}</p></div>` : ''}
      ${it.more ? `<div class="ex-block"><div class="label">More</div><p>${esc(it.more)}</p></div>` : ''}
      ${it.vocab && it.vocab.length ? `<div class="ex-block"><div class="label">Words</div>${it.vocab.map(vocabLine).join('')}</div>` : ''}
      ${it.ref ? `<div class="ex-block"><div class="label">Study</div><p>${esc(refLabel(it.ref))}</p></div>` : ''}
      ${!ok && !st.opts.noCause ? `<div class="why-pick"><div class="label">Cause</div><div class="chips">${CAUSES.map(([k, l]) => `<button class="chip ${st.cause === k ? 'on' : ''}" data-cause="${k}">${l}</button>`).join('')}</div></div>` : ''}
      ${!ok && it.pid !== 'ck' ? `<textarea class="answer mine" placeholder="自分の例文（正解の語を使って）">${esc((qa[st.id] || {}).mine || '')}</textarea>` : ''}
      <div class="actions"><span class="spacer"></span><button class="btn primary" id="next">${st.i + 1 < st.list.length ? 'Next' : 'Finish'}</button></div>` : '';
    return `${ctxHTML}
      <div class="qcard">
        <div class="row"><span class="chip">${st.i + 1} / ${st.list.length}</span>${it.tag ? `<span class="chip">${TAGS[it.tag] || it.tag}</span>` : ''}<span class="spacer"></span>${st.opts.label ? `<span class="muted small">${esc(st.opts.label(it))}</span>` : ''}</div>
        ${it.listen && !it.q ? '' : `<div class="q">${esc(it.q || '')}</div>`}
        <div class="opts">${optHTML}</div>
      </div>
      ${reasonHTML}${expl}`;
  }

  function vocabLine(v) {
    const parts = v.parts && v.parts.length ? `<span class="parts">${v.parts.map((p) => `${esc(p[0])}＝${esc(p[1])}`).join('　')}</span>` : '';
    return `<div class="vline"><b class="serif">${esc(v.w)}</b> <span class="muted">${esc(v.py || '')}</span> ${esc(v.ja || '')}${v.en ? ` <span class="muted">(${esc(v.en)})</span>` : ''}${parts}${v.note ? `<span class="vnote">${esc(v.note)}</span>` : ''}</div>`;
  }
  const rateSel = () => `<select class="rate" aria-label="Speed">${[0.7, 0.8, 0.9, 1, 1.1, 1.2].map((r) => `<option value="${r}" ${tts.rate === r ? 'selected' : ''}>${r}×</option>`).join('')}</select>`;

  function renderMC(container, back) {
    const it = st.list[st.i];
    st.id = it.qid || qid(it.pid, it.sec, it.n);
    container.innerHTML = itemHTML(it);
    bindTTS(container, { passage: it.passage && it.passage.zh, audio: it.audio });
    const sb = container.querySelector('#script');
    if (sb) sb.addEventListener('click', () => { st.script = !st.script; renderMC(container, back); });
    container.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => {
      st.choice = +b.dataset.opt;
      if (st.opts.noReason) reveal();
      renderMC(container, back);
    }));
    const reveal = () => {
      st.shown = true;
      const ok = st.choice === it.ans;
      st.ok.push({ it, ok, reason: st.reason });
      if (!st.opts.noRecord) record(st.id, ok, st.reason);
    };
    container.querySelectorAll('[data-reason]').forEach((b) => b.addEventListener('click', () => { st.reason = b.dataset.reason; reveal(); renderMC(container, back); }));
    container.querySelectorAll('[data-cause]').forEach((b) => b.addEventListener('click', () => { st.cause = b.dataset.cause; setCause(st.id, st.cause); renderMC(container, back); }));
    const mine = container.querySelector('.mine');
    if (mine) mine.addEventListener('input', () => { qa[st.id] = qa[st.id] || { h: [] }; qa[st.id].mine = mine.value; save(); });
    const nx = container.querySelector('#next');
    if (nx) nx.addEventListener('click', () => {
      tts.stop();
      if (st.i + 1 < st.list.length) {
        Object.assign(st, { i: st.i + 1, choice: 0, reason: '', shown: false, cause: '', script: false });
        renderMC(container, back);
        window.scrollTo(0, 0);
      } else st.onEnd(st);
    });
  }

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
          <div class="actions"><a class="btn" href="#/papers/${pid}">Back</a><a class="btn primary" href="#/papers/review">Mistakes</a></div>`;
      });
      app.innerHTML = `${head}<div id="mc"></div>`;
      renderMC(app.querySelector('#mc'));
      return;
    }
    if (s.type === 'summary') return viewSummary(pid, s, head);
    if (s.type === 'dictation') return viewDictation(pid, s, head);
    return viewWrite(pid, s, head);
  }

  // 要約（聞いて書く）
  function viewSummary(pid, s, head) {
    const key = `${pid}|${s.id}`;
    const lim = s.limit || IDX.summaryChars[meta(pid).level];
    const p = (s.passages || [])[0] || {};
    let plays = 0;
    let shown = false;
    const draw = () => {
      const t = texts[key] || '';
      const n = count(t);
      app.innerHTML = `${head}
        <div class="pbox"><div class="row"><button class="btn sm" data-tts="p">▶ Play</button><button class="btn sm" data-stop>■</button>${rateSel()}<span class="spacer"></span><span class="chip">Played ${plays} / 3</span></div>
          <div class="row" style="margin-top:8px"><button class="btn sm" id="t15">${s._end ? `${Math.max(0, Math.ceil((s._end - Date.now()) / 60000))} min` : '15:00 start'}</button><span class="muted small">3回聞いてメモ → 15分で書く</span></div></div>
        <textarea class="answer" id="sum" placeholder="要約（${lim[0]}〜${lim[1]}字）">${esc(t)}</textarea>
        <div class="row"><span class="chip ${n >= lim[0] && n <= lim[1] ? 'accent' : ''}" id="cnt">${n} / ${lim[0]}–${lim[1]}</span><span class="spacer"></span><button class="btn" id="show">${shown ? 'Hide' : 'Check'}</button></div>
        ${shown ? `
          <div class="ex-block"><div class="label">Model</div><div class="src">${esc(s.model || '')}</div></div>
          ${s.guide ? guideHTML(s.guide) : ''}
          <div class="ex-block"><div class="label">Script</div><div class="zh-text">${esc(p.zh || '')}</div>${p.ja ? `<details class="ja-det"><summary>日本語訳</summary><div>${esc(p.ja)}</div></details>` : ''}${(p.vocab || []).map(vocabLine).join('')}</div>
          ${rubricHTML([['内容：原文の要点（話題・展開・結論）を落とさず入れた', 20], ['構成：要点のつながりが接続表現で明確', 6], ['正確さ：文法・語彙・誤字がない', 10], ['形式：字数が範囲内、字体を混用していない', 4]], s.pts)}` : ''}`;
      bindTTS(app, { p: p.zh }, () => { plays++; draw(); });
      const ta = app.querySelector('#sum');
      ta.addEventListener('input', () => { texts[key] = ta.value; save(); const c = count(ta.value); const el = app.querySelector('#cnt'); el.textContent = `${c} / ${lim[0]}–${lim[1]}`; el.classList.toggle('accent', c >= lim[0] && c <= lim[1]); });
      app.querySelector('#show').addEventListener('click', () => { shown = !shown; draw(); });
      app.querySelector('#t15').addEventListener('click', () => { s._end = s._end ? null : Date.now() + 15 * 60000; draw(); });
      bindRubric(pid, s.id, s.pts);
    };
    draw();
  }
  function guideHTML(g) {
    return `<div class="ex-block"><div class="label">How to build it</div>
      ${g.points ? `<ol class="pts">${g.points.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
      ${g.build ? `<p>${esc(g.build)}</p>` : ''}
      ${g.phrases ? `<div class="label" style="margin-top:10px">Useful</div>${g.phrases.map((x) => `<p><b class="serif">${esc(x[0])}</b> — ${esc(x[1])}</p>`).join('')}` : ''}
      ${g.trim ? `<p class="muted">${esc(g.trim)}</p>` : ''}</div>`;
  }
  function rubricHTML(rows, max) {
    return `<div class="ex-block rubric"><div class="label">Self-score</div>${rows.map(([t, p], i) => `<label class="rrow"><input type="checkbox" data-rp="${p}" data-ri="${i}"> <span>${esc(t)}</span><span class="muted">${p}</span></label>`).join('')}
      <div class="actions"><span class="chip" id="rsum">0 / ${max}</span><span class="spacer"></span><button class="btn primary" id="rsave">Save score</button></div></div>`;
  }
  function bindRubric(pid, sec, max) {
    const boxes = [...app.querySelectorAll('[data-rp]')];
    if (!boxes.length) return;
    const sum = () => boxes.filter((b) => b.checked).reduce((a, b) => a + +b.dataset.rp, 0);
    boxes.forEach((b) => b.addEventListener('change', () => { app.querySelector('#rsum').textContent = `${sum()} / ${max}`; }));
    app.querySelector('#rsave').addEventListener('click', () => { saveScore(pid, sec, sum(), max); toast('Saved'); });
  }

  // 書き取り（全文を聞き、指定の5か所を漢字で書く）
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
    return { html: b.map((c, k) => (hit[k] ? esc(c) : `<mark>${esc(c)}</mark>`)).join(''), miss: b.length - ok, extra };
  }
  function viewDictation(pid, s, head) {
    const p = (s.passages || [])[0] || {};
    let shown = false;
    const draw = () => {
      app.innerHTML = `${head}
        <div class="pbox"><div class="row"><button class="btn sm" data-tts="all">▶ Whole text</button><button class="btn sm" data-stop>■</button>${rateSel()}</div>
          <p class="muted small" style="margin:8px 0 0">本番は4回：全文 → 5か所を区切って2回 → 全文</p></div>
        ${s.tasks.map((t) => {
          const key = `${pid}|${s.id}|${t.n}`;
          const d = shown ? diffChars(texts[key] || '', t.model) : null;
          return `<div class="wtask"><div class="row"><span class="label">(${t.n}) · ${t.pts} pts</span><span class="spacer"></span><button class="btn sm" data-tts="t${t.n}">▶</button></div>
            <textarea class="answer short" data-key="${key}" placeholder="漢字で書き取る">${esc(texts[key] || '')}</textarea>
            ${shown ? `<div class="src diff">${d.html}</div><p class="muted small">${d.miss ? `${d.miss} 字の聞き落とし・誤り` : '全文一致'}${d.extra ? ` · 余分な字 ${d.extra}` : ''}</p>${t.note ? `<p class="small">${esc(t.note)}</p>` : ''}${(t.vocab || []).map(vocabLine).join('')}` : ''}
          </div>`;
        }).join('')}
        <div class="actions"><span class="spacer"></span><button class="btn" id="show">${shown ? 'Hide' : 'Check'}</button></div>
        ${shown ? `<div class="ex-block"><div class="label">Script</div><div class="zh-text">${esc(p.zh || '')}</div>${p.ja ? `<details class="ja-det"><summary>日本語訳</summary><div>${esc(p.ja)}</div></details>` : ''}${(p.vocab || []).map(vocabLine).join('')}</div>
          ${rubricHTML(s.tasks.map((t) => [`(${t.n}) 全文正確（誤字1字につき減点されるので、1字でも違えば外す）`, t.pts]), s.pts)}` : ''}`;
      const texts2 = { all: p.zh };
      s.tasks.forEach((t) => { texts2[`t${t.n}`] = t.model; });
      bindTTS(app, texts2);
      app.querySelectorAll('textarea[data-key]').forEach((ta) => ta.addEventListener('input', () => { texts[ta.dataset.key] = ta.value; save(); }));
      app.querySelector('#show').addEventListener('click', () => { shown = !shown; draw(); });
      bindRubric(pid, s.id, s.pts);
    };
    draw();
  }

  // 翻訳（中文日訳・日文中訳）
  function viewWrite(pid, s, head) {
    const p = (s.passages || [])[0];
    let shown = {};
    const draw = () => {
      app.innerHTML = `${head}
        ${p ? `<details class="pbox" open><summary class="label">Passage</summary><div class="zh-text">${esc(p.zh)}</div>${shown.any && p.ja ? `<details class="ja-det"><summary>日本語訳</summary><div>${esc(p.ja)}</div></details>` : ''}</details>` : ''}
        ${s.tasks.map((t) => {
          const key = `${pid}|${s.id}|${t.n}`;
          return `<div class="wtask">
            <div class="label">(${t.n}) · ${t.pts} pts</div>
            <div class="src">${esc(t.src)}</div>
            ${t.words ? `<div class="chips">${t.words.map((w) => `<span class="chip ${(texts[key] || '').includes(w) ? 'accent' : ''}">${esc(w)}</span>`).join('')}<span class="chip" data-cnt="${key}">${count(texts[key])} / ${t.limit[0]}–${t.limit[1]}</span></div>` : ''}
            <textarea class="answer ${t.short ? 'short' : ''}" data-key="${key}" placeholder="${t.short ? '漢字（簡体字）' : t.words ? '作文' : s.type === 'zhja' ? '日本語訳' : '中文翻译'}">${esc(texts[key] || '')}</textarea>
            <div class="actions"><span class="spacer"></span><button class="btn" data-show="${t.n}">${shown[t.n] ? 'Hide' : 'Check'}</button></div>
            ${shown[t.n] ? `
              <div class="ex-block"><div class="label">Model</div><div class="src">${esc(t.model)}</div></div>
              ${t.steps && t.steps.length ? `<div class="ex-block"><div class="label">Step by step</div>${t.steps.map((x) => `<div class="step"><div class="serif">${esc(x[0])}</div><div>→ ${esc(x[1])}</div>${x[2] ? `<div class="muted small">${esc(x[2])}</div>` : ''}</div>`).join('')}</div>` : ''}
              ${t.alt && t.alt.length ? `<div class="ex-block"><div class="label">Other ways</div>${t.alt.map((x) => `<p>${esc(x)}</p>`).join('')}</div>` : ''}
              ${t.pit && t.pit.length ? `<div class="ex-block"><div class="label">Watch out</div>${t.pit.map((x) => `<p>${esc(x)}</p>`).join('')}</div>` : ''}
              ${t.vocab && t.vocab.length ? `<div class="ex-block"><div class="label">Words</div>${t.vocab.map(vocabLine).join('')}</div>` : ''}` : ''}
          </div>`;
        }).join('')}
        ${Object.keys(shown).length ? rubricHTML(s.tasks.flatMap((t) => t.short ? [[`(${t.n}) 正しく書けた`, t.pts]] : t.words ? [[`(${t.n}) 指定語を3つ以上、正しい意味・用法で使った`, Math.round(t.pts * 0.375)], [`(${t.n}) 内容がテーマに合い、筋が通っている`, Math.round(t.pts * 0.25)], [`(${t.n}) 文法・語彙の誤りがない`, Math.round(t.pts * 0.25)], [`(${t.n}) 字数が範囲内、字体の混用がない`, t.pts - Math.round(t.pts * 0.375) - 2 * Math.round(t.pts * 0.25)]] : [[`(${t.n}) 意味が原文どおり正確（訳し落とし・誤訳がない）`, Math.round(t.pts * 0.6)], [`(${t.n}) 自然な${s.type === 'zhja' ? '日本語' : '中国語'}になっている`, Math.round(t.pts * 0.3)], [`(${t.n}) 誤字・脱字・字体の混用がない`, t.pts - Math.round(t.pts * 0.6) - Math.round(t.pts * 0.3)]]), s.pts) : ''}`;
      app.querySelectorAll('textarea[data-key]').forEach((ta) => ta.addEventListener('input', () => {
        texts[ta.dataset.key] = ta.value;
        save();
        const c = app.querySelector(`[data-cnt="${ta.dataset.key}"]`);
        if (c) c.textContent = c.textContent.replace(/^\d+/, count(ta.value));
      }));
      app.querySelectorAll('[data-show]').forEach((b) => b.addEventListener('click', () => { const n = b.dataset.show; shown[n] = !shown[n]; shown.any = true; draw(); }));
      bindRubric(pid, s.id, s.pts);
    };
    draw();
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
          ${v.note ? `<div class="note">${esc(v.note)}</div>` : ''}</div>` : '<div class="tap">TAP</div>'}
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
  const AREA = { grammar: 'Grammar', pinyin: 'Pinyin', idioms: 'Idioms', listening: 'Listening', vocab: 'Exam Vocab' };
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
        startMC(list, (r) => finishCheck(n, r), { noCause: true });
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
      else if (a === 'listening') items.push({ kind: 'listening', head: 'Shadowing', meta: `${pct(w.acc)} · +15 min with Journal script`, notes: ['1文ずつ聞く → 書き取る → 原稿で確認 → 声に出して重ねる'], link: '', min: 15 });
      else if (a === 'vocab') items.push({ kind: 'vocab', head: 'Exam Vocab', meta: `${pct(w.acc)} · +10 new cards / day`, notes: [], link: '#/idioms/vocab', min: 15 });
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
    if (n === 2 && A.total < 0.7) out.push('インプット期の終わりの時点で7割に届いていません。翻訳（アウトプット）の開始を2週間遅らせ、その分をインプットに回すことを勧めます。');
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
  function taskMeta(t) {
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
    viewPapers, viewPaper, viewSection, viewReview, viewVocab, viewGroups, viewCheck, viewCheckResult, viewDrill,
    viewMethod, viewGuide, progressHTML, focusTasks, taskMeta, taskLink, importFiles,
    stop: () => { tts.stop(); },
    resetSession: () => { st = null; vq = null; vshow = false; gq = null; },
    exportData: () => ({ qa, scores, texts, vsrs, cpq, cpr, focus }),
    importData: (d) => { qa = d.qa || {}; scores = d.scores || {}; texts = d.texts || {}; vsrs = d.vsrs || {}; cpq = d.cpq || {}; cpr = d.cpr || {}; focus = d.focus || null; save(); },
  };
};
