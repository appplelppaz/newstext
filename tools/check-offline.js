// sw.js の PRECACHE に、アプリを構成するファイルがすべて入っているかを確かめる
// 使い方: node tools/check-offline.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const list = [...sw.match(/const PRECACHE = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

let bad = 0;
const ng = (m) => { bad++; console.log(`NG ${m}`); };

// index.html が読み込むローカルのファイル
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|#|data:)/.test(u));
// assets/ と data/ の全ファイル（過去問の JSON は端末の IndexedDB に入るので対象外）
const dirs = ['assets', 'data'].flatMap((d) => fs.readdirSync(path.join(root, d)).map((f) => `${d}/${f}`));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
const icons = manifest.icons.map((i) => i.src);

new Set([...refs, ...dirs, ...icons, 'index.html']).forEach((f) => { if (!list.includes(f)) ng(`${f} is not in PRECACHE`); });
list.filter((f) => f !== './').forEach((f) => { if (!fs.existsSync(path.join(root, f))) ng(`${f} in PRECACHE does not exist`); });
if (new Set(list).size !== list.length) ng('PRECACHE has duplicates');

console.log(bad ? `${bad} problem(s)` : `OK (${list.length} files)`);
process.exit(bad ? 1 : 0);
