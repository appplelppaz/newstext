// スケジュールの検証: 全ユニットが試験日前に1回ずつ割り当てられているか
// 使い方: node tools/check-plan.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['data/books.js', 'data/idioms-a.js', 'data/idioms-b.js', 'data/idioms-c.js', 'data/translation-a.js', 'data/translation-b.js', 'assets/plan.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
}
const { Plan } = ctx;
let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log('NG  ' + msg); } };

function verify(label, settings, done) {
  const r = Plan.build(settings, done);
  const seen = new Map();
  for (const [day, tasks] of r.days) {
    check(day < r.S.exam, `${label}: task on/after exam ${day}`);
    for (const t of tasks) for (const id of t.ids || []) seen.set(id, (seen.get(id) || 0) + 1);
  }
  for (const tr of r.tracks) {
    for (const u of tr.units) {
      const ids = tr.pair ? [`${u.id}-w`, `${u.id}-l`] : [u.id];
      for (const id of ids) {
        const c = seen.get(id) || 0;
        check(c === 1, `${label}: ${tr.key} ${id} scheduled ${c}x`);
      }
    }
  }
  return r;
}

const r = verify('default', {});
console.log('phases:', r.P.map((p) => `${p.id} ${Plan.toS(p.a)}..${Plan.toS(p.b - Plan.DAY)}`).join(' | '));
const mins = [...r.days.values()].map((ts) => ts.reduce((s, t) => s + t.min, 0));
console.log('days:', r.days.size, 'min/day avg', Math.round(mins.reduce((a, b) => a + b, 0) / mins.length), 'max', Math.max(...mins), 'min', Math.min(...mins));
console.log('idioms:', Plan.idiomList().length, 'translations:', Plan.translationList().length);
for (const d of ['2026-10-06', '2026-10-10', '2027-02-03', '2027-06-05', '2027-06-06', '2027-10-04', '2027-11-27']) {
  console.log('\n' + d);
  for (const t of r.days.get(d) || []) console.log(`  ${t.name.padEnd(16)} ${String(t.min).padStart(3)}m  ` + t.lines.map((l) => `${l.head} ${l.meta}`).join(' / '));
}

// 他の設定
verify('rest Sun', { rest: [0] });
verify('short', { start: '2027-03-01', exam: '2027-11-28', papers: 8 });

// 再配分: 11/20 時点で errors の半分しか終わっていない
const done = {};
const base = Plan.build({}, {});
let i = 0;
for (const [day, tasks] of base.days) {
  if (day >= '2026-11-20') continue;
  for (const t of tasks) for (const id of t.ids || []) if (i++ % 2 === 0) done[id] = day;
}
verify('rebalance', { anchors: ['2026-11-20'] }, done);
verify('rebalance x2', { anchors: ['2026-11-20', '2027-03-15'] }, done);
verify('late anchor', { anchors: ['2027-11-20'] }, done);

console.log(fail ? `\n${fail} problem(s)` : '\nOK');
process.exit(fail ? 1 : 0);
