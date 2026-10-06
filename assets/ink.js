// Apple Pencil で手書きする部品。原稿用紙のマス目（grid）とメモ帳（pad）
// 書いた線は IndexedDB（level1 / ink）に保存する。座標はマス（またはメモ帳の幅）を単位にして、画面を回してもずれないようにする
window.Ink = (function () {
  'use strict';

  // ---------- 保存 ----------
  let dbp = null;
  function db() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        const r = indexedDB.open('level1', 3);
        r.onupgradeneeded = () => {
          const d = r.result;
          if (!d.objectStoreNames.contains('papers')) d.createObjectStore('papers', { keyPath: 'id' });
          if (!d.objectStoreNames.contains('ink')) d.createObjectStore('ink', { keyPath: 'k' });
          if (!d.objectStoreNames.contains('pods')) d.createObjectStore('pods', { keyPath: 'id' }); // ポッドキャスト（原稿と音声）
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return dbp;
  }
  async function load(k) {
    try {
      const d = await db();
      return await new Promise((res) => {
        const q = d.transaction('ink').objectStore('ink').get(k);
        q.onsuccess = () => res(q.result || null);
        q.onerror = () => res(null);
      });
    } catch (e) { return null; }
  }
  async function put(rec) {
    try {
      const d = await db();
      d.transaction('ink', 'readwrite').objectStore('ink').put(rec);
    } catch (e) { /* 保存できなくても書くことはできる */ }
  }
  async function remove(k) {
    try {
      const d = await db();
      d.transaction('ink', 'readwrite').objectStore('ink').delete(k);
    } catch (e) { /* なし */ }
  }

  // 一度 Pencil を使ったら、指では書かずにスクロールする（手のひらの誤反応を防ぐ）
  const PEN = 'level1.pen';
  const penSeen = () => { try { return localStorage.getItem(PEN) === '1'; } catch (e) { return false; } };
  const setPen = () => { try { localStorage.setItem(PEN, '1'); } catch (e) { /* なし */ } };

  function scroller(el) {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight) return p;
    }
    return null;
  }

  const HAN = /\p{Script=Han}/u;
  const chars = (t) => [...String(t || '').replace(/\s/g, '')];

  // ---------- 共通の書く面 ----------
  // o.kind: 'grid' | 'pad'
  function surface(host, o) {
    const grid = o.kind === 'grid';
    const st = { cols: o.cols || 0, rows: o.rows || 1, strokes: [], marks: [], ratio: o.ratio || 0.62 };
    let unit = 1; // 1単位の px（grid はマスの幅、pad は幅の 1/100）
    let mode = 'pen';
    let cur = null;
    let model = null;
    let finger = null;
    const undoStack = [];

    host.classList.add('ink-host');
    host.innerHTML = `
      ${o.tools === false ? '' : `<div class="ink-tools">
        <button type="button" class="ink-b on" data-m="pen" aria-label="Pen">${ICON.pen}</button>
        <button type="button" class="ink-b" data-m="erase" aria-label="Eraser">${ICON.erase}</button>
        <button type="button" class="ink-b" data-a="undo" aria-label="Undo">${ICON.undo}</button>
        <button type="button" class="ink-b" data-a="clear" aria-label="Clear">${ICON.clear}</button>
        ${grid && o.onMark ? `<button type="button" class="ink-b ink-markb" data-m="mark" aria-label="Mark" hidden>${ICON.mark}</button>` : ''}
        <span class="spacer"></span><span class="ink-info"></span>
      </div>`}
      <div class="ink-paper ${grid ? 'grid' : 'pad'}">
        <canvas class="ink-c"></canvas>
        <div class="ink-ov" aria-hidden="true"></div>
        <div class="ink-hover" hidden></div>
      </div>`;
    const paper = host.querySelector('.ink-paper');
    const c = host.querySelector('canvas');
    const ov = host.querySelector('.ink-ov');
    const hov = host.querySelector('.ink-hover');
    const ctx2 = c.getContext('2d');
    const dpr = () => window.devicePixelRatio || 1;

    function layout() {
      const w = paper.clientWidth || host.clientWidth || 600;
      if (grid) {
        if (!st.cols) st.cols = Math.max(o.minCols || 4, Math.min(o.maxCols || 20, Math.floor(w / (o.cell || 46))));
        unit = o.fixed ? Math.min(o.cell, w / st.cols) : w / st.cols;
        // 字数の上限が入る行数（＋1行）を最初から用意する
        if (o.fitChars) st.rows = Math.max(st.rows, Math.ceil(o.fitChars / st.cols) + 1);
      } else unit = w / 100;
      const cw = grid ? st.cols * unit : w;
      const ch = grid ? st.rows * unit : w * st.ratio;
      paper.style.width = grid ? `${cw}px` : '';
      paper.style.height = `${ch}px`;
      c.width = Math.round(cw * dpr());
      c.height = Math.round(ch * dpr());
      c.style.width = `${cw}px`;
      c.style.height = `${ch}px`;
      paper.style.setProperty('--cell', `${unit}px`);
      redraw();
      overlay();
    }

    function bg() {
      const g = ctx2;
      const W = c.width / dpr();
      const H = c.height / dpr();
      g.clearRect(0, 0, W, H);
      const line = getComputedStyle(host).getPropertyValue('--grid').trim() || '#e2b8ad';
      g.lineWidth = 1;
      g.strokeStyle = line;
      g.beginPath();
      if (grid) {
        for (let i = 0; i <= st.cols; i++) { const x = Math.round(i * unit) + 0.5; g.moveTo(x, 0); g.lineTo(x, H); }
        for (let j = 0; j <= st.rows; j++) { const y = Math.round(j * unit) + 0.5; g.moveTo(0, y); g.lineTo(W, y); }
      } else {
        for (let y = unit * 8; y < H; y += unit * 8) { g.moveTo(0, Math.round(y) + 0.5); g.lineTo(W, Math.round(y) + 0.5); }
      }
      g.stroke();
      if (grid) {
        // マスの中心の薄い十字（字の大きさと位置をそろえる目安）
        g.save();
        g.setLineDash([2, 4]);
        g.globalAlpha = 0.35;
        g.beginPath();
        for (let i = 0; i < st.cols; i++) { const x = (i + 0.5) * unit; g.moveTo(x, 0); g.lineTo(x, H); }
        for (let j = 0; j < st.rows; j++) { const y = (j + 0.5) * unit; g.moveTo(0, y); g.lineTo(W, y); }
        g.stroke();
        g.restore();
      }
    }
    const inkColor = () => getComputedStyle(host).getPropertyValue('--ink').trim() || '#141414';
    function width(s, p) { return Math.max(0.6, s.w * unit * (0.45 + 0.85 * (p == null ? 0.5 : p))); }
    function drawSeg(s, i) {
      const g = ctx2;
      const P = s.pts;
      const a = P[i - 1];
      const b = P[i];
      const pa = i >= 2 ? P[i - 2] : a;
      const m1 = [(pa[0] + a[0]) / 2, (pa[1] + a[1]) / 2];
      const m2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      g.lineWidth = width(s, b[2]);
      g.beginPath();
      g.moveTo(m1[0] * unit, m1[1] * unit);
      g.quadraticCurveTo(a[0] * unit, a[1] * unit, m2[0] * unit, m2[1] * unit);
      g.stroke();
    }
    function drawStroke(s) {
      const g = ctx2;
      g.strokeStyle = s.c || inkColor();
      g.lineCap = 'round';
      g.lineJoin = 'round';
      if (s.pts.length === 1) {
        const p = s.pts[0];
        g.fillStyle = g.strokeStyle;
        g.beginPath();
        g.arc(p[0] * unit, p[1] * unit, width(s, p[2]) / 2, 0, Math.PI * 2);
        g.fill();
        return;
      }
      for (let i = 1; i < s.pts.length; i++) drawSeg(s, i);
      const L = s.pts[s.pts.length - 1];
      const M = s.pts[s.pts.length - 2];
      g.lineWidth = width(s, L[2]);
      g.beginPath();
      g.moveTo(((M[0] + L[0]) / 2) * unit, ((M[1] + L[1]) / 2) * unit);
      g.lineTo(L[0] * unit, L[1] * unit);
      g.stroke();
    }
    function redraw() {
      ctx2.setTransform(dpr(), 0, 0, dpr(), 0, 0);
      bg();
      st.strokes.forEach(drawStroke);
    }

    // マスごとの解答例の字と × 印
    function overlay() {
      if (!grid) return;
      const cells = [];
      const m = model ? chars(model) : [];
      const n = Math.max(m.length, ...st.marks.map((x) => x + 1), 0);
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / st.cols);
        if (r >= st.rows) break;
        const col = i % st.cols;
        const bad = st.marks.includes(i);
        cells.push(`<span class="ink-cell ${bad ? 'bad' : ''}" style="left:${col * unit}px;top:${r * unit}px;width:${unit}px;height:${unit}px;font-size:${unit * 0.74}px">${m[i] ? esc(m[i]) : ''}</span>`);
      }
      ov.innerHTML = cells.join('');
    }
    const esc = (s) => String(s).replace(/[&<>"]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x]));

    // ---------- 字数（インクの入ったマスの数） ----------
    function cellOf(s) {
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      s.pts.forEach((p) => { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
      const cx = Math.min(st.cols - 1, Math.max(0, Math.floor((x0 + x1) / 2)));
      const cy = Math.max(0, Math.floor((y0 + y1) / 2));
      return cy * st.cols + cx;
    }
    function count() {
      if (!grid) return st.strokes.length;
      return new Set(st.strokes.map(cellOf)).size;
    }
    function info() {
      const el = host.querySelector('.ink-info');
      if (el && o.info) el.textContent = o.info(count());
      if (o.onChange) o.onChange(count());
    }

    // ---------- 保存 ----------
    let t = 0;
    function persist() {
      if (!o.key) return;
      clearTimeout(t);
      t = setTimeout(() => put({ k: o.key, cols: st.cols, rows: st.rows, strokes: st.strokes, marks: st.marks, ratio: st.ratio, at: Date.now() }), 500);
    }

    // ---------- 入力 ----------
    const R = (v) => Math.round(v * 1000) / 1000;
    function pt(e) {
      const r = c.getBoundingClientRect();
      const p = e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5;
      return [R((e.clientX - r.left) / unit), R((e.clientY - r.top) / unit), Math.round(p * 100) / 100];
    }
    function hoverAt(e) {
      if (!grid) { hov.hidden = true; return; }
      const r = c.getBoundingClientRect();
      const col = Math.floor((e.clientX - r.left) / unit);
      const row = Math.floor((e.clientY - r.top) / unit);
      if (col < 0 || row < 0 || col >= st.cols || row >= st.rows) { hov.hidden = true; return; }
      hov.hidden = false;
      hov.style.cssText = `left:${col * unit}px;top:${row * unit}px;width:${unit}px;height:${unit}px`;
    }
    function eraseAt(p) {
      const near = (q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < (grid ? 0.18 : 1.6);
      const before = st.strokes.length;
      const kept = st.strokes.filter((s) => !s.pts.some(near));
      if (kept.length !== before) {
        undoStack.push(st.strokes);
        st.strokes = kept;
        redraw();
        info();
        persist();
      }
    }
    function markAt(p) {
      const i = Math.floor(p[1]) * st.cols + Math.floor(p[0]);
      const k = st.marks.indexOf(i);
      if (k >= 0) st.marks.splice(k, 1); else st.marks.push(i);
      overlay();
      persist();
      if (o.onMark) o.onMark(i, k < 0, model ? chars(model)[i] : '');
    }

    const capture = (e) => { try { c.setPointerCapture(e.pointerId); } catch (err) { /* 合成イベントなど */ } };
    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' && penSeen() && mode !== 'mark') {
        finger = { y: e.clientY, x: e.clientX, el: scroller(c) };
        capture(e);
        return;
      }
      if (e.pointerType === 'pen') setPen();
      e.preventDefault();
      const p = pt(e);
      if (mode === 'mark') { markAt(p); return; }
      capture(e);
      if (mode === 'erase') { cur = { erase: true }; eraseAt(p); return; }
      cur = { w: grid ? 0.075 : 0.42, pts: [p] };
      ctx2.strokeStyle = inkColor();
      ctx2.lineCap = 'round';
      ctx2.lineJoin = 'round';
    });
    c.addEventListener('pointermove', (e) => {
      if (finger) {
        const dy = e.clientY - finger.y;
        finger.y = e.clientY;
        if (finger.el) finger.el.scrollTop -= dy; else window.scrollBy(0, -dy);
        return;
      }
      if (e.pointerType === 'pen' || e.pointerType === 'mouse') hoverAt(e);
      if (!cur) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      (evs.length ? evs : [e]).forEach((ev) => {
        const p = pt(ev);
        if (cur.erase) { eraseAt(p); return; }
        const last = cur.pts[cur.pts.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) < (grid ? 0.004 : 0.05)) return;
        cur.pts.push(p);
        drawSeg(cur, cur.pts.length - 1);
      });
    });
    const end = () => {
      if (finger) { finger = null; return; }
      if (!cur) return;
      const s = cur;
      cur = null;
      if (s.erase) return;
      undoStack.push(st.strokes);
      st.strokes = [...st.strokes, s];
      // 最後の行まで書いたら行を足す
      if (grid && o.grow !== false) {
        const row = Math.floor(Math.max(...s.pts.map((q) => q[1])));
        if (row >= st.rows - 1) { st.rows += 2; layout(); }
      }
      redraw();
      info();
      persist();
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => { hov.hidden = true; });
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    function setMode(m) {
      mode = m;
      host.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
      paper.classList.toggle('marking', m === 'mark');
    }
    host.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.m)));
    host.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.a === 'undo') { if (undoStack.length) st.strokes = undoStack.pop(); } else if (st.strokes.length) {
        if (!confirm('Clear?')) return;
        undoStack.push(st.strokes);
        st.strokes = [];
      }
      redraw();
      info();
      persist();
    }));

    const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { if (host.isConnected) layout(); }) : null;
    const api = {
      el: host,
      count,
      strokes: () => st.strokes.length,
      cols: () => st.cols,
      marks: () => st.marks.slice(),
      reveal(text) {
        model = text || null;
        const mb = host.querySelector('.ink-markb');
        if (mb) mb.hidden = !model;
        if (model && grid) {
          const need = Math.ceil(chars(model).length / st.cols);
          if (need > st.rows) { st.rows = need; layout(); }
        }
        overlay();
        if (model && o.onMark) setMode('mark');
        if (!model && mode === 'mark') setMode('pen');
      },
      clear() { st.strokes = []; st.marks = []; redraw(); overlay(); info(); persist(); },
      setMode,
      ready: null,
    };
    api.ready = (async () => {
      const rec = o.key ? await load(o.key) : null;
      if (rec) {
        st.cols = rec.cols || st.cols;
        st.rows = Math.max(rec.rows || 1, st.rows);
        st.strokes = rec.strokes || [];
        st.marks = rec.marks || [];
      }
      layout();
      info();
      if (ro) ro.observe(host);
      return api;
    })();
    return api;
  }

  const ICON = {
    pen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/></svg>',
    erase: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 20h12"/><path d="M4.5 15.5l9-9 5 5-7.5 7.5H8z"/></svg>',
    undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7L4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 0 10h-3"/></svg>',
    clear: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg>',
    mark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  };

  // 原稿用紙。o: { key, cols, rows, cell, fixed, info(count), onChange(count), onMark(i, on, ch) }
  function grid(host, o = {}) { return surface(host, { ...o, kind: 'grid' }); }
  // メモ帳。o: { key, ratio }
  function pad(host, o = {}) { return surface(host, { ...o, kind: 'pad' }); }

  return { grid, pad, db, load, remove, penSeen, isHan: (ch) => HAN.test(ch), chars };
})();
