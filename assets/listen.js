// 本物の声で聞く：ポッドキャスト（PodcastPlayer 用の JSON と音声）を取り込み、通し聞き・書き取り・シャドーイング・要約を練習する
// app.js から Listen(ctx) で初期化する。原稿と音声は IndexedDB（level1 / pods）、進み具合は localStorage（pod）
window.Listen = function Listen(ctx) {
  'use strict';

  const { app, store, esc, toast, todayS, LEFT, ST } = ctx;
  const Ink = window.Ink;
  const SUM_LIMIT = [180, 200]; // 1級のリスニング2（聞いて要約）
  const SUM_PTS = 40;
  const MODES = [['listen', 'Listen'], ['dictation', 'Dictation'], ['shadow', 'Shadow'], ['summary', 'Summary']];

  // ---------- 進み具合 ----------
  // pod[id] = { dict: {i, ok, n}, shadow, sumI, plays: {chunk: n}, sum: {chunk: text} }、pod._days[d] = {sec, chars, ok, sents}、pod._cur = 最後に開いた話
  let pod = store.get('pod', {});
  const save = () => store.set('pod', pod);
  const P = (id) => (pod[id] = pod[id] || { dict: { i: 0, ok: 0, n: 0 }, shadow: 0, sumI: 0, plays: {}, sum: {} });
  const day = () => { pod._days = pod._days || {}; return (pod._days[todayS()] = pod._days[todayS()] || { sec: 0, chars: 0, ok: 0, sents: 0 }); };

  // ---------- 原稿と音声（IndexedDB） ----------
  const PODS = {};
  let ready = false;
  const onReady = [];
  async function loadAll() {
    try {
      const d = await Ink.db();
      await new Promise((res) => {
        const q = d.transaction('pods').objectStore('pods').getAll();
        q.onsuccess = () => { q.result.forEach((p) => { PODS[p.id] = p; }); res(); };
        q.onerror = () => res();
      });
    } catch (e) { /* IndexedDB が使えない環境では取り込みなしで動かす */ }
    ready = true;
    onReady.splice(0).forEach((f) => f());
  }
  async function putPod(p) {
    PODS[p.id] = p;
    try {
      const d = await Ink.db();
      await new Promise((res, rej) => { const tx = d.transaction('pods', 'readwrite'); tx.objectStore('pods').put(p); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    } catch (e) { toast('Saved for this session only'); }
  }
  async function delPod(id) {
    delete PODS[id];
    delete pod[id];
    if (pod._cur === id) delete pod._cur;
    save();
    try { const d = await Ink.db(); d.transaction('pods', 'readwrite').objectStore('pods').delete(id); } catch (e) { /* なし */ }
  }

  // "HH:MM:SS.mmm" → 秒
  const sec = (t) => {
    if (typeof t === 'number') return t;
    const m = /^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/.exec(String(t || '').trim());
    return m ? (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3] : NaN;
  };
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const han = (t) => Ink.chars(t || '').filter(Ink.isHan);
  const hash = (s) => { let h = 5381; for (const c of s) h = ((h * 33) ^ c.codePointAt(0)) >>> 0; return h.toString(36); };
  const base = (name) => name.replace(/\.[^.]+$/, '');
  const isAudio = (f) => /^audio\//.test(f.type) || /\.(mp3|m4a|aac|wav|ogg)$/i.test(f.name);

  // PodcastPlayer の JSON（ttml-to-json の形式）を読む
  function fromJSON(j, name) {
    const segs = (j.segments || []).map((s) => ({ b: sec(s.begin), e: sec(s.end), o: String(s.original || '').trim(), py: s.pinyin || '', ja: s.translation || '', w: (s.words || []).map((w) => ({ w: w.word, py: w.reading || '', ja: w.meaning || '' })).filter((w) => w.w) }))
      .filter((s) => s.o && s.e > s.b);
    if (!segs.length) return null;
    const m = j.metadata || {};
    const title = m.episode || m.title || base(name);
    const id = `p${hash(`${m.channel || ''}|${title}|${m.publishDate || ''}`)}`;
    const all = segs.flatMap((s) => han(s.o));
    const trad = all.length ? all.filter((c) => ST.isTrad(c)).length / all.length > 0.02 : false;
    return { id, file: base(name), title, channel: m.channel || '', date: m.publishDate || '', lang: m.sourceLanguage || '', segs, trad, audio: null, at: todayS() };
  }
  async function importFiles(files) {
    files = [...files];
    const audios = files.filter(isAudio);
    let n = 0;
    let bad = 0;
    for (const f of files.filter((x) => /\.json$/i.test(x.name))) {
      let p = null;
      try { p = fromJSON(JSON.parse(await f.text()), f.name); } catch (e) { p = null; }
      if (!p) { bad++; continue; }
      const old = PODS[p.id];
      const a = audios.find((x) => base(x.name) === p.file);
      p.audio = a || (old && old.audio) || null;
      await putPod(p);
      n++;
    }
    // 音声だけを後から足す
    for (const a of audios) {
      const p = Object.values(PODS).find((x) => x.file === base(a.name));
      if (p && p.audio !== a && !files.some((f) => /\.json$/i.test(f.name) && base(f.name) === p.file)) { p.audio = a; await putPod(p); n++; }
    }
    toast(n ? `${n} imported${bad ? ` · ${bad} skipped` : ''}` : 'PodcastPlayer の JSON が見つかりません');
    viewLibrary();
  }

  // ---------- 再生 ----------
  // 1つの <audio> を使い回し、区間（b〜e）だけ鳴らす。聞いた時間は日ごとに記録する
  const pl = { a: null, id: null, url: null, end: null, onEnd: null, t0: 0, rate: store.get('podRate', 1), raf: 0 };
  function audioFor(p) {
    if (!p.audio) return null;
    if (pl.id !== p.id) {
      stop();
      if (pl.url) URL.revokeObjectURL(pl.url);
      pl.url = URL.createObjectURL(p.audio);
      pl.a = new Audio(pl.url);
      pl.a.preload = 'auto';
      pl.id = p.id;
      pl.a.addEventListener('pause', logTime);
      pl.a.addEventListener('ended', () => finish());
    }
    pl.a.playbackRate = pl.rate;
    return pl.a;
  }
  function logTime() {
    if (pl.t0) { day().sec += Math.max(0, (performance.now() - pl.t0) / 1000); pl.t0 = 0; save(); }
  }
  function tick() {
    if (!pl.a || pl.a.paused) return;
    if (pl.end != null && pl.a.currentTime >= pl.end) { finish(); return; }
    if (pl.onTime) pl.onTime(pl.a.currentTime);
    pl.raf = requestAnimationFrame(tick);
  }
  function finish() {
    if (pl.a && !pl.a.paused) pl.a.pause();
    cancelAnimationFrame(pl.raf);
    const f = pl.onEnd;
    pl.end = null; pl.onEnd = null;
    if (f) f();
  }
  async function play(p, b, e, o = {}) {
    const a = audioFor(p);
    if (!a) { toast('音声がありません（mp3 を Import で足してください）'); return false; }
    stop();
    pl.end = e; pl.onEnd = o.onEnd || null; pl.onTime = o.onTime || null;
    try {
      a.currentTime = b;
      await a.play();
    } catch (err) { toast('再生できませんでした'); return false; }
    pl.t0 = performance.now();
    pl.raf = requestAnimationFrame(tick);
    return true;
  }
  function stop() {
    cancelAnimationFrame(pl.raf);
    pl.onEnd = null; pl.end = null;
    if (pl.a && !pl.a.paused) pl.a.pause();
  }
  const rateHTML = () => `<select class="rate" id="prate" aria-label="Speed">${[0.75, 0.9, 1, 1.25].map((r) => `<option value="${r}" ${r === pl.rate ? 'selected' : ''}>${r}×</option>`).join('')}</select>`;
  function bindRate() {
    const s = app.querySelector('#prate');
    if (s) s.addEventListener('change', () => { pl.rate = +s.value; store.set('podRate', pl.rate); if (pl.a) pl.a.playbackRate = pl.rate; });
  }

  // ---------- 区切り ----------
  // 通し聞き：約90秒ごと。要約：簡体字・繁体字の漢字で450〜700字ほど（1級の要約の原稿の長さ）
  function chunks(p, kind) {
    const out = [];
    let cur = [];
    let n = 0;
    p.segs.forEach((s, i) => {
      cur.push(i);
      n += kind === 'sum' ? han(s.o).length : 0;
      const dur = p.segs[i].e - p.segs[cur[0]].b;
      if (kind === 'sum' ? n >= 450 : dur >= 90) { out.push(cur); cur = []; n = 0; }
    });
    if (cur.length && (kind !== 'sum' || n >= 250)) out.push(cur);
    return out;
  }
  const dictList = (p) => p.segs.map((s, i) => [i, han(s.o).length]).filter(([, n]) => n >= 8 && n <= 40).map(([i]) => i);
  const shadowList = (p) => p.segs.map((s, i) => [i, han(s.o).length]).filter(([, n]) => n >= 4).map(([i]) => i);

  // ---------- ライブラリ ----------
  function viewLibrary(hint) {
    if (!ready) { onReady.push(() => viewLibrary(hint)); return; }
    const list = Object.values(PODS).sort((a, b) => (b.date || b.at).localeCompare(a.date || a.at));
    app.innerHTML = `<div class="daynav"><span style="width:36px"></span><div class="date">Listen<small>real voices · podcasts</small></div><span style="width:36px"></span></div>
      ${hint ? `<p class="muted">${esc(hint)}</p>` : ''}
      <div class="row wbar"><label class="btn primary" for="pimp">Import</label><input type="file" id="pimp" multiple accept=".json,application/json,audio/*,.mp3,.m4a" hidden>
        <span class="muted small">PodcastPlayer の JSON と音声（mp3 / m4a）をまとめて選ぶ</span></div>
      ${list.length ? `<div class="plist">${list.map((p) => {
        const d = P(p.id).dict;
        const dl = dictList(p).length;
        const dur = p.segs[p.segs.length - 1].e;
        return `<div class="card pod">
          <a class="pod-main" href="#/listen/${p.id}/listen"><div class="label">${esc(p.channel || 'Podcast')}${p.date ? ` · ${esc(p.date)}` : ''}</div>
            <div class="pod-title">${esc(p.title)}</div>
            <div class="chips"><span class="chip">${mmss(dur)}</span><span class="chip">${p.segs.length} sentences</span><span class="chip ${d.i ? 'accent' : ''}">Dictation ${Math.min(d.i, dl)} / ${dl}</span>${d.n ? `<span class="chip">${Math.round((d.ok / d.n) * 100)}%</span>` : ''}${p.trad ? '<span class="chip warn">繁体字</span>' : ''}${p.audio ? '' : '<span class="chip warn">no audio</span>'}</div></a>
          <button class="btn sm" data-del="${p.id}">Delete</button></div>`;
      }).join('')}</div>` : `<div class="card empty"><p>まだ番組がありません。</p>
        <ol class="plain small"><li>Cowork の podcast-json で、Apple Podcasts の中国語の番組から JSON（原文・ピンイン・和訳・語彙）を作る</li><li>iPad の「ファイル」で Google Drive › Podcasts › 中国語 を開けるようにしておく（Google Drive アプリ）</li><li>Import で、同じ名前の .json と .mp3 をまとめて選ぶ</li></ol>
        <p class="muted small">中検は簡体字・普通話です。大陸の番組（ニュース・解説・対談）を選んでください。自動の文字起こしには誤りもあるので、変だと思ったら原稿より耳を信じてください。</p></div>`}
      <p class="muted small">音声は iPad の中（IndexedDB）に保存され、電波がなくても聞けます。1時間の番組でおよそ 50〜60 MB です。</p>`;
    app.querySelector('#pimp').addEventListener('change', (e) => importFiles(e.target.files));
    app.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const p = PODS[b.dataset.del];
      if (!confirm(`「${p.title}」を削除しますか？`)) return;
      await delPod(p.id);
      viewLibrary();
    }));
  }

  // ---------- 1話の画面 ----------
  function view(id, mode) {
    if (!ready) { onReady.push(() => view(id, mode)); return; }
    if (!id) { viewLibrary(); return; }
    if (id === 'today') id = PODS[pod._cur] ? pod._cur : Object.values(PODS).sort((a, b) => (b.date || b.at).localeCompare(a.date || a.at)).map((p) => p.id)[0];
    const p = PODS[id];
    if (!p) { viewLibrary(id === undefined ? 'Import で番組を取り込むと、Today の Podcast から続きが開きます。' : ''); return; }
    if (!MODES.some(([m]) => m === mode)) mode = 'listen';
    if (pod._cur !== id) { pod._cur = id; save(); }
    app.innerHTML = `<div class="daynav"><a class="icon-btn" href="#/listen" aria-label="Back">${LEFT}</a><div class="date">${esc(p.title)}<small>${esc(p.channel)}${p.date ? ` · ${esc(p.date)}` : ''}</small></div><span style="width:36px"></span></div>
      <div class="row" style="margin:0 0 14px;flex-wrap:wrap"><div class="seg">${MODES.map(([m, l]) => `<a class="${m === mode ? 'on' : ''}" href="#/listen/${p.id}/${m}">${l}</a>`).join('')}</div><span class="spacer"></span>${rateHTML()}</div>
      ${p.trad ? '<p class="muted small"><span class="chip warn">繁体字</span> 繁体字の番組です。中検は簡体字・普通話なので、大陸の番組がおすすめです。書き取りでは繁体字と簡体字の違いを誤りに数えません。</p>' : ''}
      ${p.audio ? '' : '<p class="muted small"><span class="chip warn">no audio</span> 音声がありません。Listen の Import で、同じ名前の mp3 を選んでください。</p>'}
      <div id="pm"></div>`;
    bindRate();
    const host = app.querySelector('#pm');
    ({ listen: mListen, dictation: mDictation, shadow: mShadow, summary: mSummary })[mode](p, host);
  }

  const wordsHTML = (s) => (s.w.length ? `<div class="chips pw">${s.w.map((w) => `<span class="chip"><span class="serif">${esc(w.w)}</span> <span class="muted">${esc(w.py)} · ${esc(w.ja)}</span> <button type="button" class="mini" data-hzw="${esc(w.w)}" data-hzp="${esc(`${w.py} · ${w.ja}`)}" aria-label="Add to Hanzi" title="Hanzi デッキに入れる">✎</button></span>`).join('')}</div>` : '');

  // 通し聞き：原稿を隠して1区切り聞く → 原稿を開いて確かめる
  function mListen(p, host) {
    const cs = chunks(p, 'listen');
    const st = P(p.id);
    let c = Math.min(st.listen || 0, cs.length - 1);
    let open = false;
    const render = () => {
      const seg = cs[c];
      const b = p.segs[seg[0]].b;
      const e = p.segs[seg[seg.length - 1]].e;
      host.innerHTML = `<div class="card">
          <div class="row"><span class="label">Part ${c + 1} / ${cs.length} · ${mmss(b)}–${mmss(e)}</span><span class="spacer"></span>
            <button class="btn sm" id="lprev" ${c ? '' : 'disabled'}>Prev</button><button class="btn sm" id="lnext" ${c < cs.length - 1 ? '' : 'disabled'}>Next</button></div>
          <div class="row" style="margin-top:12px"><button class="btn primary" id="lplay">▶ Play part</button><button class="btn" id="lstop">■</button><span class="spacer"></span><button class="btn" id="lopen">${open ? 'Hide script' : 'Show script'}</button></div>
          <p class="muted small hint">${open ? '文を押すとその文だけ鳴ります。' : 'まず原稿を見ずに聞き、何の話かを一言で言えるか確かめてから原稿を開く。'}</p>
        </div>
        ${open ? `<div class="script">${seg.map((i) => { const s = p.segs[i]; return `<div class="pseg" data-i="${i}"><div class="zh serif">${esc(s.o)}</div>${s.py ? `<div class="py muted small">${esc(s.py)}</div>` : ''}${s.ja ? `<div class="ja small">${esc(s.ja)}</div>` : ''}${wordsHTML(s)}</div>`; }).join('')}</div>` : ''}`;
      const hl = (t) => host.querySelectorAll('.pseg').forEach((el) => { const s = p.segs[+el.dataset.i]; el.classList.toggle('now', t >= s.b && t < s.e); });
      host.querySelector('#lplay').addEventListener('click', () => play(p, b, e, { onTime: hl }));
      host.querySelector('#lstop').addEventListener('click', stop);
      host.querySelector('#lopen').addEventListener('click', () => { open = !open; render(); });
      host.querySelector('#lprev').addEventListener('click', () => { c--; st.listen = c; save(); stop(); render(); });
      host.querySelector('#lnext').addEventListener('click', () => { c++; st.listen = c; save(); stop(); render(); });
      host.querySelectorAll('.pseg').forEach((el) => el.addEventListener('click', (ev) => {
        if (ev.target.closest('button')) return;
        const s = p.segs[+el.dataset.i];
        play(p, s.b, s.e, { onTime: hl });
      }));
    };
    render();
  }

  // 書き取り：1文ずつ聞いてスクリブルで書き、原稿と1字ずつ照合する
  function mDictation(p, host) {
    const list = dictList(p);
    const st = P(p.id);
    let val = '';
    let res = null;
    const render = () => {
      if (st.dict.i >= list.length) {
        host.innerHTML = `<div class="complete"><span class="seal">完</span><div class="word">Done.</div><p class="muted">${list.length} sentences · ${st.dict.n ? Math.round((st.dict.ok / st.dict.n) * 100) : 0}%</p><div class="actions center"><button class="btn" id="dre">Start over</button><a class="btn primary" href="#/listen/${p.id}/summary">Summary</a></div></div>`;
        host.querySelector('#dre').addEventListener('click', () => { st.dict = { i: 0, ok: 0, n: 0 }; save(); render(); });
        return;
      }
      const s = p.segs[list[st.dict.i]];
      host.innerHTML = `<div class="card">
          <div class="row"><span class="label">Sentence ${st.dict.i + 1} / ${list.length} · ${han(s.o).length} 字</span><span class="spacer"></span><button class="btn sm" id="dskip">Skip</button></div>
          <div class="row" style="margin-top:12px"><button class="btn primary" id="dplay">▶ Play</button><button class="btn" id="dctx">▶ with context</button><span class="spacer"></span><span class="muted small">何度聞いてもよい</span></div>
          <div id="din" style="margin-top:12px"></div>
          ${res ? `<div class="src diff serif">${res.d.html}</div>
            <p class="small"><span class="${res.miss ? 'ng' : 'ok'}">${res.miss ? '✗' : '✓'}</span> ${res.n - res.miss} / ${res.n} 字${res.extra ? ` · 余分な字 ${res.extra}` : ''}${res.miss ? ' · 聞き取れなかった字は Hanzi へ' : ''}</p>
            ${s.py ? `<p class="muted small">${esc(s.py)}</p>` : ''}${s.ja ? `<p class="small">${esc(s.ja)}</p>` : ''}${wordsHTML(s)}` : ''}
        </div>
        <div class="grade one">${res ? '<button class="btn primary" id="dnext">Next</button>' : '<button class="btn primary" id="dcheck">Check</button>'}</div>`;
      if (!res) ST.scribbleInput(host.querySelector('#din'), { short: true, noChecks: true, text: () => val, setText: (v) => { val = v; }, placeholder: '聞こえた文を漢字で書く' });
      host.querySelector('#dplay').addEventListener('click', () => play(p, s.b, s.e));
      // 前の文から続けて聞く（文の切れ目がつかみにくいとき）
      host.querySelector('#dctx').addEventListener('click', () => { const i = list[st.dict.i]; play(p, p.segs[Math.max(0, i - 1)].b, s.e); });
      host.querySelector('#dskip').addEventListener('click', () => { st.dict.i++; save(); val = ''; res = null; stop(); render(); });
      if (res) host.querySelector('#dnext').addEventListener('click', () => { st.dict.i++; save(); val = ''; res = null; stop(); render(); });
      else host.querySelector('#dcheck').addEventListener('click', () => {
        const d = ST.diffChars(val, s.o);
        const m = Ink.chars(s.o);
        // 繁体字の番組では、繁体字の位置の食い違いは誤りに数えない（簡体字で書いてよい）
        const miss = p.trad ? d.missIdx.filter((k) => !ST.isTrad(m[k])) : d.missIdx;
        const hm = miss.filter((k) => Ink.isHan(m[k])).length;
        const n = han(s.o).length;
        res = { d, miss: hm, n, extra: Math.max(0, d.extra - (d.missIdx.length - miss.length)) };
        st.dict.n += n; st.dict.ok += n - hm;
        const g = day(); g.chars += n; g.ok += n - hm; g.sents++;
        save();
        if (val.trim()) ST.hzFromDiff({ ...d, missIdx: miss }, s.o, `Podcast · ${p.title}`.slice(0, 40));
        render();
      });
    };
    render();
  }

  // シャドーイング：原稿を見て3回重ねる → 原稿を隠して2回
  function mShadow(p, host) {
    const list = shadowList(p);
    const st = P(p.id);
    let k = 0;
    const render = () => {
      if (st.shadow >= list.length) st.shadow = 0;
      const s = p.segs[list[st.shadow]];
      const hide = k >= 3;
      host.innerHTML = `<div class="card shadow-card">
          <div class="row"><span class="label">Sentence ${st.shadow + 1} / ${list.length}</span><span class="spacer"></span><span class="chips">${[0, 1, 2, 3, 4].map((x) => `<span class="dot ${x < k ? 'on' : ''}"></span>`).join('')}</span></div>
          <div class="shadow-text ${hide ? 'hidden' : ''}"><div class="zh serif">${esc(s.o)}</div>${s.py ? `<div class="py muted">${esc(s.py)}</div>` : ''}</div>
          ${hide ? '<p class="muted small">原稿を隠して、音声に重ねて言う</p>' : '<p class="muted small">原稿を見ながら、音声に少し遅れて重ねて言う</p>'}
          ${s.ja ? `<details class="ja-det"><summary>日本語訳</summary><div>${esc(s.ja)}</div></details>` : ''}
        </div>
        <div class="grade"><button class="btn" id="splay">▶ Play ${Math.min(k + 1, 5)} / 5</button><button class="btn ${k >= 5 ? 'primary' : ''}" id="snext">Next</button></div>`;
      host.querySelector('#splay').addEventListener('click', () => play(p, s.b, s.e, { onEnd: () => { k = Math.min(5, k + 1); render(); } }));
      host.querySelector('#snext').addEventListener('click', () => { st.shadow++; save(); k = 0; stop(); render(); });
    };
    render();
  }

  // 要約（1級のリスニング2）：1区切りを3回まで聞き、メモを取り、180〜200字で要約する → Claude で添削
  function mSummary(p, host) {
    const cs = chunks(p, 'sum');
    const st = P(p.id);
    if (!cs.length) { host.innerHTML = '<p class="muted">この番組は短いので、要約の練習には使えません。</p>'; return; }
    const c = Math.min(st.sumI || 0, cs.length - 1);
    const seg = cs[c];
    const b = p.segs[seg[0]].b;
    const e = p.segs[seg[seg.length - 1]].e;
    const script = seg.map((i) => p.segs[i].o).join('');
    const key = `pod|${p.id}|${c}`;
    const plays = () => st.plays[c] || 0;
    let shown = false;
    const title = `${p.title}（Part ${c + 1}）`;
    host.innerHTML = `<div class="split write">
        <div class="pane-l">
          <div class="card">
            <div class="row"><span class="label">Part ${c + 1} / ${cs.length} · ${mmss(e - b)} · ${han(script).length} 字</span><span class="spacer"></span>
              <button class="btn sm" id="sprev" ${c ? '' : 'disabled'}>Prev</button><button class="btn sm" id="snx" ${c < cs.length - 1 ? '' : 'disabled'}>Next</button></div>
            <div class="row" style="margin-top:12px"><button class="btn primary" id="sp">▶ Play</button><button class="btn" id="ss">■</button><span class="spacer"></span><span class="muted small" id="spc"></span></div>
            <p class="muted small hint">本番と同じく3回まで。1回目は全体の流れ、2回目は要点と数字、3回目は抜けの確認。</p>
          </div>
          <div class="memo"><div class="label">Memo</div><div class="memo-pad"></div></div>
          <div id="sscript"></div>
        </div>
        <div class="pane-r">
          <div class="row wbar"><span class="label">要約（${SUM_LIMIT[0]}〜${SUM_LIMIT[1]}字）</span><span class="spacer"></span><button class="btn" id="sshow">Check</button></div>
          <div id="sans"></div>
          <div id="safter"></div>
        </div>
      </div>`;
    const $ = (q) => host.querySelector(q);
    const upd = () => { $('#spc').textContent = `${plays()} / 3`; $('#sp').disabled = plays() >= 3 && !shown; };
    upd();
    Ink.pad($('.memo-pad'), { key: `${key}|memo`, ratio: 0.9 });
    ST.scribbleInput($('#sans'), { limit: SUM_LIMIT, text: () => st.sum[c] || '', setText: (v) => { st.sum[c] = v; save(); }, placeholder: `聞いた内容を${SUM_LIMIT[0]}〜${SUM_LIMIT[1]}字の中国語に要約する` });
    $('#sp').addEventListener('click', async () => {
      if (plays() >= 3 && !shown) return;
      if (await play(p, b, e) && !shown) { st.plays[c] = plays() + 1; save(); upd(); }
    });
    $('#ss').addEventListener('click', stop);
    const go = (n) => { st.sumI = n; save(); stop(); mSummary(p, host); };
    $('#sprev').addEventListener('click', () => go(c - 1));
    $('#snx').addEventListener('click', () => go(c + 1));
    $('#sshow').addEventListener('click', () => {
      shown = !shown;
      $('#sshow').textContent = shown ? 'Hide' : 'Check';
      upd();
      $('#sscript').innerHTML = shown ? `<div class="pbox"><div class="label">Script</div><div class="zh-text">${esc(script)}</div>
          ${seg.some((i) => p.segs[i].ja) ? `<details class="ja-det"><summary>日本語訳</summary><div>${esc(seg.map((i) => p.segs[i].ja).join(''))}</div></details>` : ''}</div>` : '';
      $('#safter').innerHTML = shown ? `${ST.claudeHTML(() => ST.gradePrompt({
        title, kind: '聞いて要約', pts: SUM_PTS, limit: SUM_LIMIT,
        instr: `中国語の音声（ポッドキャスト、約${Math.round((e - b) / 60)}分）を3回まで聞き、その内容を${SUM_LIMIT[0]}字以上${SUM_LIMIT[1]}字以内の中国語に要約する練習（中検1級のリスニング2の形式）。原稿は自動の文字起こしなので、誤りを含むことがある。`,
        passage: script, answer: st.sum[c] || '',
        rubric: [['要点を落とさずに押さえている', 20], ['筋道が通り、まとまった中国語になっている', 10], ['語彙・文法が正しい', 10]],
      }))}${ST.resultHTML({ key, kind: 'summary', max: SUM_PTS, title: `Podcast ${title}` })}` : '';
    });
  }

  // ---------- Progress ----------
  function progressHTML() {
    const days = pod._days || {};
    const keys = Object.keys(days).sort();
    if (!keys.length && !Object.keys(PODS).length) return '';
    const last = (n) => keys.slice(-n).map((k) => days[k]);
    const sum = (l, f) => l.reduce((a, x) => a + (x[f] || 0), 0);
    const w = last(7);
    const all = last(400);
    const rate = (l) => (sum(l, 'chars') ? Math.round((sum(l, 'ok') / sum(l, 'chars')) * 100) : null);
    const r7 = rate(w);
    const rAll = rate(all);
    const weeks = [];
    for (let i = 0; i < 6; i++) { const l = keys.filter((k) => k <= addDaysS(todayS(), -7 * i) && k > addDaysS(todayS(), -7 * (i + 1))).map((k) => days[k]); weeks.unshift(rate(l)); }
    return `<h2 class="section label">Listening · Podcast</h2>
      <div class="chips"><span class="chip">${Math.round(sum(w, 'sec') / 60)} min this week</span><span class="chip">${sum(all, 'sents')} sentences dictated</span>${r7 != null ? `<span class="chip accent">${r7}% this week</span>` : ''}${rAll != null ? `<span class="chip">${rAll}% overall</span>` : ''}</div>
      ${weeks.some((x) => x != null) ? `<div class="bars">${weeks.map((x, i) => `<div class="bar-row"><div class="row"><span>${i === 5 ? 'This week' : `${5 - i} wk ago`}</span><span>${x == null ? '–' : `${x}%`}</span></div><div class="meter"><i style="width:${x || 0}%"></i></div></div>`).join('')}</div>` : ''}`;
  }
  const addDaysS = (k, n) => { const d = new Date(`${k}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  loadAll();

  return {
    view, viewLibrary, progressHTML, stop,
    exportData: () => pod,
    importData: (d) => { pod = d || {}; save(); },
  };
};
