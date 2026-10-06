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
    e1Pages: '',
    inputShift: 0,
    anchors: [],
  };

  const PHASES = [
    { id: 'P1', name: 'Input' },
    { id: 'P2', name: 'Input → Output' },
    { id: 'P3', name: 'Output · Papers' },
    { id: 'P4', name: 'Final' },
  ];

  function phases(S) {
    const a = toT(S.start);
    const e = toT(S.exam);
    const n = Math.max(28, Math.round((e - a) / DAY));
    const cut = (f) => a + Math.round(n * f) * DAY;
    // 初期値で 10/6–12/31・1/1–3/31・4/1–8/31・9/1–試験前日 になる比率
    const c = [a, cut(0.2081), cut(0.4234), cut(0.7895), a + n * DAY];
    // チェックポイントの結果でインプット期を延ばした分だけ P2 の開始を遅らせる
    const shift = Math.max(0, Math.min(+S.inputShift || 0, Math.round((c[2] - c[1]) / DAY) - 28));
    c[1] += shift * DAY;
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

  function paperUnits(list, opts = {}) {
    const idx = (root.PAPERS_INDEX && root.PAPERS_INDEX.papers) || [];
    return list.map(([pid, pass, mock], i) => {
      const p = idx.find((x) => x.id === pid) || { level: pid.slice(0, 2), round: +pid.slice(3) };
      return { id: `pp-${pid}-${pass}`, paper: pid, level: p.level, round: p.round, pass, mock: !!mock, timed: opts.timed || !!mock, n: i + 1, w: 1 };
    });
  }

  function tracks(S, P) {
    const B = root.BOOKS;
    const [p1, p2, p3, p4] = P;
    const exam = toT(S.exam);
    const all = () => true;
    const on = (...ds) => (t) => ds.includes(dow(t));
    const weekday = (t) => dow(t) >= 1 && dow(t) <= 5;
    const nId = idiomList().length;
    const nTr = translationList().length;
    const hskN = Math.ceil(B.hsk.words / B.hsk.chunk);
    const trSeq = (a, b, pre = 'tr') => seq(Math.max(0, Math.min(b, nTr) - a + 1), (k) => ({ id: `${pre}-${a + k - 1}`, n: a + k - 1, w: 1 }));
    const p3cut = p3.a + Math.round((p3.b - p3.a) * 0.6 / DAY) * DAY;

    return [
      // 過去問（土=筆記、日=リスニング＋復習）。先に組んで土曜を確保する
      { key: 'ppD', name: 'Past Papers', pair: true, from: p1.a, to: p1.a + 8 * DAY, days: on(6), units: paperUnits([['P1-117', 1]]), diag: true },
      { key: 'ppC', name: 'Past Papers', pair: true, from: p1.b - 21 * DAY, to: p1.b, days: on(6), units: paperUnits([['P1-108', 1]]) },
      { key: 'ppA', name: 'Past Papers', pair: true, from: p2.a, to: p2.b, days: on(6), units: paperUnits([['P1-109', 1], ['P1-110', 1], ['P1-111', 1], ['P1-112', 1]]) },
      { key: 'ppB', name: 'Past Papers', pair: true, from: p3.a, to: p3cut, days: on(6), units: paperUnits([['P1-113', 1], ['P1-114', 1], ['P1-115', 1], ['P1-116', 1]]) },
      { key: 'ppL', name: 'Past Papers', pair: true, from: p3cut, to: p3.b, days: on(6), units: paperUnits([['L1-110', 1]], { timed: true }) },
      { key: 'ppF', name: 'Past Papers', pair: true, from: p4.a, to: exam - DAY, days: on(6), units: paperUnits([['L1-113', 1], ['L1-110', 2], ['L1-116', 1, true], ['L1-113', 2], ['L1-116', 2]], { timed: true }) },

      // P1 Foundation
      { key: 'errors', name: 'Errors', min: 75, from: p1.a, to: p1.b, days: all, units: errorsUnits(S) },
      { key: 'tb1', name: 'Training Book', min: 45, from: p1.a, to: p1.b, days: all, units: tbUnits(['p1', 'p2']) },
      { key: 'kk1', name: 'Kikutan', min: 30, from: p1.a, to: p1.b, days: all, units: seq(B.kikutan.days, (n) => ({ id: `kk-${n}`, n, w: 1 })) },

      // P2 Format
      { key: 'tb2', name: 'Training Book', min: 75, from: p2.a, to: p2.b, days: all, units: tbUnits(['p3', 'p4', 'g1', 'g2', 'g3', 'g4']) },
      { key: 'tbm1', name: 'Training Book', min: 120, from: p2.a + 35 * DAY, to: p2.a + 63 * DAY, days: on(6), avoidPairs: true, units: tbUnits(['p5']) },
      { key: 'tbm2', name: 'Training Book', min: 120, from: p2.b - 21 * DAY, to: p2.b, days: on(6), avoidPairs: true, units: tbUnits(['g5']) },
      { key: 'hsk', name: 'HSK 7–9', min: 30, from: p2.a, to: Math.min(p4.a + 30 * DAY, exam), days: all, units: seq(hskN, (n) => ({ id: `hsk-${n}`, n, w: 1 })) },
      { key: 'idioms', name: 'Idioms', min: 15, from: p2.a, to: p3.b, days: all, units: seq(nId, (n) => ({ id: `id-${n}`, n, w: 1 })) },
      { key: 'tr2', name: 'Translate', min: 40, from: p2.a, to: p2.b, days: on(3, 6), units: trSeq(1, 24) },

      // P3 Past Papers
      { key: 'er', name: 'Errors · Review', min: 30, from: p3.a, to: p3.b, days: all, units: errorsUnits(S).map((u) => ({ ...u, id: `r${u.id}`, w: 1 })) },
      { key: 'kk2', name: 'Kikutan · Review', min: 15, from: p3.a, to: Math.min(p3.a + 61 * DAY, p3.b), days: all, units: seq(B.kikutan.days, (n) => ({ id: `kk2-${n}`, n, w: 1 })) },
      { key: 'tr2b', name: 'Translate', min: 40, from: p3.a, to: p3.b, days: on(3, 6), avoidPairs: true, units: trSeq(25, nTr) },

      // P4 Final
      { key: 'tr3', name: 'Translate · Redo', min: 30, from: p4.a, to: exam - DAY, days: weekday, units: trSeq(1, nTr, 'trr') },
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

  function planTrack(S, tr, done, blocked) {
    const plan = new Map();
    // 模試は過去問の土曜を避ける。避けると置ける日がなくなる場合は重ねる
    const daysFor = (from, to) => {
      const free = trackDays(S, from, to, (t) => tr.days(t) && !(tr.avoidPairs && blocked.has(t)));
      return free.length ? free : trackDays(S, from, to, tr.days);
    };
    assign(plan, tr.units, daysFor(tr.from, tr.to));
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
      assign(plan, remaining, daysFor(a, to));
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
      case 'tr1': case 'tr2': case 'tr2b': case 'tr3': {
        const list = translationList();
        return units.map((u) => ({ head: `T${u.n}`, meta: list[u.n - 1] ? list[u.n - 1].dir : '', notes: list[u.n - 1] ? [list[u.n - 1].t] : [] }));
      }
      default:
        return [];
    }
  }

  // CP0 は初週の基準測定。以降はフェーズの節目ごと
  function checkpointDays(S, P) {
    const [p1, p2, p3, p4] = P;
    const exam = toT(S.exam);
    const targets = [p1.a + DAY, p1.a + 42 * DAY, p1.b - 4 * DAY, p2.b - 4 * DAY, p3.a + 60 * DAY, p3.b - 4 * DAY, p4.a + 40 * DAY];
    return targets.map((t) => {
      let d = Math.min(Math.max(t, p1.a), exam - 2 * DAY);
      for (let i = 0; i < 7 && (dow(d) === 6 || dow(d) === 0 || S.rest.includes(dow(d))); i++) d += DAY;
      return d;
    });
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
    const order = ['cp', 'ppD', 'ppC', 'ppA', 'ppB', 'ppL', 'ppF', 'tbm1', 'tbm2', 'errors', 'er', 'tb1', 'tb2', 'kk1', 'hsk', 'kk2', 'idioms', 'vocab', 'tr1', 'tr2', 'tr2b', 'tr3', 'mistakes', 'ppfix', 'idrev', 'reading', 'journal', 'podcast', 'weekly'];
    const LV = { L1: 'Level 1', P1: 'Pre-1' };
    const blocked = new Set();

    T.forEach((tr) => {
      const plan = planTrack(S, tr, done, blocked);
      [...plan.keys()].sort((x, y) => x - y).forEach((t) => {
        const us = plan.get(t);
        if (tr.pair) {
          blocked.add(t);
          us.forEach((u) => {
            const head = `${LV[u.level] || u.level} #${u.round}`;
            const tag = u.mock ? 'Mock' : tr.diag ? 'Diagnostic' : u.pass > 1 ? 'Round 2' : '';
            const notes = tag ? [tag] : [];
            const base = { track: tr.key, name: tr.name, paper: u.paper };
            add(t, { ...base, key: `${u.id}-w`, min: 120, ids: [`${u.id}-w`], lines: [{ head, meta: u.timed ? 'Written · timed' : 'Written', notes }] });
            const sun = t + DAY < exam ? t + DAY : t;
            add(sun, { ...base, key: `${u.id}-l`, min: 90, ids: [`${u.id}-l`], lines: [{ head, meta: u.timed ? 'Listening · timed + review' : 'Listening + review', notes }] });
          });
        } else {
          add(t, { key: tr.key, track: tr.key, name: tr.name, min: tr.min, ids: us.map((u) => u.id), units: us.map((u) => u.n), lines: labelUnits(tr, us) });
        }
      });
    });

    // インプットの到達度を測るチェックポイント（土曜は過去問と重なるので避ける）
    const cpDays = checkpointDays(S, P);
    cpDays.forEach((t, i) => add(t, { key: `cp-${i}`, track: 'cp', name: 'Checkpoint', min: 40, ids: [`cp-${i}`], cp: i, lines: [{ head: `CP${i}`, meta: i === 0 ? 'baseline quiz' : 'quiz · analysis', notes: [] }] }));

    // 時間だけ指定する固定タスク
    for (let t = P[0].a; t < exam; t += DAY) {
      if (S.rest.includes(dow(t))) continue;
      const k = toS(t);
      const ph = P.findIndex((p) => t >= p.a && t < p.b);
      // 聞き取りは本物の声で：中国語ジャーナル（手順つき）と、取り込んだポッドキャスト（Listen タブ）
      const lm = +S.journal || 45;
      const pm = Math.max(10, Math.round(lm * 0.45 / 5) * 5);
      add(t, { key: 'journal', track: 'journal', name: 'Journal', min: lm - pm, fixed: `${k}|journal`, lines: [{ head: '中国語ジャーナル', meta: 'real voices', notes: ['通しで聞く（スクリプトは見ない）', 'スクリプトで確かめる', '分からなかった文を3回聞き直す', 'シャドーイング（1記事）'] }] });
      const pmode = ph === 0 ? 'dictation' : dow(t) === 3 ? 'summary' : dow(t) % 2 ? 'dictation' : 'shadow';
      const PMODE = { dictation: ['Dictation', '10 sentences · then Shadow', ['1文ずつ聞く → スクリブルで書く → Check', '聞き取れなかった字は Hanzi へ']], shadow: ['Shadow', '10 sentences', ['原稿を見て3回重ねる → 原稿を隠して2回']], summary: ['Summary', '1 chunk · 180–200字', ['3回まで聞いてメモ → 要約 → Claude で添削']] };
      add(t, { key: 'podcast', track: 'podcast', name: 'Podcast', min: pm, fixed: `${k}|podcast`, link: `#/listen/today/${pmode}`, lines: [{ head: PMODE[pmode][0], meta: PMODE[pmode][1], notes: PMODE[pmode][2] }] });
      // P1 は多読（やさしめの文章を大量に）、P2 以降は試験レベルの長文
      add(t, ph === 0
        ? { key: 'reading', track: 'reading', name: 'Reading', min: 30, fixed: `${k}|reading`, lines: [{ head: 'Extensive', meta: 'easy · a lot · no dictionary', notes: [] }] }
        : { key: 'reading', track: 'reading', name: 'Reading', min: 30, fixed: `${k}|reading`, lines: [{ head: 'Long text', meta: 'news · essays', notes: [] }] });
      if (dow(t) === 0) add(t, { key: 'weekly', track: 'weekly', name: 'Review', min: 30, fixed: `${k}|weekly`, lines: [{ head: 'Week', meta: 'scores · weak points', notes: [] }] });
      // 過去問の間違い直し（診断テストの翌週から毎日の平日）と、過去問語彙カード（P2 以降）
      if (t >= P[0].a + 7 * DAY && dow(t) >= 1 && dow(t) <= 5) add(t, { key: 'mistakes', track: 'mistakes', name: 'Mistakes', min: 15, fixed: `${k}|mistakes`, lines: [{ head: 'Review', meta: 'due questions', notes: [] }] });
      if (ph >= 1) add(t, { key: 'vocab', track: 'vocab', name: 'Exam Vocab', min: 15, fixed: `${k}|vocab`, lines: [{ head: 'Review', meta: 'due cards', notes: [] }] });
      if (ph === 3) {
        add(t, { key: 'idrev', track: 'idrev', name: 'Idioms', min: 15, fixed: `${k}|idrev`, lines: [{ head: 'Review', meta: 'due cards', notes: [] }] });
        if (dow(t) >= 1 && dow(t) <= 5) add(t, { key: 'ppfix', track: 'ppfix', name: 'Past Papers', min: 45, fixed: `${k}|ppfix`, lines: [{ head: 'Weak sections', meta: 'redo', notes: [] }] });
      }
    }

    days.forEach((list) => list.sort((x, y) => order.indexOf(x.track) - order.indexOf(y.track)));
    return { S, P, days, tracks: T, exam };
  }

  root.Plan = { build, phases, checkpointDays, idiomList, translationList, DEFAULTS, PHASES, toT, toS, dow, DAY, unitDone };
})(typeof window !== 'undefined' ? window : globalThis);
