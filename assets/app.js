// 画面。スケジュールは assets/plan.js、教材データは data/*.js
(function () {
  'use strict';

  const { build, toT, toS, dow, DAY, idiomList, translationList } = window.Plan;
  const app = document.getElementById('app');

  // ---------- 保存（localStorage が使えない環境でも動くように） ----------
  const store = {
    get(k, def) {
      try {
        const v = localStorage.getItem(`level1.${k}`);
        return v ? JSON.parse(v) : def;
      } catch (e) {
        return def;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(`level1.${k}`, JSON.stringify(v));
      } catch (e) { /* 保存できなくても画面は動かす */ }
    },
  };

  let S = { ...window.Plan.DEFAULTS, ...store.get('settings', {}) };
  let done = store.get('done', {});
  let fixed = store.get('fixed', {});
  let srs = store.get('srs', {});
  let drafts = store.get('drafts', {});
  let R = build(S, done);
  const IDIOMS = idiomList();
  const TRANS = translationList();

  const saveSettings = () => { store.set('settings', S); R = build(S, done); };

  // 過去問・チェックポイント・語彙カードは study.js
  const ST = window.Study({
    app, store, toast: (m) => toast(m), esc: (x) => esc(x), todayS: () => todayS(), addDays: (k, n) => addDays(k, n),
    LEFT: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    RIGHT: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    IDIOMS, toS, toT, S: () => S, checkpointDays: () => window.Plan.checkpointDays({ ...window.Plan.DEFAULTS, ...S, rest: (S.rest || []).map(Number) }, R.P),
    setShift: (d) => { S.inputShift = d; saveSettings(); },
  });

  // 本物の声で聞く（ポッドキャスト）は listen.js
  const LS = window.Listen({
    app, store, toast: (m) => toast(m), esc: (x) => esc(x), todayS: () => todayS(), ST,
    LEFT: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  });

  // ---------- 小物 ----------
  const pad = (n) => String(n).padStart(2, '0');
  const todayS = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const addDays = (k, n) => toS(toT(k) + n * DAY);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmt = (k) => { const d = new Date(toT(k)); return `${WD[d.getUTCDay()]}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };
  const hm = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${pad(m % 60)}m` : `${m}m`);
  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const LEFT = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  const RIGHT = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';

  function toast(msg) {
    document.querySelectorAll('.toast:not(.stay)').forEach((x) => x.remove());
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2300);
  }

  // ---------- オフライン（Service Worker） ----------
  // 一度開けば、アプリのファイルと字体が端末に保存され、電波がなくても開ける
  const offline = { ready: false, persisted: null };
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then(() => { offline.ready = true; })
      .catch(() => { /* 登録できなくてもアプリは動かす */ });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || document.querySelector('.toast.stay')) return; // 初回のインストールでは知らせない
      const el = document.createElement('button');
      el.className = 'toast stay';
      el.textContent = 'Updated · tap to reload';
      el.addEventListener('click', () => location.reload());
      document.body.appendChild(el);
    });
  }
  // 過去問データと手書きの線（IndexedDB）を、ブラウザが勝手に消さないように頼む
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted().then((p) => p || navigator.storage.persist()).then((p) => { offline.persisted = p; }).catch(() => {});
  }
  async function offlineInfo() {
    const el = app.querySelector('#offline');
    if (!el) return;
    const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate().catch(() => null) : null;
    const zh = 'speechSynthesis' in window ? speechSynthesis.getVoices().filter((v) => /^zh[-_](CN|Hans)/i.test(v.lang)) : [];
    const home = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
    const row = (ok, t, sub) => `<div class="rrow"><span class="${ok ? 'ok' : 'ng'}">${ok ? '✓' : '–'}</span><span>${t}${sub ? `<div class="muted small">${sub}</div>` : ''}</span></div>`;
    el.innerHTML = [
      row(offline.ready, offline.ready ? 'App saved for offline use' : 'Not saved yet', offline.ready ? '' : 'ネットにつないだ状態で一度開くと保存されます。'),
      row(home, home ? 'Home Screen app' : 'Opened in Safari', home ? '' : 'Safari の共有ボタン › 「ホーム画面に追加」で、全画面のアプリとして使えます。'),
      row(offline.persisted === true, `Storage ${est ? `${(est.usage / 1048576).toFixed(1)} MB` : ''}${offline.persisted ? ' · kept' : ''}`, offline.persisted ? '' : '過去問データと手書きは端末に保存されます。ホーム画面に追加すると消されにくくなります。'),
      `<div class="rrow"><span>✎</span><span>Scribble<div class="muted small">文字を書く所はすべて、Apple Pencil で入力欄に書くと文字になります。設定 › Apple Pencil › スクリブル をオン、設定 › 一般 › キーボード › キーボード に「中国語（簡体字）」を追加してください。</div></span></div>`,
      `<div class="rrow"><span>♪</span><span>Real voices<div class="muted small">聞き取りの練習は Listen（ポッドキャスト）と中国語ジャーナルの本物の声で行います。取り込んだ音声は端末に保存され、電波がなくても聞けます。</div></span></div>`,
      row(zh.length > 0, zh.length ? `Chinese voice · ${esc(zh.map((v) => v.name).slice(0, 3).join(', '))}` : 'No Chinese voice', '過去問の聞き取りだけは公式の音声がないので、原稿を iPad の読み上げで鳴らします。'),
    ].join('');
  }
  if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', () => offlineInfo());

  // ---------- 進捗の計算 ----------
  const taskDone = (t) => (t.fixed ? !!fixed[t.fixed] : t.ids.every((id) => done[id]));
  const tasksOf = (k) => R.days.get(k) || [];
  function dayRatio(k) {
    const ts = tasksOf(k);
    return ts.length ? ts.filter(taskDone).length / ts.length : null;
  }
  function toggle(t) {
    if (t.fixed) {
      if (fixed[t.fixed]) delete fixed[t.fixed];
      else fixed[t.fixed] = 1;
      store.set('fixed', fixed);
      return;
    }
    const all = taskDone(t);
    const now = todayS();
    t.ids.forEach((id) => {
      if (all) delete done[id];
      else if (!done[id]) done[id] = now;
    });
    store.set('done', done);
  }
  function streak() {
    let n = 0;
    let k = todayS();
    if (dayRatio(k) !== 1) k = addDays(k, -1);
    for (let i = 0; i < 800; i++, k = addDays(k, -1)) {
      const r = dayRatio(k);
      if (r === null) { if (k < S.start) break; continue; }
      if (r < 1) break;
      n++;
    }
    return n;
  }
  function allIds() {
    const ids = [];
    R.tracks.forEach((tr) => tr.units.forEach((u) => (tr.pair ? ids.push(`${u.id}-w`, `${u.id}-l`) : ids.push(u.id))));
    return ids;
  }
  function overall() {
    const ids = allIds();
    return ids.length ? ids.filter((id) => done[id]).length / ids.length : 0;
  }
  function overdue() {
    const today = todayS();
    let n = 0;
    R.days.forEach((ts, k) => {
      if (k < today) ts.forEach((t) => { if (!t.fixed && !taskDone(t)) n++; });
    });
    return n;
  }
  function rebalance() {
    const k = todayS();
    S.anchors = [...new Set([...(S.anchors || []), k])].sort();
    saveSettings();
    toast('Rebalanced');
  }

  // ---------- Today ----------
  function viewToday(k) {
    const today = todayS();
    k = k || today;
    const tasks = [...tasksOf(k), ...ST.focusTasks(k), ...ST.extraTasks(k)];
    const left = Math.max(0, Math.round((toT(S.exam) - toT(today)) / DAY));
    const pct = Math.round(overall() * 100);
    const C = 2 * Math.PI * 42;
    const ph = R.P.find((p) => toT(k) >= p.a && toT(k) < p.b);
    const total = tasks.reduce((s, t) => s + t.min, 0);
    const od = k === today ? overdue() : 0;
    const allDone = tasks.length && tasks.every(taskDone);
    const cpDays = window.Plan.checkpointDays({ ...window.Plan.DEFAULTS, ...S, rest: (S.rest || []).map(Number) }, R.P);
    const nextCp = cpDays.findIndex((t) => toS(t) >= today);

    app.innerHTML = `
      <div class="today-view">
      <aside class="t-side">
      <div class="daynav">
        <button data-go="${addDays(k, -1)}" aria-label="Previous day">${LEFT}</button>
        <div class="date">${fmt(k)}${k === today ? '<small>Today</small>' : `<small><a href="#/today">Back to today</a></small>`}</div>
        <button data-go="${addDays(k, 1)}" aria-label="Next day">${RIGHT}</button>
      </div>
      <div class="hero">
        <div>
          <div class="count">${left}</div>
          <div class="label count-unit">days to exam</div>
        </div>
        <div class="ring" role="img" aria-label="${pct}% complete">
          <svg viewBox="0 0 96 96"><circle class="track" cx="48" cy="48" r="42"/><circle class="bar" cx="48" cy="48" r="42" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}"/></svg>
          <div class="val"><b>${pct}%</b><span>TOTAL</span></div>
        </div>
      </div>
      <div class="stats">
        ${ph ? `<span class="chip">${ph.id} · ${ph.name}</span>` : ''}
        ${total ? `<span class="chip">${hm(total)}</span>` : ''}
        <span class="chip">Streak ${streak()}</span>
        ${nextCp >= 0 ? `<a class="chip" href="#/check/${nextCp}">CP${nextCp} · ${fmt(toS(cpDays[nextCp]))}</a>` : ''}
        ${od ? `<button class="chip accent" id="rebalance">${od} overdue · Rebalance</button>` : ''}
      </div>
      </aside>
      <section class="t-main">
      ${tasks.length ? `<div class="tasks">${tasks.map(taskHTML).join('')}</div>` : `<div class="empty">${k >= S.exam ? 'Exam day.' : 'Rest.'}</div>`}
      ${allDone ? `<div class="complete"><span class="seal">完</span><div class="word">Done.</div></div>` : ''}
      </section>
      </div>
    `;

    app.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/today/${b.dataset.go}`; }));
    const rb = app.querySelector('#rebalance');
    if (rb) rb.addEventListener('click', () => { rebalance(); viewToday(k); });
    app.querySelectorAll('.task').forEach((el) => {
      el.querySelector('.stamp').addEventListener('click', () => {
        const t = tasks[+el.dataset.i];
        const was = taskDone(t);
        toggle(t);
        viewToday(k);
        if (!was) app.querySelector(`.task[data-i="${el.dataset.i}"]`).classList.add('just');
      });
    });
  }

  function taskHTML(t, i) {
    const link = ST.taskLink(t) || (t.track === 'idioms' || t.track === 'idrev' ? '#/idioms'
      : /^tr/.test(t.track) ? `#/translate/${t.units[0]}` : '');
    const dyn = ST.taskMeta(t);
    return `
      <div class="task ${taskDone(t) ? 'done' : ''}" data-i="${i}">
        <button class="stamp" aria-label="Mark done">${CHECK}</button>
        <div class="body">
          <div class="name"><b>${esc(t.name)}</b><span class="min">${t.min} min</span></div>
          ${t.lines.map((l) => `
            <div class="line"><span class="head">${esc(l.head)}</span><span class="meta">${esc(dyn || l.meta)}</span></div>
            ${l.notes.length ? `<ul class="notes">${l.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}`).join('')}
          ${link ? `<a class="go" href="${link}">Open →</a>` : ''}
        </div>
      </div>`;
  }

  // ---------- Plan ----------
  function viewPlan(k) {
    const today = todayS();
    k = k || today;
    const mon = addDays(k, -((dow(toT(k)) + 6) % 7));
    const week = Array.from({ length: 7 }, (_, i) => addDays(mon, i));

    const start = new Date(toT(S.start));
    const end = new Date(toT(S.exam));
    const months = [];
    for (let y = start.getUTCFullYear(), m = start.getUTCMonth(); y < end.getUTCFullYear() || (y === end.getUTCFullYear() && m <= end.getUTCMonth()); m === 11 ? (y++, m = 0) : m++) months.push([y, m]);

    app.innerHTML = `
      <div class="daynav">
        <button data-go="${addDays(mon, -7)}" aria-label="Previous week">${LEFT}</button>
        <div class="date">${MON[new Date(toT(mon)).getUTCMonth()]} ${new Date(toT(mon)).getUTCDate()} – ${MON[new Date(toT(week[6])).getUTCMonth()]} ${new Date(toT(week[6])).getUTCDate()}<small>Week</small></div>
        <button data-go="${addDays(mon, 7)}" aria-label="Next week">${RIGHT}</button>
      </div>
      <div class="week">${week.map((d) => {
        const ts = tasksOf(d);
        const r = dayRatio(d);
        const dt = new Date(toT(d));
        return `<a class="wday ${d === today ? 'today' : ''}" href="#/today/${d}">
          <div class="d"><b>${dt.getUTCDate()}</b><span>${WD[dt.getUTCDay()]}</span></div>
          <div class="ts">${ts.length ? ts.filter((t) => !t.fixed).map((t) => `<b>${esc(t.name)}</b> ${esc(t.lines[0] ? t.lines[0].head : '')}`).join(' · ') || 'Journal' : (d === S.exam ? '<b>Exam</b>' : d < S.start || d > S.exam ? '—' : 'Rest')}</div>
          <div class="pct">${r === null ? '' : `${Math.round(r * 100)}%`}</div>
        </a>`;
      }).join('')}</div>

      <h2 class="section label">Year</h2>
      <div class="months">${months.map(([y, m]) => monthHTML(y, m, today)).join('')}</div>
      <div class="legend">Less <span class="cell"></span><span class="cell l1"></span><span class="cell l2"></span><span class="cell l3"></span><span class="cell l4"></span> More</div>
    `;
    app.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/plan/${b.dataset.go}`; }));
  }

  function monthHTML(y, m, today) {
    const first = Date.UTC(y, m, 1);
    const n = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const off = (new Date(first).getUTCDay() + 6) % 7;
    let cells = '<span class="cell blank"></span>'.repeat(off);
    for (let d = 1; d <= n; d++) {
      const k = toS(Date.UTC(y, m, d));
      let cls = 'cell';
      if (k === S.exam) cls += ' exam';
      else if (k < S.start || k > S.exam) cls += ' blank';
      else if (!tasksOf(k).length) cls += ' rest';
      else if (k > today) cls += ' future';
      else {
        const r = dayRatio(k);
        cls += r === 0 ? '' : r < 0.34 ? ' l1' : r < 0.67 ? ' l2' : r < 1 ? ' l3' : ' l4';
      }
      if (k === today) cls += ' today';
      cells += cls.includes('blank') ? `<span class="${cls}"></span>` : `<a class="${cls}" href="#/today/${k}" title="${k}"></a>`;
    }
    return `<div class="month"><h4>${MON[m]} ${y}</h4><div class="grid7">${cells}</div></div>`;
  }

  // ---------- Progress ----------
  const CATS = [
    ['Errors I', (id) => /^e1-/.test(id)],
    ['Errors II', (id) => /^e2-/.test(id)],
    ['Errors III', (id) => /^e3-/.test(id)],
    ['Training Book', (id) => /^tb-/.test(id)],
    ['Kikutan', (id) => /^kk-/.test(id)],
    ['HSK 7–9', (id) => /^hsk-/.test(id)],
    ['Idioms', (id) => /^id-/.test(id)],
    ['Translate', (id) => /^tr-/.test(id)],
    ['Errors · Review', (id) => /^re\d/.test(id)],
    ['Kikutan · Review', (id) => /^kk2-/.test(id)],
    ['Past Papers', (id) => /^pp/.test(id)],
    ['Translate · Redo', (id) => /^trr-/.test(id)],
  ];

  function viewProgress() {
    const today = todayS();
    const ids = allIds();
    const due = new Set();
    R.days.forEach((ts, k) => { if (k <= today) ts.forEach((t) => (t.ids || []).forEach((id) => due.add(id))); });
    const a = toT(S.start);
    const span = toT(S.exam) - a;
    const past = Math.min(1, Math.max(0, (toT(today) - a) / span));
    let studied = 0;
    let minutes = 0;
    R.days.forEach((ts, k) => {
      if (k > today) return;
      const d = ts.filter(taskDone);
      if (d.length) studied++;
      d.forEach((t) => { minutes += t.min; });
    });

    app.innerHTML = `
      <div class="hero p-hero">
        <div><div class="count">${Math.round(overall() * 100)}<span style="font-size:.4em">%</span></div><div class="label count-unit">complete</div></div>
        <div style="text-align:right">
          <div class="serif" style="font-size:28px;font-weight:700">${studied}</div><div class="label">days</div>
          <div class="serif" style="font-size:28px;font-weight:700;margin-top:8px">${Math.round(minutes / 60)}</div><div class="label">hours</div>
        </div>
      </div>
      <div class="timeline">${R.P.map((p) => `<div style="width:${((p.b - p.a) / span) * 100}%"></div>`).join('')}<span class="past" style="width:${past * 100}%"></span></div>
      <div class="phases">${R.P.map((p) => `<div style="width:${((p.b - p.a) / span) * 100}%"><b>${p.id}</b>${p.name}</div>`).join('')}</div>

      <div class="dash"><div class="dcard">
      <h2 class="section label">Books</h2>
      <div class="bars">${CATS.map(([name, test]) => {
        const mine = ids.filter(test);
        if (!mine.length) return '';
        const d = mine.filter((id) => done[id]).length;
        const exp = mine.filter((id) => due.has(id)).length;
        return `<div class="bar-row">
          <div class="row"><span>${name}</span><span>${d} / ${mine.length}</span></div>
          <div class="meter"><i style="width:${(d / mine.length) * 100}%"></i>${exp ? `<s style="left:calc(${(exp / mine.length) * 100}% - 1px)" title="Plan"></s>` : ''}</div>
        </div>`;
      }).join('')}</div>
      <div class="legend" style="margin-top:18px"><span style="display:inline-block;width:2px;height:10px;background:var(--ink);opacity:.5"></span>&nbsp;plan</div>
      </div><div class="dcard">${ST.progressHTML()}${LS.progressHTML()}</div></div>
    `;
  }

  // ---------- Idioms ----------
  const INT = [1, 2, 4, 8, 16, 32, 64, 120];
  let idMode = 'study';
  let queue = null;
  let reveal = false;
  let query = '';

  function buildQueue() {
    const today = todayS();
    const fresh = [];
    R.days.forEach((ts, k) => {
      if (k > today) return;
      ts.forEach((t) => { if (t.track === 'idioms') t.units.forEach((n) => { if (!srs[n]) fresh.push(n); }); });
    });
    const dueList = Object.keys(srs).filter((n) => srs[n].due <= today).map(Number).sort((x, y) => srs[x].due.localeCompare(srs[y].due));
    queue = [...dueList, ...fresh.slice(0, 20)];
  }

  function grade(n, ok) {
    const today = todayS();
    const cur = srs[n] || { b: -1 };
    const b = ok ? Math.min(INT.length - 1, cur.b + 1) : 0;
    srs[n] = { b, due: ok ? addDays(today, INT[b]) : today };
    store.set('srs', srs);
    if (!done[`id-${n}`]) { done[`id-${n}`] = today; store.set('done', done); }
    queue.shift();
    if (!ok) queue.push(n);
    reveal = false;
    viewIdioms();
  }

  function viewIdioms() {
    if (!queue) buildQueue();
    const today = todayS();
    const dueN = Object.keys(srs).filter((n) => srs[n].due <= today).length;
    const newN = queue.filter((n) => !srs[n]).length;
    const head = `
      <div class="row" style="margin:6px 0 4px;flex-wrap:wrap">
        <div class="seg">${[['study', 'Idioms'], ['vocab', 'Vocab'], ['hanzi', 'Hanzi'], ['groups', 'Groups'], ['all', 'All']].map(([m, l]) => `<button data-mode="${m}" class="${idMode === m ? 'on' : ''}">${l}</button>`).join('')}</div>
        <span class="spacer"></span>
        ${idMode === 'study' ? `<span class="chip">New ${newN}</span><span class="chip">Due ${dueN}</span>` : idMode === 'all' ? `<span class="chip">${IDIOMS.length}</span>` : idMode === 'hanzi' ? `<span class="chip">Due ${ST.hzCount()[0]}</span><span class="chip">${ST.hzCount()[1]}</span>` : ''}
      </div>`;

    if (idMode === 'vocab' || idMode === 'groups' || idMode === 'hanzi') {
      ({ vocab: ST.viewVocab, groups: ST.viewGroups, hanzi: ST.viewHanzi })[idMode](app, head);
      app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { idMode = b.dataset.mode; location.hash = `#/idioms/${idMode}`; }));
      return;
    } else if (idMode === 'all') {
      const q = query.trim().toLowerCase();
      const list = IDIOMS.filter((x) => !q || [x.zh, x.py, x.ja].some((s) => s.toLowerCase().includes(q)));
      app.innerHTML = `${head}
        <input class="search" type="search" placeholder="Search" value="${esc(query)}" aria-label="Search">
        <ul class="list">${list.map((x) => `<li><details>
          <summary><span class="n">${x.n}</span><span class="zh">${esc(x.zh)}</span></summary>
          <div class="detail"><p class="muted">${esc(x.py)} · ${esc(x.cat)}</p><p>${esc(x.ja)}</p><p class="serif">${esc(x.ex)}</p><p class="muted">${esc(x.exJa)}</p>${x.note ? `<div class="note">${esc(x.note)}</div>` : ''}</div>
        </details></li>`).join('')}</ul>`;
      const input = app.querySelector('.search');
      input.addEventListener('input', () => {
        query = input.value;
        viewIdioms();
        const again = app.querySelector('.search');
        again.focus();
        again.setSelectionRange(again.value.length, again.value.length);
      });
    } else if (!queue.length) {
      app.innerHTML = `${head}<div class="complete"><span class="seal">完</span><div class="word">Done.</div></div>`;
    } else {
      const x = IDIOMS[queue[0] - 1];
      app.innerHTML = `${head}
        <div class="card" id="card" role="button" tabindex="0" aria-label="Reveal">
          <span class="chip cat">#${x.n} · ${esc(x.cat)}</span>
          <div class="zh">${esc(x.zh)}</div>
          ${reveal ? `
            <div class="py">${esc(x.py)}</div>
            <div class="back">
              <div class="ja">${esc(x.ja)}</div>
              <div class="ex">${esc(x.ex)}</div>
              <div class="exja">${esc(x.exJa)}</div>
              ${x.note ? `<div class="note">${esc(x.note)}</div>` : ''}
            </div>` : '<div class="tap">TAP</div>'}
        </div>
        ${reveal ? '<div class="grade"><button class="btn" data-g="0">Again</button><button class="btn primary" data-g="1">Good</button></div>' : ''}`;
      const card = app.querySelector('#card');
      const show = () => { if (!reveal) { reveal = true; viewIdioms(); } };
      card.addEventListener('click', show);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); } });
      app.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => grade(x.n, b.dataset.g === '1')));
    }
    app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { idMode = b.dataset.mode; location.hash = `#/idioms/${idMode}`; }));
  }

  // ---------- Translate ----------
  function viewTranslate(n) {
    if (!n) {
      app.innerHTML = `
        <div class="row" style="margin:6px 0 10px"><span class="label">Translate</span><span class="spacer"></span><span class="chip">${TRANS.filter((x) => done[`tr-${x.n}`]).length} / ${TRANS.length}</span></div>
        <div class="tlist">${TRANS.map((x) => `<a href="#/translate/${x.n}">
          <span class="n">T${x.n}</span><span>${esc(x.dir)}</span><span class="muted">${esc(x.t)}</span>
          <span class="dot ${done[`tr-${x.n}`] ? 'done' : drafts[x.n] ? 'draft' : ''}"></span>
        </a>`).join('')}</div>`;
      return;
    }
    const x = TRANS[n - 1];
    if (!x) { location.hash = '#/translate'; return; }
    const id = done[`tr-${n}`] ? `trr-${n}` : `tr-${n}`;
    // 答えは Apple Pencil で書き、スクリブルで文字にする。Show の後に Claude アプリで添削できる
    const zhOut = x.dir === 'JA → ZH';
    let shown = false;
    app.innerHTML = `
      <div class="daynav">
        <button data-go="${Math.max(1, n - 1)}" aria-label="Previous">${LEFT}</button>
        <div class="date">T${n}<small>${esc(x.dir)} · ${esc(x.t)}</small></div>
        <button data-go="${Math.min(TRANS.length, n + 1)}" aria-label="Next">${RIGHT}</button>
      </div>
      <div class="split write">
        <div class="pane-l"><div class="src">${esc(x.src)}</div><div id="tmodel"></div></div>
        <div class="pane-r">
          <div id="tin"></div>
          <div class="actions">
            <button class="btn" id="show">Show</button>
            <span class="spacer"></span>
            <button class="btn ${done[id] ? '' : 'accent'}" id="mark">${done[id] ? 'Undo' : 'Done'}</button>
          </div>
        </div>
      </div>`;
    ST.scribbleInput(app.querySelector('#tin'), {
      lang: zhOut ? 'zh-CN' : 'ja', text: () => drafts[n] || '', setText: (v) => { drafts[n] = v; store.set('drafts', drafts); },
      placeholder: zhOut ? '中国語訳を Apple Pencil で書く' : '日本語訳を Apple Pencil で書く',
    });
    const prompt = () => ST.gradePrompt({
      title: `Translate T${n}（${x.t}）`, kind: zhOut ? '日文中訳' : '中文日訳', pts: 10, lang: zhOut ? 'zh' : 'ja',
      instr: '中検1級レベルの翻訳演習。', src: x.src, model: x.model, points: x.pts, answer: drafts[n],
      rubric: [['意味が原文どおり正確（訳し落とし・誤訳がない）', 6], [`自然な${zhOut ? '中国語' : '日本語'}になっている`, 3], ['誤字・脱字・字体の混用がない', 1]],
    });
    app.querySelector('#show').addEventListener('click', (e) => {
      shown = !shown;
      e.target.textContent = shown ? 'Hide' : 'Show';
      app.querySelector('#tmodel').innerHTML = shown ? `
        ${ST.claudeHTML(prompt)}
        ${ST.resultHTML({ key: `tr|${n}`, kind: 'translate', max: 10, title: `Translate T${n}` })}
        <div class="label" style="margin-top:20px">Model</div>
        ${zhOut ? ST.tapHTML(x.model, `T${n}`) : `<div class="src">${esc(x.model)}</div>`}
        <div class="label">Points</div>
        <ul class="pts">${x.pts.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : '';
    });
    app.querySelector('#mark').addEventListener('click', (e) => {
      if (done[id]) delete done[id];
      else done[id] = todayS();
      store.set('done', done);
      e.target.textContent = done[id] ? 'Undo' : 'Done';
      e.target.classList.toggle('accent', !done[id]);
    });
    app.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/translate/${b.dataset.go}`; }));
  }

  // ---------- Settings ----------
  function viewSettings() {
    const theme = store.get('theme', 'system');
    const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    app.innerHTML = `
      <div class="label" style="margin:6px 0 16px">Settings</div>
      <div class="form">
        <label class="field"><span class="label">Start</span><input type="date" id="start" value="${S.start}"></label>
        <label class="field"><span class="label">Exam</span><input type="date" id="exam" value="${S.exam}"></label>
        <div class="field"><span class="label">Rest days</span>
          <div class="dow">${DOW.map((d, i) => `<button type="button" data-d="${i}" class="${S.rest.includes(i) ? 'on' : ''}" aria-pressed="${S.rest.includes(i)}">${d}</button>`).join('')}</div></div>
        <label class="field"><span class="label">Journal · min / day</span><input type="number" id="journal" min="10" max="180" step="5" value="${S.journal}"></label>
        <label class="field"><span class="label">Input phase · extra days</span><input type="number" id="shift" min="0" max="42" step="7" value="${S.inputShift || 0}"></label>
        <label class="field"><span class="label">Errors I · start page × 100</span><textarea id="e1" placeholder="1, 5, 9, …">${esc(S.e1Pages)}</textarea></label>
        <div class="field"><span class="label">Theme</span>
          <div class="seg">${['system', 'light', 'dark'].map((t) => `<button type="button" data-theme="${t}" class="${theme === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></div>
        <div class="field"><span class="label">Plan</span>
          <div class="actions" style="margin:0"><button class="btn" id="rb">Rebalance from today</button>${(S.anchors || []).length ? '<button class="btn" id="unrb">Reset plan</button>' : ''}</div></div>
        <div class="field"><span class="label">Offline</span><div class="note-box rubric" id="offline"></div></div>
        <div class="field"><span class="label">Data</span>
          <div class="actions" style="margin:0"><button class="btn" id="export">Export</button><label class="btn">Import<input type="file" id="import" accept="application/json" hidden></label><button class="btn" id="wipe">Erase</button></div></div>
      </div>`;

    offlineInfo();
    const bind = (sel, key, f = (v) => v) => app.querySelector(sel).addEventListener('change', (e) => {
      S[key] = f(e.target.value);
      saveSettings();
      toast('Saved');
    });
    bind('#start', 'start');
    bind('#exam', 'exam');
    bind('#journal', 'journal', Number);
    bind('#shift', 'inputShift', Number);
    bind('#e1', 'e1Pages');
    app.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => {
      const d = +b.dataset.d;
      S.rest = S.rest.includes(d) ? S.rest.filter((x) => x !== d) : [...S.rest, d];
      saveSettings();
      viewSettings();
    }));
    app.querySelectorAll('[data-theme]').forEach((b) => b.addEventListener('click', () => {
      store.set('theme', b.dataset.theme);
      applyTheme();
      viewSettings();
    }));
    app.querySelector('#rb').addEventListener('click', () => { rebalance(); viewSettings(); });
    const un = app.querySelector('#unrb');
    if (un) un.addEventListener('click', () => { S.anchors = []; saveSettings(); toast('Reset'); viewSettings(); });
    app.querySelector('#export').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({ settings: S, done, fixed, srs, drafts, study: ST.exportData(), pod: LS.exportData() }, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `level1-${todayS()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    app.querySelector('#import').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const d = JSON.parse(await f.text());
        S = { ...window.Plan.DEFAULTS, ...(d.settings || {}) };
        done = d.done || {}; fixed = d.fixed || {}; srs = d.srs || {}; drafts = d.drafts || {};
        store.set('done', done); store.set('fixed', fixed); store.set('srs', srs); store.set('drafts', drafts);
        if (d.study) ST.importData(d.study);
        if (d.pod) LS.importData(d.pod);
        saveSettings();
        queue = null;
        toast('Imported');
        viewSettings();
      } catch (err) {
        toast('Invalid file');
      }
    });
    app.querySelector('#wipe').addEventListener('click', () => {
      if (!confirm('Erase all progress?')) return;
      S = { ...window.Plan.DEFAULTS };
      done = {}; fixed = {}; srs = {}; drafts = {};
      ['done', 'fixed', 'srs', 'drafts'].forEach((k) => store.set(k, {}));
      ST.importData({});
      LS.importData({});
      saveSettings();
      queue = null;
      toast('Erased');
      viewSettings();
    });
  }

  // ---------- ルーティング ----------
  function applyTheme() {
    const t = store.get('theme', 'system');
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  }

  function route() {
    const [, view = 'today', arg, arg2] = location.hash.split('/');
    const tab = { check: 'today', drill: 'today', method: 'papers', guide: 'papers' }[view] || view;
    document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
    app.dataset.view = view;
    const sc = document.getElementById('sidecount');
    if (sc) sc.textContent = Math.max(0, Math.round((toT(S.exam) - toT(todayS())) / DAY));
    if (view !== 'idioms') { queue = null; reveal = false; }
    if (route.last !== location.hash) { ST.stop(); LS.stop(); if (!(view === 'check' && arg2 === 'result')) ST.resetSession(); }
    route.last = location.hash;
    if (view === 'plan') viewPlan(arg);
    else if (view === 'idioms') { idMode = ['vocab', 'hanzi', 'groups', 'all'].includes(arg) ? arg : 'study'; viewIdioms(); }
    else if (view === 'papers') {
      if (!arg) ST.viewPapers();
      else if (arg === 'review') ST.viewReview();
      else if (arg2) ST.viewSection(arg, arg2);
      else ST.viewPaper(arg);
    } else if (view === 'check') { if (arg2 === 'result') ST.viewCheckResult(arg); else ST.viewCheck(arg); }
    else if (view === 'drill') ST.viewDrill(arg);
    else if (view === 'method') ST.viewMethod();
    else if (view === 'guide') ST.viewGuide();
    else if (view === 'listen') LS.view(arg, arg2);
    else if (view === 'translate') viewTranslate(arg ? +arg : 0);
    else if (view === 'progress') viewProgress();
    else if (view === 'settings') viewSettings();
    else viewToday(arg);
    window.scrollTo(0, 0);
  }

  applyTheme();
  window.addEventListener('hashchange', route);
  route();
})();
