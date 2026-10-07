// 聞き取りのメモ帳（Apple Pencil の手書き）と、アプリ共通の IndexedDB。答えはすべてスクリブルで入力するので、マス目はない
// 書いた線は IndexedDB（level1 / ink）に保存する。座標はメモ帳の幅を単位にして、画面を回してもずれないようにする
window.Ink = (function () {
  'use strict';

  // ---------- 保存 ----------
  let dbp = null;
  let toastFn = null;
  function db() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        const r = indexedDB.open('level1', 4);
        r.onupgradeneeded = () => {
          const d = r.result;
          if (!d.objectStoreNames.contains('papers')) d.createObjectStore('papers', { keyPath: 'id' }); // 過去問
          if (!d.objectStoreNames.contains('ink')) d.createObjectStore('ink', { keyPath: 'k' }); // メモ帳の線
          if (!d.objectStoreNames.contains('pods')) d.createObjectStore('pods', { keyPath: 'id' }); // ポッドキャスト（原稿と音声）
          if (!d.objectStoreNames.contains('jz')) d.createObjectStore('jz', { keyPath: 'id' }); // 日文中訳ドリル（原文ストックと添削の記録）
        };
        // 古い版のアプリがほかのタブで開いていると、版を上げられずに止まる
        r.onblocked = () => { if (toastFn) toastFn('ほかのタブのアプリを閉じてください（データを新しい形に更新しています）'); };
        r.onsuccess = () => {
          const d = r.result;
          // 新しい版が開かれたら、こちらの接続を閉じて更新を止めない
          d.onversionchange = () => { d.close(); dbp = null; };
          res(d);
        };
        r.onerror = () => { dbp = null; rej(r.error); };
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

  // ---------- メモ帳（聞き取りのメモ。採点には使わない） ----------
  // o: { key, ratio, tools }
  function pad(host, o = {}) {
    const st = { strokes: [], ratio: o.ratio || 0.62 };
    let unit = 1; // 幅の 1/100（px）。座標はこの単位で持つので、画面を回してもずれない
    let mode = 'pen';
    let cur = null;
    let finger = null;
    const undoStack = [];

    host.classList.add('ink-host');
    host.innerHTML = `
      ${o.tools === false ? '' : `<div class="ink-tools">
        <button type="button" class="ink-b on" data-m="pen" aria-label="Pen">${ICON.pen}</button>
        <button type="button" class="ink-b" data-m="erase" aria-label="Eraser">${ICON.erase}</button>
        <button type="button" class="ink-b" data-a="undo" aria-label="Undo">${ICON.undo}</button>
        <button type="button" class="ink-b" data-a="clear" aria-label="Clear">${ICON.clear}</button>
      </div>`}
      <div class="ink-paper pad"><canvas class="ink-c"></canvas></div>`;
    const paper = host.querySelector('.ink-paper');
    const c = host.querySelector('canvas');
    const ctx2 = c.getContext('2d');
    const dpr = () => window.devicePixelRatio || 1;

    function layout() {
      const w = paper.clientWidth || host.clientWidth || 600;
      unit = w / 100;
      const h = w * st.ratio;
      paper.style.height = `${h}px`;
      c.width = Math.round(w * dpr());
      c.height = Math.round(h * dpr());
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
      redraw();
    }
    // 罫線
    function bg() {
      const g = ctx2;
      const W = c.width / dpr();
      const H = c.height / dpr();
      g.clearRect(0, 0, W, H);
      g.lineWidth = 1;
      g.strokeStyle = getComputedStyle(host).getPropertyValue('--grid').trim() || '#e2b8ad';
      g.beginPath();
      for (let y = unit * 8; y < H; y += unit * 8) { g.moveTo(0, Math.round(y) + 0.5); g.lineTo(W, Math.round(y) + 0.5); }
      g.stroke();
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

    let t = 0;
    function persist() {
      if (!o.key) return;
      clearTimeout(t);
      t = setTimeout(() => put({ k: o.key, strokes: st.strokes, ratio: st.ratio, at: Date.now() }), 500);
    }

    // ---------- 入力：Pencil で書く。一度 Pencil を使ったら、指はスクロールにする（手のひらの誤反応を防ぐ） ----------
    const R = (v) => Math.round(v * 1000) / 1000;
    function pt(e) {
      const r = c.getBoundingClientRect();
      const p = e.pointerType === 'pen' ? (e.pressure || 0.5) : 0.5;
      return [R((e.clientX - r.left) / unit), R((e.clientY - r.top) / unit), Math.round(p * 100) / 100];
    }
    function eraseAt(p) {
      const near = (q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1.6;
      const kept = st.strokes.filter((s) => !s.pts.some(near));
      if (kept.length !== st.strokes.length) {
        undoStack.push(st.strokes);
        st.strokes = kept;
        redraw();
        persist();
      }
    }
    const capture = (e) => { try { c.setPointerCapture(e.pointerId); } catch (err) { /* 合成イベントなど */ } };
    // 指（スクロール）とペン（線）は pointerId で分けて扱う。書いている途中に手のひらが触れても、線は途切れない
    c.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' && (penSeen() || cur)) {
        if (cur) return; // ペンで書いている最中の指・手のひらは無視する
        finger = { id: e.pointerId, y: e.clientY, el: scroller(c) };
        capture(e);
        return;
      }
      if (cur) return; // 書いている最中に別のペン・マウスが来ても、今の線を優先する
      if (e.pointerType === 'pen') setPen();
      e.preventDefault();
      const p = pt(e);
      capture(e);
      if (mode === 'erase') { cur = { id: e.pointerId, erase: true }; eraseAt(p); return; }
      cur = { id: e.pointerId, w: 0.42, pts: [p] };
      ctx2.strokeStyle = inkColor();
      ctx2.lineCap = 'round';
      ctx2.lineJoin = 'round';
    });
    c.addEventListener('pointermove', (e) => {
      if (finger && e.pointerId === finger.id) {
        const dy = e.clientY - finger.y;
        finger.y = e.clientY;
        if (finger.el) finger.el.scrollTop -= dy; else window.scrollBy(0, -dy);
        return;
      }
      if (!cur || e.pointerId !== cur.id) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      (evs.length ? evs : [e]).forEach((ev) => {
        const p = pt(ev);
        if (cur.erase) { eraseAt(p); return; }
        const last = cur.pts[cur.pts.length - 1];
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.05) return;
        cur.pts.push(p);
        drawSeg(cur, cur.pts.length - 1);
      });
    });
    const end = (e) => {
      if (finger && e.pointerId === finger.id) { finger = null; return; }
      if (!cur || e.pointerId !== cur.id) return;
      const s = cur;
      cur = null;
      if (s.erase) return;
      delete s.id;
      undoStack.push(st.strokes);
      st.strokes = [...st.strokes, s];
      redraw();
      persist();
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    host.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.m;
      host.querySelectorAll('[data-m]').forEach((x) => x.classList.toggle('on', x.dataset.m === mode));
    }));
    host.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.a === 'undo') { if (undoStack.length) st.strokes = undoStack.pop(); } else if (st.strokes.length) {
        if (!confirm('Clear?')) return;
        undoStack.push(st.strokes);
        st.strokes = [];
      }
      redraw();
      persist();
    }));

    const ro = 'ResizeObserver' in window ? new ResizeObserver(() => { if (host.isConnected) layout(); }) : null;
    const api = { el: host, strokes: () => st.strokes.length, ready: null };
    api.ready = (async () => {
      const rec = o.key ? await load(o.key) : null;
      if (rec) st.strokes = rec.strokes || [];
      layout();
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
  };

  // バックアップ：メモ帳の線をすべて書き出す・戻す（Settings の Export / Import）
  async function exportAll() {
    try {
      const d = await db();
      return await new Promise((res) => { const q = d.transaction('ink').objectStore('ink').getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); });
    } catch (e) { return []; }
  }
  async function importAll(list) {
    if (!Array.isArray(list) || !list.length) return 0;
    try {
      const d = await db();
      await new Promise((res, rej) => { const tx = d.transaction('ink', 'readwrite'); list.forEach((r) => r && r.k && tx.objectStore('ink').put(r)); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
      return list.length;
    } catch (e) { return 0; }
  }

  return { pad, db, exportAll, importAll, isHan: (ch) => HAN.test(ch), chars, onToast: (f) => { toastFn = f; } };
})();
