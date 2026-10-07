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

  const saved = store.get('settings', {});
  // 以前の既定（聞き取り45分・1日の時間なし）からの移行：1日3時間の計画に合わせて聞き取りは40分に
  if (!('daily' in saved) && saved.journal === 45) saved.journal = 40;
  delete saved.e1Pages;
  let S = { ...window.Plan.DEFAULTS, ...saved };
  let done = store.get('done', {});
  let fixed = store.get('fixed', {});
  let srs = store.get('srs', {});
  let drafts = store.get('drafts', {});
  let R = build(S, done);
  const IDIOMS = idiomList();
  const TRANS = translationList();

  const saveSettings = () => { store.set('settings', S); R = build(S, done); };

  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const LEFT = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  const RIGHT = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';

  // 過去問・チェックポイント・語彙カードは study.js
  const ST = window.Study({
    app, store, toast: (m) => toast(m), esc: (x) => esc(x), todayS: () => todayS(), addDays: (k, n) => addDays(k, n),
    LEFT, IDIOMS, toS, toT, S: () => S, checkpointDays: () => window.Plan.checkpointDays({ ...window.Plan.DEFAULTS, ...S, rest: (S.rest || []).map(Number) }, R.P),
    setShift: (d) => { S.inputShift = d; saveSettings(); },
  });

  // 本物の声で聞く（ポッドキャスト）は listen.js
  const LS = window.Listen({
    app, store, toast: (m) => toast(m), esc: (x) => esc(x), todayS: () => todayS(), ST, LEFT,
  });

  // 日文中訳ドリル（原文 → 日本語の問題 → 中国語訳 → Claude の添削）は drill.js
  const DR = window.Drill({
    app, store, toast: (m) => toast(m), esc: (x) => esc(x), todayS: () => todayS(), ST, LEFT,
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
  function toast(msg) {
    document.querySelectorAll('.toast:not(.stay)').forEach((x) => x.remove());
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2300);
  }

  window.Ink.onToast((m) => toast(m));

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
      row(zh.length > 0, zh.length ? `Chinese voice · ${esc(zh.map((v) => v.name).slice(0, 3).join(', '))}` : 'No Chinese voice', '過去問とチェックポイントの聞き取りだけは公式の音声がないので、原稿を iPad の読み上げで鳴らします。'),
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
  // 弱点から足すタスク（Focus・Writing focus・Hanzi）は、1日の時間を超えないように縮める。
  // 余りの枠（Catch-up / Weak sections）があれば、そこから時間をもらう
  function withExtras(k) {
    const base = tasksOf(k).map((t) => ({ ...t }));
    const extra = [...ST.focusTasks(k), ...ST.extraTasks(k)];
    // 書き取りの正答率（直近2週）が8割未満なら、平日に Podcast dictation を足す
    const dr = k === todayS() ? LS.dictRate(14) : null;
    const wd = dow(toT(k));
    if (dr != null && dr < 0.8 && wd >= 1 && wd <= 5 && !S.rest.includes(wd)) extra.push({ key: 'dfocus', track: 'dfocus', name: 'Focus', min: 15, fixed: `${k}|dfocus`, link: '#/listen/today/dictation', lines: [{ head: 'Podcast dictation', meta: `${Math.round(dr * 100)}% in 14 days · +10 sentences`, notes: ['聞き取れなかった字を Hanzi で書き、同じ文を Shadow で重ねる'] }] });
    const sum = (l) => l.reduce((s, t) => s + t.min, 0);
    // 弱点の課題は、余りの枠（Catch-up / Weak sections）と1日の時間の余裕の中に入る分だけ。入らないものは見送る
    const flex = base.find((t) => t.track === 'flex' || t.track === 'ppfix');
    let room = Math.max(0, (+S.daily || 180) + 15 - sum(base) + (flex ? flex.min : 0));
    const kept = [];
    extra.forEach((t) => { if (t.min <= room) { kept.push(t); room -= t.min; } });
    if (flex) {
      flex.min = Math.max(0, flex.min - sum(kept));
      if (flex.min < 10) base.splice(base.indexOf(flex), 1);
    }
    withExtras.skipped = extra.length - kept.length;
    return [...base, ...kept];
  }


  function viewToday(k) {
    const today = todayS();
    k = k || today;
    const tasks = withExtras(k);
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
        ${total > (+S.daily || 180) + 30 ? `<span class="chip accent" title="過去問など時間の決まった課題で、1日の時間を超えています">${hm(total - (+S.daily || 180))} over</span>` : ''}
        ${withExtras.skipped ? `<span class="chip" title="時間に入らなかった弱点の課題。明日以降に入ります">${withExtras.skipped} extra skipped</span>` : ''}
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
    const book = { errors: `#/books/errors${{ e1: 1, e2: 2, e3: 3 }[((t.ids || [])[0] || '').slice(0, 2)] || 1}`, er: `#/books/errors${{ e1: 1, e2: 2, e3: 3 }[((t.ids || [])[0] || '').slice(1, 3)] || 1}`, tb1: '#/books/training', tb2: '#/books/training', kk1: '#/books/kikutan', kk2: '#/books/kikutan' }[t.track];
    const link = ST.taskLink(t) || book || (t.track === 'idioms' || t.track === 'idrev' ? '#/idioms'
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
          <div class="ts">${ts.length ? ts.filter((t) => !t.fixed && t.lines[0]).map((t) => `<span class="wt"><b>${esc(t.name)}</b> ${esc(t.lines[0].head)}${t.lines[0].notes[0] ? `<small>${esc(t.lines[0].notes[0])}</small>` : ''}</span>`).join('') || 'Listening · Reading' : (d === S.exam ? '<b>Exam</b>' : d < S.start || d > S.exam ? '—' : 'Rest')}</div>
          <div class="pct">${r === null ? '' : `${Math.round(r * 100)}%`}</div>
        </a>`;
      }).join('')}</div>

      <a class="jz-cta" href="#/books"><b>Books · 目次</b><span>本ごとの目次と、どの項目を何日にやるかの一覧。目次の直しもここで</span></a>
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

  // ---------- Books：本ごとの目次と、どの項目を何日にやるか ----------
  const BOOK_TABS = [['errors1', 'Errors I'], ['errors2', 'Errors II'], ['errors3', 'Errors III'], ['training', 'Training Book'], ['kikutan', 'Kikutan']];
  const md = (k) => { const d = new Date(toT(k)); return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };
  // 目次の貼り付けを読む。「ページ 題」「12. 題 …… 44」「題 44」のどれでもよい
  function parseToc(text) {
    return String(text || '').split(/\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      // 「ページ 題」（ページの後が空白）
      let m = /^(\d+)[\t ]+(.+)$/.exec(l);
      if (m) return [+m[1], m[2].trim()];
      // 「12. 題 …… 44」「題 44」（最後の数字がページ）
      m = /^(.*?)[\s.…・。．]*(\d+)$/.exec(l);
      return m && m[1] ? [+m[2], m[1].replace(/^\d+\s*[.．、:：]\s*/, '').trim()] : null;
    }).filter((x) => x && x[1]);
  }
  function viewBooks(key) {
    if (!BOOK_TABS.some((b) => b[0] === key)) key = 'errors1';
    const B = window.BOOKS;
    const when = new Map();
    [...R.days.keys()].sort().forEach((d) => R.days.get(d).forEach((t) => (t.ids || []).forEach((id) => { if (!when.has(id)) when.set(id, d); })));
    const dateCell = (id) => { const d = when.get(id); return d ? `<a class="d" href="#/today/${d}">${md(d)}</a>` : '<span class="d">–</span>'; };
    const units = (tk) => (R.tracks.find((t) => t.key === tk) || { units: [] }).units;
    let body = '';
    let editor = '';
    if (key.startsWith('errors')) {
      const label = { errors1: 'I', errors2: 'II', errors3: 'III' }[key];
      const us = units('errors').filter((u) => u.book === label);
      let ch = null;
      body = us.map((u) => {
        const head = u.ch !== ch ? `<div class="toc-ch">${esc((ch = u.ch))}</div>` : '';
        return `${head}<div class="toc-row ${done[u.id] ? 'done' : ''}"><span class="n">${u.n}</span><span class="t">${esc(u.title)}</span><span class="p">p.${u.p0}–${u.p1}</span>${dateCell(u.id)}<span class="d2">${when.get(`r${u.id}`) ? `review ${md(when.get(`r${u.id}`))}` : ''}</span></div>`;
      }).join('');
      editor = { hint: '1行に1項目。「開始ページ 題」か、目次のまま「12. 題 …… 44」の形で貼り付ける', text: us.map((u) => `${u.p0}\t${u.title}`).join('\n') };
    } else if (key === 'training') {
      const all = [...units('tb1'), ...units('tb2'), ...units('tbm1'), ...units('tbm2')];
      const groups = [];
      all.forEach((u) => {
        const g = groups[groups.length - 1];
        const k = `${u.step.id}|${u.sec ? u.sec.title : ''}`;
        if (g && g.k === k) g.us.push(u); else groups.push({ k, step: u.step, sec: u.sec, us: [u] });
      });
      let st = null;
      body = groups.map((g) => {
        const head = g.step.id !== st ? `<div class="toc-ch">${esc(`${g.step.level} STEP ${g.step.step} · ${g.step.label}`)}</div>` : '';
        st = g.step.id;
        const a = g.us[0];
        const b = g.us[g.us.length - 1];
        const ok = g.us.filter((u) => done[u.id]).length;
        const d0 = when.get(a.id);
        const d1 = when.get(b.id);
        return `${head}<div class="toc-row ${ok === g.us.length ? 'done' : ''}"><span class="n">Q${a.n}${b.n !== a.n ? `–${b.n}` : ''}</span><span class="t">${esc(g.sec ? g.sec.title : g.step.mock ? '模擬試験' : g.step.label)}</span><span class="p">${g.sec && g.sec.page ? `p.${g.sec.page}` : `${ok}/${g.us.length}`}</span>${d0 ? `<a class="d" href="#/today/${d0}">${md(d0)}</a>` : '<span class="d">–</span>'}<span class="d2">${d1 && d1 !== d0 ? `→ ${md(d1)}` : ''}</span></div>`;
      }).join('');
      editor = { hint: '1行に1つ：「STEP の記号 最初の問題番号 見出し ページ」（例：p1 1 政治・経済 12）。記号は p1–p5（準1級）、g1–g5（1級）', text: B.training.steps.flatMap((s) => ((S.toc[`training.${s.id}`] || s.sections || []).map((x) => `${s.id} ${x[0]} ${x[1]}${x[2] ? ` ${x[2]}` : ''}`))).join('\n') };
    } else {
      const us = units('kk1');
      const r = units('kk2');
      const weeks = [];
      us.forEach((u, i) => { if (i % 7 === 0) weeks.push([]); weeks[weeks.length - 1].push(u); });
      body = weeks.map((w, i) => {
        const a = w[0];
        const b = w[w.length - 1];
        const titles = [...new Set(w.map((u) => u.title).filter(Boolean))].join(' / ');
        const ok = w.filter((u) => done[u.id]).length;
        const rv = r.find((x) => x.n === a.n);
        return `<div class="toc-row ${ok === w.length ? 'done' : ''}"><span class="n">W${i + 1}</span><span class="t">Day ${a.n}–${b.n}${titles ? ` · ${esc(titles)}` : ''}</span><span class="p">${ok}/${w.length}</span>${dateCell(a.id)}<span class="d2">${rv && when.get(rv.id) ? `review ${md(when.get(rv.id))}` : ''}</span></div>`;
      }).join('');
      editor = { hint: '1行に1つ：「最初の Day 見出し」（例：1 名詞①）', text: (S.toc.kikutan || B.kikutan.weeks || []).map((x) => `${x[0]} ${x[1]}`).join('\n') };
    }
    app.innerHTML = `<div class="daynav"><a class="icon-btn" href="#/plan" aria-label="Back">${LEFT}</a><div class="date">Books<small>目次と予定</small></div><span style="width:36px"></span></div>
      <div class="row" style="margin:0 0 14px;flex-wrap:wrap"><div class="seg">${BOOK_TABS.map(([k, l]) => `<a class="${k === key ? 'on' : ''}" href="#/books/${k}">${l}</a>`).join('')}</div></div>
      <div class="toc">${body || '<p class="muted">まだ予定がありません。</p>'}</div>
      <details class="toc-edit"><summary>目次を貼り付けて直す</summary>
        <p class="muted small">${esc(editor.hint)}。保存すると予定と Today の表示に使われます。</p>
        <textarea class="answer" id="tocText" spellcheck="false">${esc(editor.text)}</textarea>
        <div class="actions"><button class="btn primary" id="tocSave">Save</button>${S.toc[key] || Object.keys(S.toc).some((x) => x.startsWith('training.')) && key === 'training' ? '<button class="btn" id="tocReset">Reset to built-in</button>' : ''}</div>
      </details>`;
    app.querySelector('#tocSave').addEventListener('click', () => {
      const text = app.querySelector('#tocText').value;
      if (key === 'training') {
        const by = {};
        text.split(/\n/).map((l) => l.trim()).filter(Boolean).forEach((l) => {
          const m = /^([pg][1-5])\s+(\d+)\s+(.+?)(?:\s+(\d+))?$/i.exec(l);
          if (m) (by[`training.${m[1].toLowerCase()}`] = by[`training.${m[1].toLowerCase()}`] || []).push([+m[2], m[3], m[4] ? +m[4] : null]);
        });
        Object.keys(S.toc).filter((x) => x.startsWith('training.')).forEach((x) => delete S.toc[x]);
        Object.assign(S.toc, by);
      } else if (key === 'kikutan') {
        S.toc.kikutan = text.split(/\n/).map((l) => /^(\d+)\s+(.+)$/.exec(l.trim())).filter(Boolean).map((m) => [+m[1], m[2]]);
      } else {
        const items = parseToc(text);
        const n = (B[key].items || []).length;
        if (!items.length) { toast('読み取れる行がありません'); return; }
        if (n && items.length !== n && !confirm(`${items.length} 項目です（今は ${n} 項目）。項目の数が変わると、済みの印がずれることがあります。保存しますか？`)) return;
        S.toc[key] = items;
      }
      S.toc = { ...S.toc };
      saveSettings();
      toast('Saved');
      viewBooks(key);
    });
    const rs = app.querySelector('#tocReset');
    if (rs) rs.addEventListener('click', () => {
      if (key === 'training') Object.keys(S.toc).filter((x) => x.startsWith('training.')).forEach((x) => delete S.toc[x]);
      else delete S.toc[key];
      saveSettings();
      viewBooks(key);
    });
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

  // 弱点のまとめ：チェックポイントの分野・過去問の大問・問題の種類・Claude の添削の分類・書き取りの正答率
  function weakPoints() {
    const list = ST.weakPoints();
    const dr = LS.dictRate(14);
    if (dr != null && dr < 0.85) list.push({ label: 'Listening · Podcast dictation', rate: dr, link: '#/listen/today/dictation' });
    const rated = list.filter((x) => x.rate != null).sort((a, b) => a.rate - b.rate);
    return [...rated, ...list.filter((x) => x.rate == null)].slice(0, 6);
  }
  function weakHTML() {
    const W = weakPoints();
    return `<div class="weak"><h2 class="section label">Weak points</h2>${W.length ? `<div class="wlist">${W.map((x) => `<a class="wrow" href="${x.link}"><span class="t">${esc(x.label)}${x.note ? `<small>${esc(x.note)}</small>` : ''}</span><span class="v ${x.rate != null && x.rate < 0.7 ? 'ng' : ''}">${x.rate != null ? `${Math.round(x.rate * 100)}%` : `${x.count}×`}</span></a>`).join('')}</div>
      <p class="muted small">日曜の Review で、この上から順に来週の Catch-up と Focus の時間を回してください。</p>` : '<p class="muted small">まだ十分な記録がありません。チェックポイント・過去問・添削を重ねると、ここに弱い順に出ます。</p>'}</div>`;
  }

  function viewProgress() {
    // Listen とドリルの記録は IndexedDB から読むので、読み終わったら描き直す
    if (!LS.isReady() || !DR.isReady()) LS.whenReady(() => DR.whenReady(() => { if (app.dataset.view === 'progress') viewProgress(); }));
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
      ${weakHTML()}

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
      </div><div class="dcard">${ST.progressHTML()}${DR.summaryHTML()}${LS.progressHTML()}</div></div>
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
        <a class="jz-cta" href="#/zhdrill"><b>日文中訳ドリル</b><span>本物の中国語記事 → 日本語の問題 → スクリブルで訳す → Claude が朱筆で添削。弱点と覚える表現が貯まる</span></a>
        <div class="row" style="margin:6px 0 10px"><span class="label">Translate · 50</span><span class="spacer"></span><span class="chip">${TRANS.filter((x) => done[`tr-${x.n}`]).length} / ${TRANS.length}</span></div>
        <div class="tlist">${TRANS.map((x) => `<a href="#/translate/${x.n}">
          <span class="n">T${x.n}</span><span>${esc(x.dir)}</span><span class="muted">${esc(x.t)}</span>
          <span class="dot ${done[`tr-${x.n}`] ? 'done' : drafts[x.n] ? 'draft' : ''}"></span>
        </a>`).join('')}</div>`;
      return;
    }
    const x = TRANS[n - 1];
    if (!x) { location.hash = '#/translate'; return; }
    // 初回（tr-n）と、P4 のやり直し（trr-n）。やり直しは初回が済んでいて、P4 に入ってから
    const inP4 = toT(todayS()) >= R.P[3].a;
    const id = done[`tr-${n}`] && inP4 ? `trr-${n}` : `tr-${n}`;
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
            <button class="btn ${done[id] ? '' : 'accent'}" id="mark">${id.startsWith('trr') ? (done[id] ? 'Undo redo' : 'Redo done') : done[id] ? 'Undo' : 'Done'}</button>
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
      e.target.textContent = id.startsWith('trr') ? (done[id] ? 'Undo redo' : 'Redo done') : done[id] ? 'Undo' : 'Done';
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
        <label class="field"><span class="label">Study · min / day</span><input type="number" id="daily" min="60" max="480" step="15" value="${S.daily}"><span class="muted small">教材の分量は、毎日この時間に収まるように割り振ります</span></label>
        <label class="field"><span class="label">Listening · min / day</span><input type="number" id="journal" min="20" max="120" step="5" value="${S.journal}"><span class="muted small">中国語ジャーナル＋ポッドキャスト</span></label>
        <label class="field"><span class="label">Input phase · extra days</span><input type="number" id="shift" min="0" max="42" step="7" value="${S.inputShift || 0}"></label>
        <div class="field"><span class="label">Books</span><a class="btn" href="#/books">目次と予定</a></div>
        <div class="field"><span class="label">Theme</span>
          <div class="seg">${['system', 'light', 'dark'].map((t) => `<button type="button" data-theme="${t}" class="${theme === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></div>
        <div class="field"><span class="label">Plan</span>
          <div class="actions" style="margin:0"><button class="btn" id="rb">Rebalance from today</button>${(S.anchors || []).length ? '<button class="btn" id="unrb">Reset plan</button>' : ''}</div></div>
        <div class="field"><span class="label">Offline</span><div class="note-box rubric" id="offline"></div></div>
        <div class="field"><span class="label">Data</span>
          <div class="actions" style="margin:0"><button class="btn" id="export">Export</button><label class="muted small"><input type="checkbox" id="exInk" checked> 手書きメモも含める</label><label class="btn">Import<input type="file" id="import" accept="application/json" hidden></label><button class="btn" id="wipe">Erase</button></div></div>
      </div>`;

    offlineInfo();
    const bind = (sel, key, f = (v) => v) => app.querySelector(sel).addEventListener('change', (e) => {
      S[key] = f(e.target.value);
      saveSettings();
      toast('Saved');
    });
    bind('#start', 'start');
    bind('#exam', 'exam');
    bind('#daily', 'daily', Number);
    bind('#journal', 'journal', Number);
    bind('#shift', 'inputShift', Number);
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
    app.querySelector('#export').addEventListener('click', async () => {
      // 手書きメモ（聞き取り・要約のメモ帳）は IndexedDB にあるので、選んだときだけ一緒に書き出す
      const ink = app.querySelector('#exInk').checked ? await window.Ink.exportAll() : undefined;
      const blob = new Blob([JSON.stringify({ settings: S, done, fixed, srs, drafts, study: ST.exportData(), pod: LS.exportData(), jz: DR.exportData(), ink }, null, 1)], { type: 'application/json' });
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
        if (d.jz) DR.importData(d.jz);
        const nInk = d.ink ? await window.Ink.importAll(d.ink) : 0;
        saveSettings();
        queue = null;
        toast(nInk ? `Imported · 手書きメモ ${nInk}` : 'Imported');
        viewSettings();
      } catch (err) {
        toast('Invalid file');
      }
    });
    app.querySelector('#wipe').addEventListener('click', () => {
      if (!confirm('学習の記録をすべて消しますか？（過去問データ・ポッドキャストの音声・メモの手書き・設定した日程と目次は残ります）')) return;
      S = { ...window.Plan.DEFAULTS, start: S.start, exam: S.exam, rest: S.rest, daily: S.daily, journal: S.journal, toc: S.toc };
      done = {}; fixed = {}; srs = {}; drafts = {};
      ['done', 'fixed', 'srs', 'drafts'].forEach((k) => store.set(k, {}));
      ST.importData({});
      LS.importData({});
      DR.importData({});
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
    const tab = { check: 'today', drill: 'today', method: 'papers', guide: 'papers', zhdrill: 'translate', books: 'plan' }[view] || view;
    document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
    app.dataset.view = view;
    const sc = document.getElementById('sidecount');
    if (sc) sc.textContent = Math.max(0, Math.round((toT(S.exam) - toT(todayS())) / DAY));
    if (view !== 'idioms') { queue = null; reveal = false; }
    if (route.last !== location.hash) { ST.stop(); LS.stop(); if (!(view === 'check' && arg2 === 'result')) ST.resetSession(); }
    route.last = location.hash;
    if (view === 'plan') viewPlan(arg);
    else if (view === 'books') viewBooks(arg);
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
    else if (view === 'zhdrill') DR.view(arg, arg2);
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
