// スケジュールの検証: 全ユニットが試験日前に1回ずつ割り当てられているか、毎日の合計が1日の時間（daily）に収まっているか
// 使い方: node tools/check-plan.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['data/books.js', 'data/papers-index.js', 'data/idioms-a.js', 'data/idioms-b.js', 'data/idioms-c.js', 'data/translation-a.js', 'data/translation-b.js', 'assets/plan.js']) {
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
// 模試（合格奪取）と過去問が同じ土曜に重ならないこと
for (const [day, tasks] of r.days) {
  const heavy = tasks.filter((t) => t.min >= 120);
  check(heavy.length <= 1, `two 120-min tasks on ${day}: ${heavy.map((t) => t.key).join(', ')}`);
}
// 過去問の日程
console.log('papers:', [...r.days].flatMap(([d, ts]) => ts.filter((t) => t.paper && t.key.endsWith('-w')).map((t) => `${d} ${t.lines[0].head}${t.lines[0].notes[0] ? ' (' + t.lines[0].notes[0] + ')' : ''}`)).join('\n        '));
console.log('phases:', r.P.map((p) => `${p.id} ${Plan.toS(p.a)}..${Plan.toS(p.b - Plan.DAY)}`).join(' | '));
// 1日の合計が daily の −30〜+15 分（過去問・模試の日は +30 分）に収まること
function checkDaily(label, res) {
  for (const [day, tasks] of res.days) {
    const tot = tasks.reduce((s, t) => s + t.min, 0);
    const heavy = tasks.some((t) => t.min >= 90 && (t.paper || /^tbm/.test(t.track)));
    check(tot >= res.daily - 30 && tot <= res.daily + (heavy ? 30 : 15), `${label}: ${day} total ${tot}m (daily ${res.daily})`);
  }
}
checkDaily('default', r);
checkDaily('rest Wed', Plan.build({ rest: [3] }, {}));
const mins = [...r.days.values()].map((ts) => ts.reduce((s, t) => s + t.min, 0));
console.log('days:', r.days.size, 'min/day avg', Math.round(mins.reduce((a, b) => a + b, 0) / mins.length), 'max', Math.max(...mins), 'min', Math.min(...mins));
console.log('idioms:', Plan.idiomList().length, 'translations:', Plan.translationList().length);
for (const d of ['2026-10-06', '2026-10-10', '2026-10-11', '2027-01-13', '2027-05-05', '2027-10-04', '2027-11-27']) {
  console.log('\n' + d);
  for (const t of r.days.get(d) || []) console.log(`  ${t.name.padEnd(16)} ${String(t.min).padStart(3)}m  ` + t.lines.map((l) => `${l.head} ${l.meta}${l.notes[0] ? ` — ${l.notes[0]}` : ''}`).join(' / '));
}

// 他の設定
verify('rest Sun', { rest: [0] });
verify('short', { start: '2027-03-01', exam: '2027-11-28' });

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
