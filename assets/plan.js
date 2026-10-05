// スケジューラ。設定と完了状況から、日ごとのタスクを組み立てる。
// ブラウザでは window.Plan、Node のテストでは同じオブジェクトを読み込んで使う。
(function (root) {
  'use strict';

  const DAY = 864e5;
  const toT = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  const toS = (t) => new Date(t).toISOString().slice(0, 10);
  const dow = (t) => new Date(t).getUTCDay();
  const rng = (a, b) => (a === b ? `${a}` : `${a}–${b}`);
  const pad2 = (n) => String(n).padStart(2, '0');

  const DEFAULTS = {
    start: '2026-10-06',
    exam: '2027-11-28',
    rest: [],
    journal: 45,
    papers: 5,
    e1Pages: '',
    anchors: [],
  };

  const PHASES = [
    { id: 'P1', name: 'Foundation' },
    { id: 'P2', name: 'Pre-1 Format' },
    { id: 'P3', name: 'Level 1 Format' },
    { id: 'P4', name: 'Final' },
  ];

  function phases(S) {
    const a = toT(S.start);
    const e = toT(S.exam);
    const n = Math.max(28, Math.round((e - a) / DAY));
    const cut = (f) => a + Math.round(n * f) * DAY;
    const c = [a, cut(0.2823), cut(0.5694), cut(0.8612), a + n * DAY];
    return PHASES.map((p, i) => ({ ...p, a: c[i], b: c[i + 1] }));
  }

  // ---------- 教材の単位（ユニット） ----------

  function idiomList() {
    const I = root.IDIOMS || {};
    const cats = [['xiehouyu', '歇后语'], ['guanyong', '惯用语'], ['suyu', '俗语'], ['chengyu', '成语']];
    const lists = cats.map(([k, label]) => (I[k] || []).map((r) => ({ cat: label, r })));
    const out = [];
    const max = Math.max(...lists.map((l) => l.length));
    for (let i = 0; i < max; i++) lists.forEach((l) => l[i] && out.push(l[i]));
    return out.map((x, i) => ({ n: i + 1, cat: x.cat, zh: x.r[0], py: x.r[1], ja: x.r[2], ex: x.r[3], exJa: x.r[4], note: x.r[5] || '' }));
  }

  function translationList() {
    const T = root.TRANSLATION || {};
    const a = T.zhja || [];
    const b = T.jazh || [];
    const out = [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (a[i]) out.push({ ...a[i], dir: 'ZH → JA' });
      if (b[i]) out.push({ ...b[i], dir: 'JA → ZH' });
    }
    return out.map((x, i) => ({ ...x, n: i + 1 }));
  }

  function e1Starts(S) {
    const B = root.BOOKS.errors1;
    const custom = String(S.e1Pages || '').split(/[^0-9]+/).map(Number).filter((n) => n > 0);
    if (custom.length >= B.items) return { starts: custom.slice(0, B.items), estimated: false };
    const step = (B.endPage - 1) / B.items;
    return { starts: Array.from({ length: B.items }, (_, i) => 1 + Math.round(i * step)), estimated: true };
  }

  function errorsUnits(S) {
    const B = root.BOOKS;
    const out = [];
    const chapterOf = (chs, n) => chs.filter((c) => c[0] <= n).pop()[1];
    const e1 = e1Starts(S);
    for (let k = 1; k <= B.errors1.items; k++) {
      const p0 = e1.starts[k - 1];
      const p1 = k < B.errors1.items ? Math.max(p0, e1.starts[k] - 1) : B.errors1.endPage;
      out.push({ id: `e1-${k}`, book: 'I', n: k, p0, p1, est: e1.estimated, note: chapterOf(B.errors1.chapters, k), w: p1 - p0 + 1 });
    }
    [['errors2', 'II', 'e2'], ['errors3', 'III', 'e3']].forEach(([key, label, pre]) => {
      const bk = B[key];
      bk.items.forEach(([p0, title], i) => {
        const p1 = i + 1 < bk.items.length ? bk.items[i + 1][0] - 1 : bk.endPage;
        out.push({ id: `${pre}-${i + 1}`, book: label, n: i + 1, p0, p1, note: `${pad2(i + 1)} ${title}`, ch: chapterOf(bk.chapters, i + 1), w: p1 - p0 + 1 });
      });
    });
    return out;
  }

  function tbUnits(ids) {
    const out = [];
    root.BOOKS.training.steps.filter((s) => ids.includes(s.id)).forEach((s) => {
      for (let q = 1; q <= s.q; q++) out.push({ id: `tb-${s.id}-${q}`, step: s, n: q, w: s.w || 1 });
    });
    return out;
  }

  const seq = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1));

  // ---------- トラック定義 ----------

  function tracks(S, P) {
    const B = root.BOOKS;
    const [p1, p2, p3, p4] = P;
    const exam = toT(S.exam);
    const all = () => true;
    const on = (...ds) => (t) => ds.includes(dow(t));
    const weekday = (t) => dow(t) >= 1 && dow(t) <= 5;
    const nId = idiomList().length;
    const nTr = translationList().length;
    const tr1 = Math.min(17, nTr);
    const hskN = Math.ceil(B.hsk.words / B.hsk.chunk);
    const papers = Math.max(1, Math.min(20, +S.papers || 1));

    return [
      { key: 'errors', name: 'Errors', min: 60, from: p1.a, to: p1.b, days: all, units: errorsUnits(S) },
      { key: 'tb1', name: 'Training Book', min: 45, from: p1.a, to: p1.b, days: all, units: tbUnits(['p1', 'p2']) },
      { key: 'kk1', name: 'Kikutan', min: 30, from: p1.a, to: p1.b, days: all, units: seq(B.kikutan.days, (n) => ({ id: `kk-${n}`, n, w: 1 })) },
      { key: 'tr1', name: 'Translate', min: 40, from: p1.a, to: p1.b, days: on(6), units: seq(tr1, (n) => ({ id: `tr-${n}`, n, w: 1 })) },

      { key: 'tb2', name: 'Training Book', min: 60, from: p2.a, to: p2.b, days: all, units: tbUnits(['p3', 'p4', 'g1', 'g2']) },
      { key: 'tbm1', name: 'Training Book', min: 120, from: p2.b - 14 * DAY, to: p2.b, days: on(6), units: tbUnits(['p5']) },
      { key: 'hsk', name: 'HSK 7–9', min: 30, from: p2.a, to: Math.min(p4.a + 31 * DAY, exam), days: all, units: seq(hskN, (n) => ({ id: `hsk-${n}`, n, w: 1 })) },
      { key: 'idioms', name: 'Idioms', min: 15, from: p2.a, to: p3.b, days: all, units: seq(nId, (n) => ({ id: `id-${n}`, n, w: 1 })) },
      { key: 'tr2', name: 'Translate', min: 40, from: p2.a, to: p2.b, days: on(3, 6), units: seq(nTr - tr1, (n) => ({ id: `tr-${n + tr1}`, n: n + tr1, w: 1 })) },

      { key: 'tb3', name: 'Training Book', min: 40, from: p3.a, to: p3.b, days: all, units: tbUnits(['g3', 'g4']) },
      { key: 'tbm2', name: 'Training Book', min: 120, from: p3.b - 14 * DAY, to: p3.b, days: on(6), units: tbUnits(['g5']) },
      { key: 'er', name: 'Errors · Review', min: 30, from: p3.a, to: p3.b, days: all, units: errorsUnits(S).map((u) => ({ ...u, id: `r${u.id}`, w: 1 })) },
      { key: 'kk2', name: 'Kikutan · Review', min: 15, from: p3.a, to: Math.min(p3.a + 61 * DAY, p3.b), days: all, units: seq(B.kikutan.days, (n) => ({ id: `kk2-${n}`, n, w: 1 })) },
      { key: 'pp1', name: 'Past Papers', pair: true, from: p3.a, to: p3.b - 14 * DAY, days: on(6), units: seq(papers, (n) => ({ id: `pp1-${n}`, n, w: 1 })) },

      { key: 'pp2', name: 'Past Papers', pair: true, timed: true, from: p4.a, to: exam - DAY, days: on(6), units: seq(papers, (n) => ({ id: `pp2-${n}`, n, w: 1 })) },
      { key: 'tr3', name: 'Translate · Redo', min: 30, from: p4.a, to: exam - DAY, days: weekday, units: seq(nTr, (n) => ({ id: `trr-${n}`, n, w: 1 })) },
    ];
  }

  // ペア（過去問）は土曜=筆記、日曜=リスニング＋復習の2ユニットで1回分
  const unitDone = (tr, u, done, before) => {
    const ok = (id) => done[id] && (!before || done[id] < before);
    return tr.pair ? ok(`${u.id}-w`) && ok(`${u.id}-l`) : ok(u.id);
  };

  function trackDays(S, from, to, filter) {
    const out = [];
    const end = Math.min(to, toT(S.exam));
    for (let t = from; t < end; t += DAY) {
      if (!S.rest.includes(dow(t)) && filter(t)) out.push(t);
    }
    return out;
  }

  function assign(plan, units, days) {
    if (!units.length || !days.length) return;
    const W = units.reduce((s, u) => s + u.w, 0);
    let c = 0;
    units.forEach((u) => {
      const m = c + u.w / 2;
      c += u.w;
      const t = days[Math.min(days.length - 1, Math.floor((m / W) * days.length))];
      if (!plan.has(t)) plan.set(t, []);
      plan.get(t).push(u);
    });
  }

  function planTrack(S, tr, done) {
    const plan = new Map();
    assign(plan, tr.units, trackDays(S, tr.from, tr.to, tr.days));
    const exam = toT(S.exam);
    [...(S.anchors || [])].sort().forEach((aS) => {
      const a = toT(aS);
      if (a <= tr.from) return;
      const remaining = tr.units.filter((u) => !unitDone(tr, u, done, aS));
      const moving = new Set(remaining.map((u) => u.id));
      for (const [t, us] of [...plan]) {
        // 再配分の対象は、アンカー日より前に終わっていないユニット。終わったものはその日に残す
        const keep = us.filter((u) => !moving.has(u.id));
        if (keep.length) plan.set(t, keep);
        else plan.delete(t);
      }
      const to = Math.min(Math.max(tr.to, a + 14 * DAY), exam);
      assign(plan, remaining, trackDays(S, a, to, tr.days));
    });
    return plan;
  }

  // ---------- 表示用ラベル ----------

  function groupRuns(units, keyOf) {
    const out = [];
    units.forEach((u) => {
      const last = out[out.length - 1];
      if (last && last.key === keyOf(u)) last.units.push(u);
      else out.push({ key: keyOf(u), units: [u] });
    });
    return out;
  }

  function labelUnits(tr, units) {
    const first = units[0];
    const last = units[units.length - 1];
    switch (tr.key) {
      case 'errors':
      case 'er':
        return groupRuns(units, (u) => u.book).map((g) => {
          const a = g.units[0];
          const b = g.units[g.units.length - 1];
          const nums = a.book === 'I' ? rng(`#${a.n}`, `#${b.n}`).replace('–#', '–') : rng(pad2(a.n), pad2(b.n));
          const notes = a.book === 'I' ? [...new Set(g.units.map((u) => u.note))] : g.units.map((u) => u.note);
          return {
            head: `${a.book}  ${nums}`,
            meta: tr.key === 'er' ? 'exercises' : `p.${a.est ? '≈' : ''}${rng(a.p0, b.p1)}`,
            notes: tr.key === 'er' ? [] : notes,
          };
        });
      case 'tb1': case 'tb2': case 'tb3': case 'tbm1': case 'tbm2':
        return groupRuns(units, (u) => u.step.id).map((g) => {
          const s = g.units[0].step;
          if (s.mock) return { head: `${s.level}  Mock`, meta: 'timed', notes: [s.label] };
          return { head: `${s.level}  STEP ${s.step}`, meta: `Q${rng(g.units[0].n, g.units[g.units.length - 1].n)}`, notes: [s.label] };
        });
      case 'kk1': case 'kk2':
        return [{ head: `Day ${rng(first.n, last.n)}`, meta: '', notes: [] }];
      case 'hsk': {
        const c = root.BOOKS.hsk.chunk;
        const a = (first.n - 1) * c + 1;
        const b = Math.min(last.n * c, root.BOOKS.hsk.words);
        return [{ head: `#${rng(a, b)}`, meta: `${b - a + 1} words`, notes: [] }];
      }
      case 'idioms':
        return [{ head: `#${rng(first.n, last.n)}`, meta: '+ review', notes: [] }];
      case 'tr1': case 'tr2': case 'tr3': {
        const list = translationList();
        return units.map((u) => ({ head: `T${u.n}`, meta: list[u.n - 1] ? list[u.n - 1].dir : '', notes: list[u.n - 1] ? [list[u.n - 1].t] : [] }));
      }
      default:
        return [];
    }
  }

  // ---------- 全体の組み立て ----------

  function build(settings, done) {
    const S = { ...DEFAULTS, ...settings };
    S.rest = (S.rest || []).map(Number);
    done = done || {};
    const P = phases(S);
    const exam = toT(S.exam);
    const days = new Map();
    const add = (t, task) => {
      const k = toS(t);
      if (!days.has(k)) days.set(k, []);
      days.get(k).push(task);
    };
    const T = tracks(S, P);
    const order = ['errors', 'er', 'tb1', 'tb2', 'tb3', 'tbm1', 'tbm2', 'kk1', 'hsk', 'kk2', 'idioms', 'tr1', 'tr2', 'tr3', 'pp1', 'pp2', 'ppfix', 'idrev', 'reading', 'journal', 'weekly'];

    T.forEach((tr) => {
      const plan = planTrack(S, tr, done);
      [...plan.keys()].sort((x, y) => x - y).forEach((t) => {
        const us = plan.get(t);
        if (tr.pair) {
          us.forEach((u) => {
            add(t, { key: `${tr.key}-${u.n}-w`, track: tr.key, name: tr.name, min: 120, ids: [`${u.id}-w`], lines: [{ head: `Paper ${u.n}`, meta: tr.timed ? 'Written · timed' : 'Written', notes: [] }] });
            const sun = t + DAY < exam ? t + DAY : t;
            add(sun, { key: `${tr.key}-${u.n}-l`, track: tr.key, name: tr.name, min: 90, ids: [`${u.id}-l`], lines: [{ head: `Paper ${u.n}`, meta: tr.timed ? 'Listening · timed + review' : 'Listening + review', notes: [] }] });
          });
        } else {
          add(t, { key: tr.key, track: tr.key, name: tr.name, min: tr.min, ids: us.map((u) => u.id), units: us.map((u) => u.n), lines: labelUnits(tr, us) });
        }
      });
    });

    // 時間だけ指定する固定タスク
    for (let t = P[0].a; t < exam; t += DAY) {
      if (S.rest.includes(dow(t))) continue;
      const k = toS(t);
      const ph = P.findIndex((p) => t >= p.a && t < p.b);
      add(t, { key: 'journal', track: 'journal', name: 'Journal', min: +S.journal || 45, fixed: `${k}|journal`, lines: [{ head: 'Listening', meta: '', notes: [] }] });
      if (ph >= 1) add(t, { key: 'reading', track: 'reading', name: 'Reading', min: 30, fixed: `${k}|reading`, lines: [{ head: 'Long text', meta: 'news · essays', notes: [] }] });
      if (dow(t) === 0 && ph <= 1) add(t, { key: 'weekly', track: 'weekly', name: 'Review', min: 30, fixed: `${k}|weekly`, lines: [{ head: 'Week', meta: 'mistakes · notes', notes: [] }] });
      if (ph === 3) {
        add(t, { key: 'idrev', track: 'idrev', name: 'Idioms', min: 15, fixed: `${k}|idrev`, lines: [{ head: 'Review', meta: 'due cards', notes: [] }] });
        if (dow(t) >= 1 && dow(t) <= 5) add(t, { key: 'ppfix', track: 'ppfix', name: 'Past Papers', min: 45, fixed: `${k}|ppfix`, lines: [{ head: 'Mistakes', meta: 'redo', notes: [] }] });
      }
    }

    days.forEach((list) => list.sort((x, y) => order.indexOf(x.track) - order.indexOf(y.track)));
    return { S, P, days, tracks: T, exam };
  }

  root.Plan = { build, phases, idiomList, translationList, DEFAULTS, PHASES, toT, toS, dow, DAY, unitDone };
})(typeof window !== 'undefined' ? window : globalThis);
