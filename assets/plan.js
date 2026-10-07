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
    daily: 180, // 1日の学習時間（分）。教材の分量はこの中に収まるように日ごとに割り振る
    journal: 40, // 聞き取り（中国語ジャーナル＋ポッドキャスト）の分数
    toc: {}, // Books 画面で直した目次（books.js より優先）
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
    // 初期値で 10/6–1/31・2/1–4/30・5/1–8/31・9/1–試験前日 になる比率（1日3時間で教材を終えるため、インプットを4か月に）
    const c = [a, cut(0.2823), cut(0.4952), cut(0.7895), a + n * DAY];
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

  const seq = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1));

  // 目次：Books 画面で直したもの（S.toc）があればそれを、なければ books.js を使う
  const tocOf = (S, key, def) => { const o = S.toc && S.toc[key]; return Array.isArray(o) && o.length ? o : def; };
  const chapterOf = (chs, n) => { const c = (chs || []).filter((x) => x[0] <= n).pop(); return c ? c[1] : ''; };

  function errorsUnits(S) {
    const B = root.BOOKS;
    const out = [];
    [['errors1', 'I', 'e1'], ['errors2', 'II', 'e2'], ['errors3', 'III', 'e3']].forEach(([key, label, pre]) => {
      const bk = B[key];
      const items = tocOf(S, key, bk.items);
      items.forEach(([p0, title], i) => {
        const n = i + 1;
        const p1 = (bk.breaks && bk.breaks[n]) || (n < items.length ? items[n][0] - 1 : bk.endPage);
        out.push({ id: `${pre}-${n}`, book: label, n, p0, p1, title, note: `${pad2(n)} ${title}`, ch: chapterOf(bk.chapters, n), w: Math.max(1, p1 - p0 + 1) });
      });
    });
    return out;
  }

  // 合格奪取：STEP ごとの見出し（sections: [[最初の問題番号, 見出し, ページ]]）があれば、問題ごとに持たせる
  function tbUnits(S, ids) {
    const out = [];
    root.BOOKS.training.steps.filter((s) => ids.includes(s.id)).forEach((s) => {
      const secs = tocOf(S, `training.${s.id}`, s.sections || []);
      for (let q = 1; q <= s.q; q++) {
        const sec = secs.filter((x) => x[0] <= q).pop();
        out.push({ id: `tb-${s.id}-${q}`, step: s, n: q, sec: sec ? { title: sec[1], page: sec[2] } : null, w: s.w || 1 });
      }
    });
    return out;
  }
  // キクタン：週・Day の見出し（weeks: [[最初の Day, 見出し]]）
  function kkUnits(S, pre) {
    const K = root.BOOKS.kikutan;
    const weeks = tocOf(S, 'kikutan', K.weeks || []);
    return seq(K.days, (n) => { const w = weeks.filter((x) => x[0] <= n).pop(); return { id: `${pre}-${n}`, n, title: w ? w[1] : '', w: 1 }; });
  }

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

      // 以下の教材は「min」を目安の比率として、その日の空き時間（daily − 固定タスク）を分け合う
      // P1 Foundation
      { key: 'errors', name: 'Errors', min: 75, from: p1.a, to: p1.b, days: all, units: errorsUnits(S) },
      { key: 'tb1', name: 'Training Book', min: 45, from: p1.a, to: p1.b, days: all, units: tbUnits(S, ['p1', 'p2']) },
      { key: 'kk1', name: 'Kikutan', min: 30, from: p1.a, to: p1.b, days: all, units: kkUnits(S, 'kk') },

      // P2 Format
      { key: 'tb2', name: 'Training Book', min: 75, from: p2.a, to: p2.b, days: all, units: tbUnits(S, ['p3', 'p4', 'g1', 'g2', 'g3', 'g4']) },
      { key: 'tbm1', name: 'Training Book', min: 120, fixedMin: true, from: p2.a + 35 * DAY, to: p2.a + 63 * DAY, days: on(6), avoidPairs: true, units: tbUnits(S, ['p5']) },
      { key: 'tbm2', name: 'Training Book', min: 120, fixedMin: true, from: p2.b - 21 * DAY, to: p2.b, days: on(6), avoidPairs: true, units: tbUnits(S, ['g5']) },
      { key: 'hsk', name: 'HSK 7–9', min: 20, from: p2.a, to: p3.b, days: all, units: seq(hskN, (n) => ({ id: `hsk-${n}`, n, w: 1 })) },
      { key: 'idioms', name: 'Idioms', min: 15, from: p2.a, to: p3.b, days: all, units: seq(nId, (n) => ({ id: `id-${n}`, n, w: 1 })) },
      { key: 'tr2', name: 'Translate', min: 40, from: p2.a, to: p2.b, days: on(3, 6), units: trSeq(1, 24) },

      // P3 Past Papers
      { key: 'er', name: 'Errors · Review', min: 30, from: p3.a, to: p3.b, days: all, units: errorsUnits(S).map((u) => ({ ...u, id: `r${u.id}`, w: 1 })) },
      { key: 'kk2', name: 'Kikutan · Review', min: 15, from: p3.a, to: Math.min(p3.a + 61 * DAY, p3.b), days: all, units: kkUnits(S, 'kk2') },
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

  // ユニットを日に割り当てる。wt があれば、その日の割り当て分数に比例して多く置く
  function assign(plan, units, days, wt) {
    if (!units.length || !days.length) return;
    let ws = days.map((t) => (wt ? wt(t) : 1));
    if (!ws.some((x) => x > 0)) ws = days.map(() => 1);
    const tot = ws.reduce((a, x) => a + x, 0);
    const cum = [];
    ws.reduce((a, x, i) => (cum[i] = a + x), 0);
    const W = units.reduce((s, u) => s + u.w, 0);
    let c = 0;
    let d = 0;
    units.forEach((u) => {
      const m = ((c + u.w / 2) / W) * tot;
      c += u.w;
      while (d < days.length - 1 && cum[d] <= m) d++;
      const t = days[d];
      if (!plan.has(t)) plan.set(t, []);
      plan.get(t).push(u);
    });
  }

  function planTrack(S, tr, done, blocked, wt) {
    const plan = new Map();
    // 模試は過去問の土曜を避ける。避けると置ける日がなくなる場合は重ねる
    const daysFor = (from, to) => {
      const free = trackDays(S, from, to, (t) => tr.days(t) && !(tr.avoidPairs && blocked.has(t)));
      const list = free.length ? free : trackDays(S, from, to, tr.days);
      // 時間の割り当てがある日だけに置く（割り当てがどこにもなければ、そのまま）
      const timed = wt ? list.filter((t) => wt(t) > 0) : list;
      return timed.length ? timed : list;
    };
    assign(plan, tr.units, daysFor(tr.from, tr.to), wt);
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
      assign(plan, remaining, daysFor(a, to), wt);
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

  // その日の範囲と、目次の項目名（notes）を作る
  function labelUnits(tr, units) {
    const first = units[0];
    const last = units[units.length - 1];
    switch (tr.key) {
      case 'errors':
      case 'er':
        return groupRuns(units, (u) => `${u.book}|${u.ch}`).map((g) => {
          const a = g.units[0];
          const b = g.units[g.units.length - 1];
          return {
            head: `${a.book}  ${rng(`#${a.n}`, `#${b.n}`).replace('–#', '–')}${a.ch ? ` · ${a.ch}` : ''}`,
            meta: tr.key === 'er' ? `review · p.${rng(a.p0, b.p1)}` : `p.${rng(a.p0, b.p1)}`,
            notes: g.units.map((u) => u.note),
          };
        });
      case 'tb1': case 'tb2': case 'tbm1': case 'tbm2':
        return groupRuns(units, (u) => u.step.id).map((g) => {
          const s = g.units[0].step;
          if (s.mock) return { head: `${s.level}  Mock`, meta: 'timed', notes: [s.label] };
          const secs = groupRuns(g.units.filter((u) => u.sec), (u) => u.sec.title).map((x) => `${x.key}${x.units[0].sec.page ? `（p.${x.units[0].sec.page}〜）` : ''}`);
          return { head: `${s.level}  STEP ${s.step}`, meta: `Q${rng(g.units[0].n, g.units[g.units.length - 1].n)}`, notes: [s.label, ...secs] };
        });
      case 'kk1': case 'kk2':
        return [{ head: `Day ${rng(first.n, last.n)}`, meta: tr.key === 'kk2' ? 'review' : '', notes: [...new Set(units.map((u) => u.title).filter(Boolean))] }];
      case 'hsk': {
        const c = root.BOOKS.hsk.chunk;
        const a = (first.n - 1) * c + 1;
        const b = Math.min(last.n * c, root.BOOKS.hsk.words);
        return [{ head: `#${rng(a, b)}`, meta: `${b - a + 1} words`, notes: [] }];
      }
      case 'idioms':
        return [{ head: `#${rng(first.n, last.n)}`, meta: '+ review', notes: [] }];
      case 'tr2': case 'tr2b': case 'tr3': {
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
    S.toc = S.toc || {};
    done = done || {};
    const P = phases(S);
    const exam = toT(S.exam);
    const daily = Math.max(60, +S.daily || DEFAULTS.daily);
    const days = new Map();
    const used = new Map(); // 日ごとに入った分数
    const add = (t, task) => {
      const k = toS(t);
      if (!days.has(k)) days.set(k, []);
      days.get(k).push(task);
      used.set(k, (used.get(k) || 0) + (task.min || 0));
    };
    const usedOn = (t) => used.get(toS(t)) || 0;
    const T = tracks(S, P);
    const order = ['cp', 'ppD', 'ppC', 'ppA', 'ppB', 'ppL', 'ppF', 'tbm1', 'tbm2', 'errors', 'er', 'tb1', 'tb2', 'kk1', 'hsk', 'kk2', 'idioms', 'vocab', 'tr2', 'tr2b', 'tr3', 'mistakes', 'ppfix', 'flex', 'idrev', 'reading', 'journal', 'podcast', 'jzdrill', 'weekly'];
    const LV = { L1: 'Level 1', P1: 'Pre-1' };
    const blocked = new Set();
    const phaseOf = (t) => P.findIndex((p) => t >= p.a && t < p.b);

    // 1. 時間の決まっているもの：過去問（土 120分・日 90分）と模試（120分）
    T.filter((tr) => tr.pair || tr.fixedMin).forEach((tr) => {
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

    // 2. チェックポイント（土曜は過去問と重なるので避ける）
    const cpDays = checkpointDays(S, P);
    cpDays.forEach((t, i) => add(t, { key: `cp-${i}`, track: 'cp', name: 'Checkpoint', min: 40, ids: [`cp-${i}`], cp: i, lines: [{ head: `CP${i}`, meta: i === 0 ? 'baseline quiz' : 'quiz · analysis', notes: [] }] }));

    // 3. 毎日の固定タスク（時間だけ決まっているもの）
    for (let t = P[0].a; t < exam; t += DAY) {
      if (S.rest.includes(dow(t))) continue;
      const k = toS(t);
      const ph = phaseOf(t);
      // 聞き取りは本物の声で：中国語ジャーナル（手順つき）と、取り込んだポッドキャスト（Listen タブ）
      const lm = Math.max(20, +S.journal || DEFAULTS.journal);
      const pm = Math.max(10, Math.round((lm * 0.375) / 5) * 5);
      add(t, { key: 'journal', track: 'journal', name: 'Journal', min: lm - pm, fixed: `${k}|journal`, lines: [{ head: '中国語ジャーナル', meta: 'real voices', notes: ['通しで聞く（スクリプトは見ない）', 'スクリプトで確かめる', '分からなかった文を3回聞き直す', 'シャドーイング（1記事）'] }] });
      const pmode = ph === 0 ? 'dictation' : dow(t) === 3 ? 'summary' : dow(t) % 2 ? 'dictation' : 'shadow';
      const PMODE = { dictation: ['Dictation', '10 sentences · then Shadow', ['1文ずつ聞く → スクリブルで書く → Check', '聞き取れなかった字は Hanzi へ']], shadow: ['Shadow', '10 sentences', ['原稿を見て3回重ねる → 原稿を隠して2回']], summary: ['Summary', '1 chunk · 180–200字', ['3回まで聞いてメモ → 要約 → Claude で添削']] };
      add(t, { key: 'podcast', track: 'podcast', name: 'Podcast', min: pm, fixed: `${k}|podcast`, link: `#/listen/today/${pmode}`, lines: [{ head: PMODE[pmode][0], meta: PMODE[pmode][1], notes: PMODE[pmode][2] }] });
      // 日文中訳ドリル（10月から火・金。P1 は短い記事で）：本物の記事から出題し、Claude の添削で弱点と表現を貯める
      if ([2, 5].includes(dow(t))) add(t, { key: 'jzdrill', track: 'jzdrill', name: 'JA → ZH Drill', min: ph === 0 ? 25 : 30, fixed: `${k}|jzdrill`, link: '#/zhdrill', lines: [{ head: '日文中訳ドリル', meta: ph === 0 ? '1 article · 150字' : '1 article · 150–250字', notes: ['記事を選ぶ → Claude で出題 → スクリブルで訳す → 提出して添削', '覚えるべき表現を表現ノートに保存し、日本語 → 中国語で言えるか確かめる'] }] });
      // P1 は多読（やさしめの文章を大量に）、P2 以降は試験レベルの長文
      add(t, ph === 0
        ? { key: 'reading', track: 'reading', name: 'Reading', min: 20, fixed: `${k}|reading`, lines: [{ head: 'Extensive', meta: 'easy · a lot · no dictionary', notes: [] }] }
        : { key: 'reading', track: 'reading', name: 'Reading', min: 20, fixed: `${k}|reading`, lines: [{ head: 'Long text', meta: 'news · essays', notes: [] }] });
      if (dow(t) === 0) add(t, { key: 'weekly', track: 'weekly', name: 'Review', min: 20, fixed: `${k}|weekly`, link: '#/progress', lines: [{ head: 'Week', meta: 'weak points · next week', notes: ['Progress の Weak points を見て、来週どこに時間を回すか決める'] }] });
      // 過去問の間違い直し（診断テストの翌週から平日）と、過去問語彙カード（P2 以降）
      if (t >= P[0].a + 7 * DAY && dow(t) >= 1 && dow(t) <= 5) add(t, { key: 'mistakes', track: 'mistakes', name: 'Mistakes', min: 15, fixed: `${k}|mistakes`, lines: [{ head: 'Review', meta: 'due questions', notes: [] }] });
      if (ph >= 1) add(t, { key: 'vocab', track: 'vocab', name: 'Exam Vocab', min: 15, fixed: `${k}|vocab`, lines: [{ head: 'Review', meta: 'due cards', notes: [] }] });
      if (ph === 3) add(t, { key: 'idrev', track: 'idrev', name: 'Idioms', min: 15, fixed: `${k}|idrev`, lines: [{ head: 'Review', meta: 'due cards', notes: [] }] });
    }

    // 4. 教材：その日の空き（daily − ここまでの分数）を、動いているトラックで min の比率に分ける
    const elastic = T.filter((tr) => !tr.pair && !tr.fixedMin);
    const allot = new Map(elastic.map((tr) => [tr.key, new Map()]));
    for (let t = P[0].a; t < exam; t += DAY) {
      if (S.rest.includes(dow(t))) continue;
      const act = elastic.filter((tr) => t >= tr.from && t < Math.min(tr.to, exam) && tr.days(t) && !(tr.avoidPairs && blocked.has(t)));
      if (!act.length) continue;
      const free = daily - usedOn(t);
      const sum = act.reduce((a, tr) => a + tr.min, 0);
      act.forEach((tr) => {
        let m = Math.round(Math.min(tr.min * 1.4, (free * tr.min) / sum) / 5) * 5;
        if (m < 10) m = 0;
        allot.get(tr.key).set(t, m);
      });
    }
    elastic.forEach((tr) => {
      const A = allot.get(tr.key);
      const wt = (t) => A.get(t) || 0;
      const plan = planTrack(S, tr, done, blocked, wt);
      [...plan.keys()].sort((x, y) => x - y).forEach((t) => {
        const us = plan.get(t);
        add(t, { key: tr.key, track: tr.key, name: tr.name, min: Math.max(10, wt(t) || tr.min), ids: us.map((u) => u.id), units: us.map((u) => u.n), lines: labelUnits(tr, us) });
      });
    });

    // 5. 残りの時間：P4 は過去問の弱い大問のやり直し（どの大問かは Today で得点から選ぶ）、
    //    それまでは遅れの取り戻しか弱点の復習（大きなユニットが置けなかった日に空きが出る）
    for (let t = P[0].a; t < exam; t += DAY) {
      if (S.rest.includes(dow(t))) continue;
      const m = Math.min(120, Math.floor((daily - usedOn(t)) / 5) * 5);
      const k = toS(t);
      if (phaseOf(t) === 3 && m >= 15) add(t, { key: 'ppfix', track: 'ppfix', name: 'Past Papers', min: m, fixed: `${k}|ppfix`, lines: [{ head: 'Weak sections', meta: 'redo', notes: [] }] });
      else if (m >= 25) add(t, { key: 'flex', track: 'flex', name: 'Catch-up', min: m, fixed: `${k}|flex`, link: '#/progress', lines: [{ head: 'Behind or weak points', meta: 'your choice', notes: ['遅れている教材を進める。遅れがなければ Progress の Weak points の上位を復習'] }] });
    }

    days.forEach((list) => list.sort((x, y) => order.indexOf(x.track) - order.indexOf(y.track)));
    return { S, P, days, tracks: T, exam, daily };
  }

  root.Plan = { build, phases, checkpointDays, idiomList, translationList, DEFAULTS, PHASES, toT, toS, dow, DAY, unitDone };
})(typeof window !== 'undefined' ? window : globalThis);
